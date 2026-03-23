import { config } from '../utils/config';
import { LLMResponse } from '../types';

const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const TIMEOUT_MS = 30_000;

interface ClaudeResponse {
  content?: Array<{ type: string; text?: string }>;
  error?: { message: string };
}

async function callWithRetry(prompt: string, attempt = 1): Promise<Response> {
  const body = {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    thinking: { type: 'enabled', budget_tokens: 3072 },
    messages: [{ role: 'user', content: prompt }],
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': config.anthropicApiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok && attempt < 2) {
      await new Promise((r) => setTimeout(r, 2000));
      return callWithRetry(prompt, attempt + 1);
    }

    return res;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('[Claude] Timeout: sem resposta em 30s');
    }
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`[Claude] Falha na conexao: ${msg}`);
  } finally {
    clearTimeout(timeout);
  }
}

export async function generate(prompt: string): Promise<LLMResponse> {
  const res = await callWithRetry(prompt);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claude API error (${res.status}): ${text}`);
  }

  const json = (await res.json()) as ClaudeResponse;

  if (json.error) {
    throw new Error(`Claude API error: ${json.error.message}`);
  }

  const text = json.content
    ?.filter((b) => b.type === 'text' && b.text)
    .map((b) => b.text)
    .join('');

  if (!text) {
    throw new Error('Claude returned empty response');
  }

  const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  return JSON.parse(cleaned) as LLMResponse;
}
