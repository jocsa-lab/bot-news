import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { config, isInstagramConfigured, isTelegramConfigured } from './utils/config';
import { TelegramCallbackData, ConsolidationResult } from './types';
import { getRowById, updateFinalStatus, getRecentContents } from './clients/mongodb';
import { notifyTelegramText } from './services/notification.service';
import { generateCarouselImages } from './services/image.service';
import { generateFromAllSources } from './services/generation.service';
import { consolidateContent } from './services/consolidation.service';
import { checkAuth, sendUnauthorized } from './middleware/auth';
import { checkRateLimit, sendRateLimited } from './middleware/rate-limit';
import type { TimeRange } from './prompts/prompt-01-geracao';

const PORT = parseInt(process.env.PORT || '8080', 10);

const DASHBOARD_DIR = path.resolve(__dirname, '..', 'dashboard', 'dist');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function serveStatic(res: http.ServerResponse, filePath: string): boolean {
  try {
    const resolved = path.resolve(DASHBOARD_DIR, filePath);
    if (!resolved.startsWith(DASHBOARD_DIR)) return false;
    if (!fs.existsSync(resolved)) return false;
    const ext = path.extname(resolved);
    const mime = MIME_TYPES[ext] || 'application/octet-stream';
    const content = fs.readFileSync(resolved);
    res.writeHead(200, { 'Content-Type': mime });
    res.end(content);
    return true;
  } catch {
    return false;
  }
}

// --- Orchestrator: post-approval flow (Instagram optional) ---

export async function onApproval(contentId: string): Promise<void> {
  try {
    const doc = await getRowById(contentId);
    if (!doc || !doc.consolidatedJson) {
      throw new Error(`Content ${contentId} not found or has no consolidated data`);
    }

    const consolidated: ConsolidationResult = JSON.parse(doc.consolidatedJson);

    if (!isInstagramConfigured()) {
      await updateFinalStatus(contentId, 'publicado');
      console.log(`[approval] Content ${contentId} marked as published (Instagram not configured)`);
      return;
    }

    const { publishToInstagram, publishCarousel } = await import('./services/instagram.service');

    const images = await generateCarouselImages({
      titulo: consolidated.titulo_post,
      topicos: consolidated.topicos,
      hashtags: consolidated.hashtags,
    });

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

    await updateFinalStatus(contentId, 'publicado', postId);
    await notifyTelegramText(`✅ <b>Publicado com sucesso!</b>\n📱 Post ID: ${postId}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`onApproval failed for ${contentId}:`, msg);
    await updateFinalStatus(contentId, 'erro_publicacao').catch(console.error);
    await notifyTelegramText(`❌ <b>Erro ao publicar</b>\n🐛 ${msg}`).catch(console.error);
    throw error;
  }
}

// --- Generate content (cron or dashboard) ---

async function handleGenerate(topic: string, range: TimeRange): Promise<{ status: number; body: string }> {
  try {
    console.log(`[generate] topic="${topic}" range="${range}"`);

    const result = await generateFromAllSources(topic, range);
    const successCount = [result.gemini, result.deepseek, result.claude].filter(
      (r) => r.success,
    ).length;

    if (successCount === 0) {
      await notifyTelegramText('❌ <b>Geração falhou</b>: nenhuma fonte LLM respondeu.').catch(console.error);
      return { status: 500, body: JSON.stringify({ error: 'All LLM sources failed' }) };
    }

    const consolidated = await consolidateContent();
    console.log(`[generate] Consolidated ${consolidated} rows`);

    await notifyTelegramText(
      `📰 <b>Conteúdo gerado!</b>\n🤖 Fontes: ${successCount}/3\n📝 Consolidados: ${consolidated}`,
    ).catch(console.error);

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

// --- Meta token refresh ---

async function handleRefreshToken(): Promise<{ status: number; body: string }> {
  if (!isInstagramConfigured()) {
    return { status: 200, body: JSON.stringify({ skipped: true, reason: 'Instagram not configured' }) };
  }
  try {
    const { refreshMetaToken } = await import('./services/instagram.service');
    console.log('[refresh-token] Refreshing Meta access token...');
    await refreshMetaToken();
    console.log('[refresh-token] Token refreshed successfully');
    return { status: 200, body: JSON.stringify({ success: true }) };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[refresh-token] Failed:', msg);
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
  if (!isTelegramConfigured()) {
    return { status: 200, body: 'ok' };
  }
  try {
    const update = JSON.parse(body);
    if (!update.callback_query) return { status: 200, body: 'ok' };

    const callbackData: TelegramCallbackData = JSON.parse(update.callback_query.data);

    await fetch(`https://api.telegram.org/bot${config.telegramBotToken}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: update.callback_query.id }),
    });

    if (callbackData.action === 'approve') {
      await updateFinalStatus(callbackData.contentId, 'pronto');
      await notifyTelegramText(`⏳ Processando publicação...`);
      onApproval(callbackData.contentId).catch(console.error);
    } else if (callbackData.action === 'reject') {
      await updateFinalStatus(callbackData.contentId, 'rejeitado');
      await notifyTelegramText(`🚫 Conteúdo rejeitado.`);
    }

    return { status: 200, body: 'ok' };
  } catch (error) {
    console.error('Telegram webhook error:', error);
    return { status: 200, body: 'ok' };
  }
}

const VALID_RANGES = new Set(['hoje', 'semana', 'mes']);

const server = http.createServer(async (req, res) => {
  const rawUrl = req.url ?? '';
  const method = req.method ?? '';

  if (!checkRateLimit(req)) {
    sendRateLimited(res);
    return;
  }

  // --- Public routes ---

  // POST /generate — cron trigger (default topic)
  if (method === 'POST' && rawUrl === '/generate') {
    const result = await handleGenerate('tecnologia e inovação', 'hoje');
    res.writeHead(result.status, { 'Content-Type': 'application/json' });
    res.end(result.body);
    return;
  }

  // POST /refresh-token
  if (method === 'POST' && rawUrl === '/refresh-token') {
    const result = await handleRefreshToken();
    res.writeHead(result.status, { 'Content-Type': 'application/json' });
    res.end(result.body);
    return;
  }

  // POST /webhook/telegram
  if (method === 'POST' && rawUrl === '/webhook/telegram') {
    const body = await parseBody(req);
    const result = await handleTelegramWebhook(body);
    res.writeHead(result.status, { 'Content-Type': 'text/plain' });
    res.end(result.body);
    return;
  }

  // GET /health
  if (method === 'GET' && rawUrl === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
    return;
  }

  // --- Protected routes ---

  if (rawUrl.startsWith('/dashboard') || rawUrl.startsWith('/api/') || rawUrl === '/') {
    if (!checkAuth(req)) {
      sendUnauthorized(res);
      return;
    }
  }

  // GET / → dashboard
  if (method === 'GET' && rawUrl === '/') {
    res.writeHead(302, { Location: '/dashboard/' });
    res.end();
    return;
  }

  // GET /dashboard/*
  if (method === 'GET' && rawUrl.startsWith('/dashboard')) {
    const filePath = rawUrl.replace('/dashboard', '').replace(/^\//, '') || 'index.html';
    if (serveStatic(res, filePath)) return;
    if (serveStatic(res, 'index.html')) return;
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Dashboard not found');
    return;
  }

  // POST /api/generate — dashboard-triggered generation
  if (method === 'POST' && rawUrl === '/api/generate') {
    try {
      const body = JSON.parse(await parseBody(req));
      const topic = (body.topic || 'tecnologia e inovação').trim();
      const range: TimeRange = VALID_RANGES.has(body.range) ? body.range : 'hoje';
      const result = await handleGenerate(topic, range);
      res.writeHead(result.status, { 'Content-Type': 'application/json' });
      res.end(result.body);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: msg }));
    }
    return;
  }

  // POST /api/contents/:id/approve — dashboard approve
  const approveMatch = rawUrl.match(/^\/api\/contents\/([a-f0-9]{24})\/approve$/);
  if (method === 'POST' && approveMatch) {
    try {
      await updateFinalStatus(approveMatch[1], 'pronto');
      onApproval(approveMatch[1]).catch(console.error);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to approve' }));
    }
    return;
  }

  // GET /api/contents
  if (method === 'GET' && rawUrl.startsWith('/api/contents') && !rawUrl.includes('/delete') && !rawUrl.includes('/approve')) {
    try {
      const parsed = new URL(rawUrl, 'http://localhost');
      const limit = parseInt(parsed.searchParams.get('limit') || '50', 10);
      const includeDeleted = parsed.searchParams.get('includeDeleted') === 'true';
      const docs = await getRecentContents(limit, includeDeleted);
      const serialized = docs.map(d => ({ ...d, _id: d._id?.toHexString() }));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(serialized));
    } catch {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to fetch contents' }));
    }
    return;
  }

  // PATCH /api/contents/:id/delete
  const deleteMatch = rawUrl.match(/^\/api\/contents\/([a-f0-9]{24})\/delete$/);
  if (method === 'PATCH' && deleteMatch) {
    try {
      await updateFinalStatus(deleteMatch[1], 'apagado');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to delete' }));
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export { server };
