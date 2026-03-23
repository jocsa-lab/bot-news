import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/utils/config', () => ({
  config: { deepseekApiKey: 'test-key' },
}));

const VALID_RESPONSE = {
  pontos: [
    { titulo: 'DeepSeek Teste', resumo: 'Resumo via DeepSeek.', tipo: 'tendencia' },
  ],
  fontes: ['https://example.com'],
  confianca: 'media',
};

describe('deepseek client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should parse a successful response', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(VALID_RESPONSE) } }],
      }),
    };

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    const { generate } = await import('../../src/clients/deepseek');
    const result = await generate('test prompt');

    expect(result.pontos[0].tipo).toBe('tendencia');
    expect(result.confianca).toBe('media');
  });

  it('should strip markdown fences from response', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '```json\n' + JSON.stringify(VALID_RESPONSE) + '\n```' } }],
      }),
    };

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    const { generate } = await import('../../src/clients/deepseek');
    const result = await generate('test prompt');

    expect(result.pontos).toHaveLength(1);
  });

  it('should throw on empty response', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({ choices: [{ message: {} }] }),
    };

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    const { generate } = await import('../../src/clients/deepseek');
    await expect(generate('test')).rejects.toThrow('empty response');
  });
});
