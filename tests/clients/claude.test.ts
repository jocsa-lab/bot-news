import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/utils/config', () => ({
  config: { anthropicApiKey: 'test-key' },
}));

const VALID_RESPONSE = {
  pontos: [
    { titulo: 'Claude Teste', resumo: 'Resumo via Claude Haiku.', tipo: 'opiniao' },
  ],
  fontes: ['https://example.com'],
  confianca: 'baixa',
};

describe('claude client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should parse a successful response', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        content: [
          { type: 'thinking', thinking: 'internal thought' },
          { type: 'text', text: JSON.stringify(VALID_RESPONSE) },
        ],
      }),
    };

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    const { generate } = await import('../../src/clients/claude');
    const result = await generate('test prompt');

    expect(result.pontos[0].tipo).toBe('opiniao');
    expect(result.confianca).toBe('baixa');
  });

  it('should filter out thinking blocks', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        content: [
          { type: 'thinking', thinking: 'reasoning...' },
          { type: 'text', text: JSON.stringify(VALID_RESPONSE) },
        ],
      }),
    };

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    const { generate } = await import('../../src/clients/claude');
    const result = await generate('test prompt');

    expect(result.pontos).toHaveLength(1);
  });

  it('should throw on API error', async () => {
    const mockResponse = {
      ok: false,
      status: 401,
      text: async () => 'unauthorized',
    };

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    const { generate } = await import('../../src/clients/claude');
    await expect(generate('test')).rejects.toThrow('Claude API error (401)');
  });
});
