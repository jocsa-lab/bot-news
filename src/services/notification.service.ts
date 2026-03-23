import { config, isTelegramConfigured } from '../utils/config';

function getTelegramApi(): string {
  return `https://api.telegram.org/bot${config.telegramBotToken}`;
}

export async function notifyTelegram(data: {
  topic: string;
  titulo: string;
  resumo: string;
  contentId: string;
  contradictions: boolean;
}): Promise<void> {
  if (!isTelegramConfigured()) {
    console.log('[telegram] Skipped (not configured)');
    return;
  }

  const message = [
    '📋 <b>Novo conteúdo gerado</b>',
    `📌 Tema: ${escapeHtml(data.topic)}`,
    `✍️ Título: ${escapeHtml(data.titulo)}`,
    '',
    `${escapeHtml(data.resumo.slice(0, 300))}...`,
    '',
    `⚠️ Contradições: ${data.contradictions ? 'sim' : 'não'}`,
  ].join('\n');

  const inlineKeyboard = {
    inline_keyboard: [
      [
        { text: '✅ Aprovar', callback_data: JSON.stringify({ action: 'approve', contentId: data.contentId }) },
        { text: '❌ Rejeitar', callback_data: JSON.stringify({ action: 'reject', contentId: data.contentId }) },
      ],
    ],
  };

  const res = await fetch(`${getTelegramApi()}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: config.telegramChatId,
      text: message,
      parse_mode: 'HTML',
      reply_markup: inlineKeyboard,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram sendMessage failed (${res.status}): ${body}`);
  }
}

export async function notifyTelegramText(text: string): Promise<void> {
  if (!isTelegramConfigured()) {
    console.log('[telegram] Skipped (not configured)');
    return;
  }

  const res = await fetch(`${getTelegramApi()}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: config.telegramChatId,
      text,
      parse_mode: 'HTML',
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram sendMessage failed (${res.status}): ${body}`);
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
