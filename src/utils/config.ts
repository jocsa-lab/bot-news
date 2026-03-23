function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

export const config = {
  // LLM APIs
  geminiApiKey: required('GEMINI_API_KEY'),
  deepseekApiKey: required('DEEPSEEK_API_KEY'),
  anthropicApiKey: required('ANTHROPIC_API_KEY'),

  // MongoDB
  mongodbUri: required('MONGODB_URI'),

  // Meta / Instagram (optional plugin)
  metaAppId: optional('META_APP_ID', ''),
  metaAppSecret: optional('META_APP_SECRET', ''),
  metaAccessToken: optional('META_ACCESS_TOKEN', ''),
  instagramAccountId: optional('INSTAGRAM_ACCOUNT_ID', ''),

  // Telegram (optional)
  telegramBotToken: optional('TELEGRAM_BOT_TOKEN', ''),
  telegramChatId: optional('TELEGRAM_CHAT_ID', ''),

  // GCP
  gcpProjectId: optional('GCP_PROJECT_ID', ''),
  gcpRegion: optional('GCP_REGION', 'southamerica-east1'),

  // Dashboard auth
  dashboardUser: optional('DASHBOARD_USER', 'admin'),
  dashboardPass: optional('DASHBOARD_PASS', ''),

  // Scheduling
  schedulerTimezone: optional('SCHEDULER_TIMEZONE', 'America/Sao_Paulo'),
  morningSchedule: optional('MORNING_SCHEDULE', '0 8 * * *'),
  eveningSchedule: optional('EVENING_SCHEDULE', '0 18 * * *'),
} as const;

export function isInstagramConfigured(): boolean {
  return !!(config.metaAppId && config.metaAppSecret && config.metaAccessToken && config.instagramAccountId);
}

export function isTelegramConfigured(): boolean {
  return !!(config.telegramBotToken && config.telegramChatId);
}
