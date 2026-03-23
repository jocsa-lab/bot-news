import { describe, it, expect } from 'vitest';
import { buildGenerationPrompt } from '../../src/prompts/prompt-01-geracao';

describe('buildGenerationPrompt', () => {
  it('should include the topic and date', () => {
    const prompt = buildGenerationPrompt('AI news', '2026-03-22');
    expect(prompt).toContain('AI news');
    expect(prompt).toContain('2026-03-22');
  });

  it('should request JSON output', () => {
    const prompt = buildGenerationPrompt('test', '2026-01-01');
    expect(prompt).toContain('JSON válido');
    expect(prompt).toContain('"pontos"');
  });

  it('should instruct to write in portuguese', () => {
    const prompt = buildGenerationPrompt('test', '2026-01-01');
    expect(prompt).toContain('português brasileiro');
  });
});
