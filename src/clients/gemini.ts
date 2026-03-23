import { config } from '../utils/config';
import { LLMResponse } from '../types';

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const ENDPOINT_PRO = `${BASE_URL}/gemini-2.5-pro:generateContent`;
const ENDPOINT_FLASH = `${BASE_URL}/gemini-2.5-flash:generateContent`;
const TIMEOUT_MS = 30_000;

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  error?: { message: string };
}

async function callWithRetry(
  prompt: string,
  options: { endpoint: string; thinkingBudget: number },
  attempt = 1,
): Promise<Response> {
  const url = `${options.endpoint}?key=${config.geminiApiKey}`;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      thinkingConfig: { thinkingBudget: options.thinkingBudget },
    },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok && attempt < 2) {
      await new Promise((r) => setTimeout(r, 2000));
      return callWithRetry(prompt, options, attempt + 1);
    }

    return res;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('[Gemini] Timeout: sem resposta em 30s');
    }
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`[Gemini] Falha na conexao: ${msg}`);
  } finally {
    clearTimeout(timeout);
  }
}

function extractText(json: GeminiResponse): string {
  const text = json.candidates?.[0]?.content?.parts
    ?.filter((p) => p.text)
    .map((p) => p.text)
    .join('');

  if (!text) {
    throw new Error('Gemini returned empty response');
  }

  return text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
}

export async function generate(prompt: string): Promise<LLMResponse> {
  const res = await callWithRetry(prompt, {
    endpoint: ENDPOINT_PRO,
    thinkingBudget: 4096,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${text}`);
  }

  const json = (await res.json()) as GeminiResponse;

  if (json.error) {
    throw new Error(`Gemini API error: ${json.error.message}`);
  }

  return JSON.parse(extractText(json)) as LLMResponse;
}

export async function consolidate(prompt: string): Promise<string> {
  const res = await callWithRetry(prompt, {
    endpoint: ENDPOINT_FLASH,
    thinkingBudget: 2048,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini Flash API error (${res.status}): ${text}`);
  }

  const json = (await res.json()) as GeminiResponse;

  if (json.error) {
    throw new Error(`Gemini Flash API error: ${json.error.message}`);
  }

  return extractText(json);
}
