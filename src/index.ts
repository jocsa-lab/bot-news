import * as http from 'http';
import { config } from './utils/config';
import { TelegramCallbackData, ConsolidationResult } from './types';
import { getRowByIndex, updateFinalStatus } from './clients/sheets';
import { notifyTelegramText } from './services/notification.service';
import { generatePostImage, generateCarouselImages } from './services/image.service';
import { publishToInstagram, publishCarousel, refreshMetaToken } from './services/instagram.service';
import { generateFromAllSources } from './services/generation.service';
import { consolidateContent } from './services/consolidation.service';

const PORT = parseInt(process.env.PORT || '8080', 10);

// --- Orchestrator: post-approval flow ---

export async function onApproval(sheetRow: number): Promise<void> {
  try {
    // 1. Read consolidated data from Sheets
    const row = await getRowByIndex(sheetRow);
    if (!row || !row.consolidatedJson) {
      throw new Error(`Row ${sheetRow} not found or has no consolidated data`);
    }

    const consolidated: ConsolidationResult = JSON.parse(row.consolidatedJson);

    // 2. Generate carousel images
    const images = await generateCarouselImages({
      titulo: consolidated.titulo_post,
      topicos: consolidated.topicos,
      hashtags: consolidated.hashtags,
    });

    // 3. Publish to Instagram
    let postId: string;
    if (images.length === 1) {
      const result = await publishToInstagram({
        imageBuffer: images[0],
        caption: consolidated.texto_final,
        hashtags: consolidated.hashtags,
      });
      postId = result.postId;
    } else {
      const result = await publishCarousel({
        images,
        caption: consolidated.texto_final,
        hashtags: consolidated.hashtags,
      });
      postId = result.postId;
    }

    // 4. Update Sheets: mark as published
    await updateFinalStatus(sheetRow, 'publicado', postId);

    // 5. Notify success
    await notifyTelegramText(
      `✅ <b>Publicado com sucesso!</b>\n📊 Linha: #${sheetRow}\n📱 Post ID: ${postId}`,
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`onApproval failed for row ${sheetRow}:`, msg);

    // Update Sheets with error status
    await updateFinalStatus(sheetRow, 'erro_publicacao').catch(console.error);

    // Notify error on Telegram
    await notifyTelegramText(
      `❌ <b>Erro ao publicar</b>\n📊 Linha: #${sheetRow}\n🐛 ${msg}`,
    ).catch(console.error);

    throw error;
  }
}

// --- Content generation pipeline (called by Cloud Scheduler) ---

async function handleGenerate(): Promise<{ status: number; body: string }> {
  try {
    const topic = 'tecnologia e inovação';
    console.log(`[generate] Starting generation for topic: ${topic}`);

    // Step 1: Generate from all LLM sources
    const result = await generateFromAllSources(topic);
    const successCount = [result.gemini, result.deepseek, result.claude].filter(
      (r) => r.success,
    ).length;

    if (successCount === 0) {
      await notifyTelegramText('❌ <b>Geração falhou</b>: nenhuma fonte LLM respondeu.');
      return { status: 500, body: JSON.stringify({ error: 'All LLM sources failed' }) };
    }

    // Step 2: Consolidate generated content
    const consolidated = await consolidateContent();
    console.log(`[generate] Consolidated ${consolidated} rows`);

    // Step 3: Notify via Telegram for approval
    await notifyTelegramText(
      `📰 <b>Conteúdo gerado!</b>\n🤖 Fontes: ${successCount}/3\n📝 Consolidados: ${consolidated}\nAguardando aprovação no Telegram.`,
    );

    return {
      status: 200,
      body: JSON.stringify({ success: true, sources: successCount, consolidated }),
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[generate] Pipeline error:', msg);
    await notifyTelegramText(`❌ <b>Erro no pipeline</b>\n🐛 ${msg}`).catch(console.error);
    return { status: 500, body: JSON.stringify({ error: msg }) };
  }
}

// --- Meta token refresh (called by Cloud Scheduler monthly) ---

async function handleRefreshToken(): Promise<{ status: number; body: string }> {
  try {
    console.log('[refresh-token] Refreshing Meta access token...');
    const newToken = await refreshMetaToken();
    console.log('[refresh-token] Token refreshed successfully');
    await notifyTelegramText('🔑 <b>Meta token renovado</b> com sucesso.').catch(console.error);
    return { status: 200, body: JSON.stringify({ success: true }) };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[refresh-token] Failed:', msg);
    await notifyTelegramText(`❌ <b>Erro ao renovar token Meta</b>\n🐛 ${msg}`).catch(console.error);
    return { status: 500, body: JSON.stringify({ error: msg }) };
  }
}

// --- HTTP Server ---

function parseBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

async function handleTelegramWebhook(body: string): Promise<{ status: number; body: string }> {
  try {
    const update = JSON.parse(body);

    if (!update.callback_query) {
      return { status: 200, body: 'ok' };
    }

    const callbackData: TelegramCallbackData = JSON.parse(update.callback_query.data);

    // Answer callback to remove loading state in Telegram
    await fetch(
      `https://api.telegram.org/bot${config.telegramBotToken}/answerCallbackQuery`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: update.callback_query.id }),
      },
    );

    if (callbackData.action === 'approve') {
      await updateFinalStatus(callbackData.sheetRow, 'pronto');
      await notifyTelegramText(`⏳ Processando publicação da linha #${callbackData.sheetRow}...`);
      // Run approval flow async to not block the webhook response
      onApproval(callbackData.sheetRow).catch(console.error);
    } else if (callbackData.action === 'reject') {
      await updateFinalStatus(callbackData.sheetRow, 'rejeitado');
      await notifyTelegramText(`🚫 Conteúdo da linha #${callbackData.sheetRow} rejeitado.`);
    }

    return { status: 200, body: 'ok' };
  } catch (error) {
    console.error('Telegram webhook error:', error);
    return { status: 200, body: 'ok' }; // Always 200 to avoid Telegram retries
  }
}

const server = http.createServer(async (req, res) => {
  const url = req.url ?? '';
  const method = req.method ?? '';

  // POST /generate — triggered by Cloud Scheduler
  if (method === 'POST' && url === '/generate') {
    const result = await handleGenerate();
    res.writeHead(result.status, { 'Content-Type': 'application/json' });
    res.end(result.body);
    return;
  }

  // POST /refresh-token — triggered by Cloud Scheduler monthly
  if (method === 'POST' && url === '/refresh-token') {
    const result = await handleRefreshToken();
    res.writeHead(result.status, { 'Content-Type': 'application/json' });
    res.end(result.body);
    return;
  }

  // POST /webhook/telegram — Telegram bot callbacks
  if (method === 'POST' && url === '/webhook/telegram') {
    const body = await parseBody(req);
    const result = await handleTelegramWebhook(body);
    res.writeHead(result.status, { 'Content-Type': 'text/plain' });
    res.end(result.body);
    return;
  }

  // GET /health — health check
  if (method === 'GET' && url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export { server };
