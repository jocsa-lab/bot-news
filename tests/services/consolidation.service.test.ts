import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConsolidationResult } from '../../src/types';
import { ContentDocument } from '../../src/clients/mongodb';
import { ObjectId } from 'mongodb';

vi.mock('../../src/utils/config', () => ({
  config: { geminiApiKey: 'test-key', deepseekApiKey: 'test-key' },
}));

vi.mock('../../src/clients/gemini', () => ({
  consolidate: vi.fn(),
  generate: vi.fn(),
}));

vi.mock('../../src/clients/mongodb', () => ({
  getRowsByStatus: vi.fn(),
  updateConsolidation: vi.fn(),
  appendGenerationRow: vi.fn(),
}));

const VALID_CONSOLIDATION: ConsolidationResult = {
  titulo_post: 'IA domina o mercado em 2026',
  texto_final: 'Texto completo aqui com informações relevantes sobre o tema.',
  hashtags: ['#tech', '#ia', '#news', '#2026', '#inovacao'],
  topicos: [
    { emoji: '🚀', titulo: 'Avanço rápido', conteudo: 'Conteúdo do tópico 1.' },
    { emoji: '💡', titulo: 'Inovações', conteudo: 'Conteúdo do tópico 2.' },
    { emoji: '📊', titulo: 'Números', conteudo: 'Conteúdo do tópico 3.' },
  ],
  ficar_de_olho: 'Acompanhe os próximos lançamentos.',
  total_caracteres: 950,
  fontes_concordantes: 3,
  contradicoes_encontradas: false,
};

const MOCK_DOC: ContentDocument = {
  _id: new ObjectId('507f1f77bcf86cd799439011'),
  date: '2026-03-22',
  timestamp: '2026-03-22T10:00:00Z',
  topic: 'IA em 2026',
  gemini: { pontos: [] },
  deepseek: { pontos: [] },
  claude: { pontos: [] },
  status: 'gerado',
};

describe('consolidation.service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('validateConsolidation', () => {
    it('should pass for valid result', async () => {
      const { validateConsolidation } = await import(
        '../../src/services/consolidation.service'
      );
      const issues = validateConsolidation(VALID_CONSOLIDATION);
      expect(issues).toHaveLength(0);
    });

    it('should flag total_caracteres out of range', async () => {
      const { validateConsolidation } = await import(
        '../../src/services/consolidation.service'
      );
      const bad = { ...VALID_CONSOLIDATION, total_caracteres: 500 };
      const issues = validateConsolidation(bad);
      expect(issues).toHaveLength(1);
      expect(issues[0]).toContain('total_caracteres');
    });

    it('should flag too few hashtags', async () => {
      const { validateConsolidation } = await import(
        '../../src/services/consolidation.service'
      );
      const bad = { ...VALID_CONSOLIDATION, hashtags: ['#a', '#b'] };
      const issues = validateConsolidation(bad);
      expect(issues).toHaveLength(1);
      expect(issues[0]).toContain('hashtags');
    });

    it('should flag too few topicos', async () => {
      const { validateConsolidation } = await import(
        '../../src/services/consolidation.service'
      );
      const bad = { ...VALID_CONSOLIDATION, topicos: [VALID_CONSOLIDATION.topicos[0]] };
      const issues = validateConsolidation(bad);
      expect(issues).toHaveLength(1);
      expect(issues[0]).toContain('topicos');
    });

    it('should flag titulo_post over 60 chars', async () => {
      const { validateConsolidation } = await import(
        '../../src/services/consolidation.service'
      );
      const bad = {
        ...VALID_CONSOLIDATION,
        titulo_post: 'A'.repeat(61),
      };
      const issues = validateConsolidation(bad);
      expect(issues).toHaveLength(1);
      expect(issues[0]).toContain('titulo_post');
    });
  });

  describe('parseConsolidationJson', () => {
    it('should parse clean JSON', async () => {
      const { parseConsolidationJson } = await import(
        '../../src/services/consolidation.service'
      );
      const result = parseConsolidationJson(JSON.stringify(VALID_CONSOLIDATION));
      expect(result.titulo_post).toBe(VALID_CONSOLIDATION.titulo_post);
    });

    it('should strip markdown fences', async () => {
      const { parseConsolidationJson } = await import(
        '../../src/services/consolidation.service'
      );
      const wrapped = '```json\n' + JSON.stringify(VALID_CONSOLIDATION) + '\n```';
      const result = parseConsolidationJson(wrapped);
      expect(result.titulo_post).toBe(VALID_CONSOLIDATION.titulo_post);
    });
  });

  describe('consolidateRow', () => {
    it('should call Gemini Flash and return result', async () => {
      const { consolidate } = await import('../../src/clients/gemini');
      vi.mocked(consolidate).mockResolvedValue(JSON.stringify(VALID_CONSOLIDATION));

      const { consolidateRow } = await import(
        '../../src/services/consolidation.service'
      );
      const result = await consolidateRow(MOCK_DOC);

      expect(result.titulo_post).toBe(VALID_CONSOLIDATION.titulo_post);
      expect(result.topicos).toHaveLength(3);
      expect(consolidate).toHaveBeenCalledTimes(1);
    });

    it('should attempt correction if validation fails', async () => {
      const invalidResult = {
        ...VALID_CONSOLIDATION,
        total_caracteres: 200,
        hashtags: ['#a'],
        topicos: [VALID_CONSOLIDATION.topicos[0]],
      };

      const { consolidate } = await import('../../src/clients/gemini');
      vi.mocked(consolidate)
        .mockResolvedValueOnce(JSON.stringify(invalidResult))
        .mockResolvedValueOnce(JSON.stringify(VALID_CONSOLIDATION));

      const { consolidateRow } = await import(
        '../../src/services/consolidation.service'
      );
      const result = await consolidateRow(MOCK_DOC);

      expect(consolidate).toHaveBeenCalledTimes(2);
      expect(result.total_caracteres).toBe(950);
    });
  });
});
