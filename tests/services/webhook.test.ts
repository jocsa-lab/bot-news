import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/utils/config', () => ({
  config: {
    telegramBotToken: 'test-bot-token',
    telegramChatId: '123456',
    googleSheetsId: 'sheet-id',
    gcpProjectId: 'test-project',
    instagramAccountId: 'ig-123',
    metaAccessToken: 'meta-token',
    metaAppId: 'app-id',
    metaAppSecret: 'app-secret',
  },
}));

vi.mock('../../src/clients/sheets', () => ({
  getRowByIndex: vi.fn(),
  updateFinalStatus: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/services/notification.service', () => ({
  notifyTelegramText: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/services/image.service', () => ({
  generateCarouselImages: vi.fn().mockResolvedValue([Buffer.from('img')]),
}));

vi.mock('../../src/services/instagram.service', () => ({
  publishToInstagram: vi.fn().mockResolvedValue({ postId: 'post-123' }),
  publishCarousel: vi.fn().mockResolvedValue({ postId: 'post-456' }),
}));

const fetchMock = vi.fn().mockResolvedValue({ ok: true });
global.fetch = fetchMock as any;

import { onApproval } from '../../src/index';
import { getRowByIndex, updateFinalStatus } from '../../src/clients/sheets';
import { notifyTelegramText } from '../../src/services/notification.service';
import { generateCarouselImages } from '../../src/services/image.service';

describe('onApproval orchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads row, generates images, publishes, and updates status', async () => {
    const mockRow = {
      rowIndex: 5,
      timestamp: '2024-01-01T00:00:00Z',
      topic: 'AI News',
      geminiJson: '{}',
      deepseekJson: '{}',
      claudeJson: '{}',
      status: 'consolidado',
      consolidatedJson: JSON.stringify({
        titulo_post: 'Tech Update',
        texto_final: 'Full text here',
        hashtags: ['#ai', '#tech'],
        topicos: [{ emoji: '🤖', titulo: 'AI', conteudo: 'Content' }],
        ficar_de_olho: 'Watch this',
        total_caracteres: 900,
        fontes_concordantes: 3,
        contradicoes_encontradas: false,
      }),
      finalStatus: 'pronto',
    };

    (getRowByIndex as any).mockResolvedValue(mockRow);

    await onApproval(5);

    expect(getRowByIndex).toHaveBeenCalledWith(5);
    expect(generateCarouselImages).toHaveBeenCalledWith(
      expect.objectContaining({ titulo: 'Tech Update' }),
    );
    expect(updateFinalStatus).toHaveBeenCalledWith(5, 'publicado', expect.any(String));
    expect(notifyTelegramText).toHaveBeenCalledWith(
      expect.stringContaining('Publicado com sucesso'),
    );
  });

  it('handles missing row gracefully', async () => {
    (getRowByIndex as any).mockResolvedValue(null);

    await expect(onApproval(99)).rejects.toThrow('not found');

    expect(updateFinalStatus).toHaveBeenCalledWith(99, 'erro_publicacao');
    expect(notifyTelegramText).toHaveBeenCalledWith(
      expect.stringContaining('Erro ao publicar'),
    );
  });

  it('handles publication error and notifies', async () => {
    const mockRow = {
      rowIndex: 3,
      consolidatedJson: JSON.stringify({
        titulo_post: 'T',
        texto_final: 'Text',
        hashtags: ['#h'],
        topicos: [{ emoji: '📌', titulo: 'T', conteudo: 'C' }],
        ficar_de_olho: '',
        total_caracteres: 800,
        fontes_concordantes: 2,
        contradicoes_encontradas: false,
      }),
    };

    (getRowByIndex as any).mockResolvedValue(mockRow);
    (generateCarouselImages as any).mockRejectedValue(new Error('Puppeteer crash'));

    await expect(onApproval(3)).rejects.toThrow('Puppeteer crash');

    expect(updateFinalStatus).toHaveBeenCalledWith(3, 'erro_publicacao');
    expect(notifyTelegramText).toHaveBeenCalledWith(
      expect.stringContaining('Puppeteer crash'),
    );
  });
});
