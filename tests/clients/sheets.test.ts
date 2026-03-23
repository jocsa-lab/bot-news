import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/utils/config', () => ({
  config: {
    googleSheetsId: 'test-sheet-id',
    googleServiceAccountJson: Buffer.from(
      JSON.stringify({ client_email: 'test@test.iam.gserviceaccount.com', private_key: 'key' }),
    ).toString('base64'),
  },
}));

const mockAppend = vi.fn().mockResolvedValue({});

vi.mock('googleapis', () => ({
  google: {
    auth: {
      GoogleAuth: vi.fn().mockImplementation(() => ({})),
    },
    sheets: vi.fn().mockReturnValue({
      spreadsheets: {
        values: {
          append: (...args: unknown[]) => mockAppend(...args),
        },
      },
    }),
  },
}));

describe('sheets client', () => {
  it('should append a row with generation results', async () => {
    const { appendGenerationRow } = await import('../../src/clients/sheets');

    await appendGenerationRow('AI news', {
      gemini: { success: true, data: { pontos: [], fontes: [], confianca: 'alta' }, source: 'gemini' },
      deepseek: { success: false, error: 'timeout', source: 'deepseek' },
      claude: { success: true, data: { pontos: [], fontes: [], confianca: 'media' }, source: 'claude' },
      timestamp: '2026-03-22T10:00:00.000Z',
    });

    expect(mockAppend).toHaveBeenCalledOnce();
    const call = mockAppend.mock.calls[0][0];
    expect(call.spreadsheetId).toBe('test-sheet-id');
    expect(call.requestBody.values[0][5]).toBe('gerado');
    expect(call.requestBody.values[0][3]).toContain('ERRO: timeout');
  });
});
