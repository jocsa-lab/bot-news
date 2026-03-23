import { describe, it, expect, vi, beforeEach } from 'vitest';

const MOCK_DATA = {
  pontos: [{ titulo: 'Test', resumo: 'Test resumo.', tipo: 'fato' as const }],
  fontes: ['https://example.com'],
  confianca: 'alta' as const,
};

vi.mock('../../src/clients/gemini', () => ({
  generate: vi.fn().mockResolvedValue(MOCK_DATA),
}));

vi.mock('../../src/clients/deepseek', () => ({
  generate: vi.fn().mockResolvedValue(MOCK_DATA),
}));

vi.mock('../../src/clients/claude', () => ({
  generate: vi.fn().mockResolvedValue(MOCK_DATA),
}));

vi.mock('../../src/clients/sheets', () => ({
  appendGenerationRow: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/utils/config', () => ({
  config: {},
}));

describe('generation service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should return results from all 3 sources', async () => {
    const { generateFromAllSources } = await import('../../src/services/generation.service');
    const result = await generateFromAllSources('AI news');

    expect(result.gemini.success).toBe(true);
    expect(result.deepseek.success).toBe(true);
    expect(result.claude.success).toBe(true);
    expect(result.timestamp).toBeDefined();
  });

  it('should handle partial failures gracefully', async () => {
    const deepseek = await import('../../src/clients/deepseek');
    vi.mocked(deepseek.generate).mockRejectedValue(new Error('timeout'));

    const { generateFromAllSources } = await import('../../src/services/generation.service');
    const result = await generateFromAllSources('AI news');

    expect(result.gemini.success).toBe(true);
    expect(result.deepseek.success).toBe(false);
    expect(result.deepseek.error).toBe('timeout');
    expect(result.claude.success).toBe(true);
  });
});
