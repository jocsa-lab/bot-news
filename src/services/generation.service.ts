import * as geminiClient from '../clients/gemini';
import * as deepseekClient from '../clients/deepseek';
import * as claudeClient from '../clients/claude';
import { appendGenerationRow } from '../clients/sheets';
import { buildGenerationPrompt } from '../prompts/prompt-01-geracao';
import { GenerationResult, LLMResponse, SourceResult } from '../types';

function parseResult(
  settled: PromiseSettledResult<LLMResponse>,
  source: SourceResult['source'],
): SourceResult {
  if (settled.status === 'fulfilled') {
    return { success: true, data: settled.value, source };
  }
  return {
    success: false,
    error: settled.reason instanceof Error ? settled.reason.message : String(settled.reason),
    source,
  };
}

export async function generateFromAllSources(topic: string): Promise<GenerationResult> {
  const date = new Date().toISOString().split('T')[0];
  const prompt = buildGenerationPrompt(topic, date);

  const [geminiSettled, deepseekSettled, claudeSettled] = await Promise.allSettled([
    geminiClient.generate(prompt),
    deepseekClient.generate(prompt),
    claudeClient.generate(prompt),
  ]);

  const result: GenerationResult = {
    gemini: parseResult(geminiSettled, 'gemini'),
    deepseek: parseResult(deepseekSettled, 'deepseek'),
    claude: parseResult(claudeSettled, 'claude'),
    timestamp: new Date().toISOString(),
  };

  const successCount = [result.gemini, result.deepseek, result.claude].filter(
    (r) => r.success,
  ).length;

  if (successCount === 0) {
    console.error('[generation] All 3 sources failed — skipping Sheets, notifying Telegram');
    // Telegram notification will be handled by a later prompt
    return result;
  }

  if (successCount === 1) {
    console.error('[generation] Only 1 of 3 sources succeeded — flagging in Sheets');
  } else if (successCount === 2) {
    console.warn('[generation] 1 of 3 sources failed — continuing with 2');
  }

  // Log individual failures
  for (const r of [result.gemini, result.deepseek, result.claude]) {
    if (!r.success) {
      console.warn(`[generation] ${r.source} failed: ${r.error}`);
    }
  }

  try {
    await appendGenerationRow(topic, result);
    console.log('[generation] Results saved to Google Sheets');
  } catch (err) {
    console.error('[generation] Failed to save to Sheets:', err);
  }

  return result;
}
