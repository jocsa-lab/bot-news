import { describe, it, expect } from 'vitest';
import {
  buildConsolidationPrompt,
  buildCorrectionPrompt,
} from '../../src/prompts/prompt-02-consolidacao';

describe('prompt-02-consolidacao', () => {
  it('should include all three sources and topic in prompt', () => {
    const result = buildConsolidationPrompt(
      'gemini data',
      'deepseek data',
      'claude data',
      'AI news',
    );

    expect(result).toContain('gemini data');
    expect(result).toContain('deepseek data');
    expect(result).toContain('claude data');
    expect(result).toContain('AI news');
    expect(result).toContain('Fonte 1 (Gemini)');
    expect(result).toContain('Fonte 2 (DeepSeek)');
    expect(result).toContain('Fonte 3 (Claude)');
  });

  it('should request JSON output format', () => {
    const result = buildConsolidationPrompt('a', 'b', 'c', 'topic');
    expect(result).toContain('titulo_post');
    expect(result).toContain('texto_final');
    expect(result).toContain('hashtags');
    expect(result).toContain('topicos');
    expect(result).toContain('ficar_de_olho');
  });

  it('should build correction prompt with issues', () => {
    const result = buildCorrectionPrompt('{"foo":"bar"}', [
      'hashtags deve ter entre 5 e 8',
      'total_caracteres fora do limite',
    ]);

    expect(result).toContain('hashtags deve ter entre 5 e 8');
    expect(result).toContain('total_caracteres fora do limite');
    expect(result).toContain('{"foo":"bar"}');
  });
});
