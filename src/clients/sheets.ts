import { google } from 'googleapis';
import { config } from '../utils/config';
import { GenerationResult, SheetRow, ConsolidationResult } from '../types';

function getAuth() {
  const credentials = JSON.parse(
    Buffer.from(config.googleServiceAccountJson, 'base64').toString('utf-8'),
  );

  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

export async function appendGenerationRow(
  topic: string,
  result: GenerationResult,
): Promise<void> {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  const row = [
    result.timestamp,                                          // A: Data/hora
    topic,                                                     // B: Tema
    result.gemini.success ? JSON.stringify(result.gemini.data) : `ERRO: ${result.gemini.error}`,   // C: Gemini
    result.deepseek.success ? JSON.stringify(result.deepseek.data) : `ERRO: ${result.deepseek.error}`, // D: DeepSeek
    result.claude.success ? JSON.stringify(result.claude.data) : `ERRO: ${result.claude.error}`,   // E: Claude
    'gerado',                                                  // F: Status
    '',                                                        // G: (reservada — consolidação)
    '',                                                        // H: (reservada — status final)
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: config.googleSheetsId,
    range: 'A:H',
    valueInputOption: 'RAW',
    requestBody: { values: [row] },
  });
}

export async function getRowsByStatus(status: string): Promise<SheetRow[]> {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.googleSheetsId,
    range: 'A:H',
  });

  const rows = res.data.values ?? [];
  const result: SheetRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r[5] === status) {
      result.push({
        rowIndex: i + 1, // 1-based for Sheets API
        timestamp: r[0] ?? '',
        topic: r[1] ?? '',
        geminiJson: r[2] ?? '',
        deepseekJson: r[3] ?? '',
        claudeJson: r[4] ?? '',
        status: r[5] ?? '',
      });
    }
  }

  return result;
}

export async function getRowByIndex(rowIndex: number): Promise<SheetRow | null> {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.googleSheetsId,
    range: `A${rowIndex}:H${rowIndex}`,
  });

  const rows = res.data.values ?? [];
  if (rows.length === 0) return null;

  const r = rows[0];
  return {
    rowIndex,
    timestamp: r[0] ?? '',
    topic: r[1] ?? '',
    geminiJson: r[2] ?? '',
    deepseekJson: r[3] ?? '',
    claudeJson: r[4] ?? '',
    status: r[5] ?? '',
    consolidatedJson: r[6] ?? '',
    finalStatus: r[7] ?? '',
  };
}

export async function updateFinalStatus(
  rowIndex: number,
  status: string,
  postId?: string,
): Promise<void> {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  await sheets.spreadsheets.values.update({
    spreadsheetId: config.googleSheetsId,
    range: `H${rowIndex}:I${rowIndex}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[status, postId ?? '']],
    },
  });
}

export async function updateConsolidation(
  rowIndex: number,
  consolidatedJson: string,
): Promise<void> {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  // Update column F (status) and G (consolidated JSON)
  await sheets.spreadsheets.values.update({
    spreadsheetId: config.googleSheetsId,
    range: `F${rowIndex}:H${rowIndex}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [['consolidado', consolidatedJson, new Date().toISOString()]],
    },
  });
}
