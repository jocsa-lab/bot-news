import { config } from '../utils/config';

const TELEGRAM_API = `https://api.telegram.org/bot${config.telegramBotToken}`;

export async function notifyTelegram(data: {
  topic: string;
  titulo: string;
  resumo: string;
  sheetRow: number;
  contradictions: boolean;
}): Promise<void> {
  const sheetsUrl = `https://docs.google.com/spreadsheets/d/${config.googleSheetsId}/edit#gid=0&range=A${data.sheetRow}`;

  const message = [
    '📋 <b>Novo conteúdo gerado</b>',
    `📌 Tema: ${escapeHtml(data.topic)}`,
    `✍️ Título: ${escapeHtml(data.titulo)}`,
    '',
    `${escapeHtml(data.resumo.slice(0, 300))}...`,
    '',
    `⚠️ Contradições: ${data.contradictions ? 'sim' : 'não'}`,
    `📊 Linha: #${data.sheetRow}`,
  ].join('\n');

  const inlineKeyboard = {
    inline_keyboard: [
      [
        { text: '✅ Aprovar', callback_data: JSON.stringify({ action: 'approve', sheetRow: data.sheetRow }) },
        { text: '❌ Rejeitar', callback_data: JSON.stringify({ action: 'reject', sheetRow: data.sheetRow }) },
      ],
      [
        { text: '✏️ Editar no Sheets', url: sheetsUrl },
      ],
    ],
  };

  const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
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
  const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
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
