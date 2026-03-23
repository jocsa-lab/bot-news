import { consolidate } from '../clients/gemini';
import { getRowsByStatus, updateConsolidation } from '../clients/sheets';
import {
  buildConsolidationPrompt,
  buildCorrectionPrompt,
} from '../prompts/prompt-02-consolidacao';
import { ConsolidationResult, SheetRow } from '../types';

export function validateConsolidation(
  result: ConsolidationResult,
): string[] {
  const issues: string[] = [];

  if (result.total_caracteres < 800 || result.total_caracteres > 1500) {
    issues.push(
      `total_caracteres deve estar entre 800 e 1500, atual: ${result.total_caracteres}`,
    );
  }

  if (!result.hashtags || result.hashtags.length < 5 || result.hashtags.length > 8) {
    issues.push(
      `hashtags deve ter entre 5 e 8 itens, atual: ${result.hashtags?.length ?? 0}`,
    );
  }

  if (!result.topicos || result.topicos.length < 3 || result.topicos.length > 6) {
    issues.push(
      `topicos deve ter entre 3 e 6 itens, atual: ${result.topicos?.length ?? 0}`,
    );
  }

  if (!result.titulo_post || result.titulo_post.length > 60) {
    issues.push(
      `titulo_post deve ter no máximo 60 caracteres, atual: ${result.titulo_post?.length ?? 0}`,
    );
  }

  return issues;
}

export function parseConsolidationJson(raw: string): ConsolidationResult {
  const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  return JSON.parse(cleaned) as ConsolidationResult;
}

export async function consolidateRow(
  row: SheetRow,
): Promise<ConsolidationResult> {
  const prompt = buildConsolidationPrompt(
    row.geminiJson,
    row.deepseekJson,
    row.claudeJson,
    row.topic,
  );

  let raw: string;
  try {
    raw = await consolidate(prompt);
  } catch {
    // Fallback: try DeepSeek if Gemini Flash fails
    const { generate } = await import('../clients/deepseek');
    const fallbackPrompt = prompt;
    const res = await generate(fallbackPrompt);
    raw = JSON.stringify(res);
  }

  let result = parseConsolidationJson(raw);

  // Validate and attempt one correction if needed
  const issues = validateConsolidation(result);
  if (issues.length > 0) {
    const correctionPrompt = buildCorrectionPrompt(JSON.stringify(result), issues);
    try {
      const correctedRaw = await consolidate(correctionPrompt);
      result = parseConsolidationJson(correctedRaw);
    } catch {
      // Keep original result if correction fails
    }
  }

  return result;
}

export async function consolidateContent(): Promise<number> {
  const rows = await getRowsByStatus('gerado');
  let processed = 0;

  for (const row of rows) {
    const result = await consolidateRow(row);
    await updateConsolidation(row.rowIndex, JSON.stringify(result));
    processed++;
  }

  return processed;
}
