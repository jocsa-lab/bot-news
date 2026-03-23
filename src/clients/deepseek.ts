import { config } from '../utils/config';
import { LLMResponse } from '../types';

const ENDPOINT = 'https://api.deepinfra.com/v1/openai/chat/completions';
const TIMEOUT_MS = 30_000;

interface DeepSeekResponse {
  choices?: Array<{
    message?: { content?: string };
  }>;
  error?: { message: string };
}

async function callWithRetry(prompt: string, attempt = 1): Promise<Response> {
  const body = {
    model: 'deepseek-ai/DeepSeek-R1',
    messages: [{ role: 'user', content: prompt }],
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.deepseekApiKey}`,
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
      throw new Error('[DeepSeek] Timeout: sem resposta em 30s');
    }
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`[DeepSeek] Falha na conexao: ${msg}`);
  } finally {
    clearTimeout(timeout);
  }
}

export async function generate(prompt: string): Promise<LLMResponse> {
  const res = await callWithRetry(prompt);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DeepSeek API error (${res.status}): ${text}`);
  }

  const json = (await res.json()) as DeepSeekResponse;

  if (json.error) {
    throw new Error(`DeepSeek API error: ${json.error.message}`);
  }

  const text = json.choices?.[0]?.message?.content;

  if (!text) {
    throw new Error('DeepSeek returned empty response');
  }

  const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  return JSON.parse(cleaned) as LLMResponse;
}
