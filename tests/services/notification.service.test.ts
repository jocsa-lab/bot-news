import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/utils/config', () => ({
  config: {
    telegramBotToken: 'test-bot-token',
    telegramChatId: '123456',
  },
  isTelegramConfigured: () => true,
}));

const fetchMock = vi.fn();
global.fetch = fetchMock as any;

import { notifyTelegram, notifyTelegramText } from '../../src/services/notification.service';

describe('notification.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('notifyTelegram', () => {
    it('sends formatted message with inline keyboard', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true });

      await notifyTelegram({
        topic: 'AI News',
        titulo: 'OpenAI lança novo modelo',
        resumo: 'O OpenAI anunciou hoje o lançamento de um novo modelo de linguagem.',
        contentId: 'abc123',
        contradictions: false,
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.telegram.org/bottest-bot-token/sendMessage');

      const body = JSON.parse(options.body);
      expect(body.chat_id).toBe('123456');
      expect(body.parse_mode).toBe('HTML');
      expect(body.text).toContain('Novo conteúdo gerado');
      expect(body.text).toContain('AI News');
      expect(body.text).toContain('OpenAI lança novo modelo');
      expect(body.text).toContain('Contradições: não');

      const keyboard = body.reply_markup.inline_keyboard;
      expect(keyboard).toHaveLength(1);
      expect(keyboard[0]).toHaveLength(2); // Approve + Reject

      const approveData = JSON.parse(keyboard[0][0].callback_data);
      expect(approveData).toEqual({ action: 'approve', contentId: 'abc123' });

      const rejectData = JSON.parse(keyboard[0][1].callback_data);
      expect(rejectData).toEqual({ action: 'reject', contentId: 'abc123' });
    });

    it('shows contradictions when present', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true });

      await notifyTelegram({
        topic: 'Tech',
        titulo: 'Título',
        resumo: 'Resumo',
        contentId: 'xyz789',
        contradictions: true,
      });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.text).toContain('Contradições: sim');
    });

    it('truncates resumo to 300 chars', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true });

      const longResumo = 'A'.repeat(500);
      await notifyTelegram({
        topic: 'Tech',
        titulo: 'T',
        resumo: longResumo,
        contentId: 'id1',
        contradictions: false,
      });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.text).toContain('A'.repeat(300) + '...');
      expect(body.text).not.toContain('A'.repeat(301));
    });

    it('escapes HTML in user content', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true });

      await notifyTelegram({
        topic: '<script>alert("xss")</script>',
        titulo: 'Test & <b>bold</b>',
        resumo: 'Text with <tags>',
        contentId: 'id2',
        contradictions: false,
      });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.text).toContain('&lt;script&gt;');
      expect(body.text).toContain('Test &amp; &lt;b&gt;bold&lt;/b&gt;');
    });

    it('throws on API failure', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => 'Forbidden',
      });

      await expect(
        notifyTelegram({
          topic: 'T',
          titulo: 'T',
          resumo: 'R',
          contentId: 'id3',
          contradictions: false,
        }),
      ).rejects.toThrow('Telegram sendMessage failed (403)');
    });
  });

  describe('notifyTelegramText', () => {
    it('sends a plain text message', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true });

      await notifyTelegramText('Hello <b>world</b>');

      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toContain('/sendMessage');
      const body = JSON.parse(options.body);
      expect(body.text).toBe('Hello <b>world</b>');
      expect(body.parse_mode).toBe('HTML');
    });

    it('throws on API failure', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Server Error',
      });

      await expect(notifyTelegramText('test')).rejects.toThrow(
        'Telegram sendMessage failed (500)',
      );
    });
  });
});
