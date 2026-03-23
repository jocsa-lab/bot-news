import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock config before importing the client
vi.mock('../../src/utils/config', () => ({
  config: { geminiApiKey: 'test-key' },
}));

const VALID_RESPONSE = {
  pontos: [
    { titulo: 'Teste', resumo: 'Um resumo de teste.', tipo: 'fato' },
  ],
  fontes: ['https://example.com'],
  confianca: 'alta',
};

describe('gemini client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should parse a successful response', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        candidates: [
          { content: { parts: [{ text: JSON.stringify(VALID_RESPONSE) }] } },
        ],
      }),
    };

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    const { generate } = await import('../../src/clients/gemini');
    const result = await generate('test prompt');

    expect(result.pontos).toHaveLength(1);
    expect(result.pontos[0].titulo).toBe('Teste');
    expect(result.confianca).toBe('alta');
  });

  it('should throw on empty response', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [] } }] }),
    };

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    const { generate } = await import('../../src/clients/gemini');
    await expect(generate('test')).rejects.toThrow('empty response');
  });

  it('should throw on API error', async () => {
    const mockResponse = {
      ok: false,
      status: 429,
      text: async () => 'rate limited',
    };

    // Both retry attempts fail
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    const { generate } = await import('../../src/clients/gemini');
    await expect(generate('test')).rejects.toThrow('Gemini API error (429)');
  });
});
