import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/utils/config', () => ({
  config: {
    telegramBotToken: 'test-bot-token',
    telegramChatId: '123456',
    gcpProjectId: 'test-project',
    instagramAccountId: 'ig-123',
    metaAccessToken: 'meta-token',
    metaAppId: 'app-id',
    metaAppSecret: 'app-secret',
  },
  isTelegramConfigured: () => true,
  isInstagramConfigured: () => true,
}));

vi.mock('../../src/clients/mongodb', () => ({
  getRowById: vi.fn(),
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
import { getRowById, updateFinalStatus } from '../../src/clients/mongodb';
import { notifyTelegramText } from '../../src/services/notification.service';
import { generateCarouselImages } from '../../src/services/image.service';

describe('onApproval orchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads doc, generates images, publishes, and updates status', async () => {
    const mockDoc = {
      _id: 'abc123',
      date: '2024-01-01',
      timestamp: '2024-01-01T00:00:00Z',
      topic: 'AI News',
      gemini: {},
      deepseek: {},
      claude: {},
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

    (getRowById as any).mockResolvedValue(mockDoc);

    await onApproval('abc123');

    expect(getRowById).toHaveBeenCalledWith('abc123');
    expect(generateCarouselImages).toHaveBeenCalledWith(
      expect.objectContaining({ titulo: 'Tech Update' }),
    );
    expect(updateFinalStatus).toHaveBeenCalledWith('abc123', 'publicado', expect.any(String));
    expect(notifyTelegramText).toHaveBeenCalledWith(
      expect.stringContaining('Publicado com sucesso'),
    );
  });

  it('handles missing doc gracefully', async () => {
    (getRowById as any).mockResolvedValue(null);

    await expect(onApproval('missing-id')).rejects.toThrow('not found');

    expect(updateFinalStatus).toHaveBeenCalledWith('missing-id', 'erro_publicacao');
    expect(notifyTelegramText).toHaveBeenCalledWith(
      expect.stringContaining('Erro ao publicar'),
    );
  });

  it('handles publication error and notifies', async () => {
    const mockDoc = {
      _id: 'err-id',
      date: '2024-01-01',
      timestamp: '2024-01-01T00:00:00Z',
      topic: 'Tech',
      gemini: {},
      deepseek: {},
      claude: {},
      status: 'consolidado',
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

    (getRowById as any).mockResolvedValue(mockDoc);
    (generateCarouselImages as any).mockRejectedValue(new Error('Puppeteer crash'));

    await expect(onApproval('err-id')).rejects.toThrow('Puppeteer crash');

    expect(updateFinalStatus).toHaveBeenCalledWith('err-id', 'erro_publicacao');
    expect(notifyTelegramText).toHaveBeenCalledWith(
      expect.stringContaining('Puppeteer crash'),
    );
  });
});
