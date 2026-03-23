import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const { mockScreenshot, mockSetContent, mockSetViewport, mockClose } = vi.hoisted(() => {
  const mockScreenshot = vi.fn().mockResolvedValue(Buffer.from('fake-png'));
  const mockSetContent = vi.fn().mockResolvedValue(undefined);
  const mockSetViewport = vi.fn().mockResolvedValue(undefined);
  const mockClose = vi.fn().mockResolvedValue(undefined);
  return { mockScreenshot, mockSetContent, mockSetViewport, mockClose };
});

vi.mock('puppeteer', () => ({
  default: {
    launch: vi.fn().mockResolvedValue({
      newPage: vi.fn().mockResolvedValue({
        setViewport: mockSetViewport,
        setContent: mockSetContent,
        screenshot: mockScreenshot,
      }),
      close: mockClose,
    }),
  },
}));

import { generatePostImage, generateCarouselImages } from '../../src/services/image.service';

describe('image.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Restore default implementations after clearAllMocks
    mockScreenshot.mockResolvedValue(Buffer.from('fake-png'));
    mockSetContent.mockResolvedValue(undefined);
    mockSetViewport.mockResolvedValue(undefined);
    mockClose.mockResolvedValue(undefined);
  });

  describe('generatePostImage', () => {
    it('renders a single image with all data', async () => {
      const buffer = await generatePostImage({
        titulo: 'Tech News do Dia',
        topicos: [
          { emoji: '🤖', titulo: 'AI Update', conteudo: 'New model released' },
          { emoji: '💻', titulo: 'Dev Tools', conteudo: 'VS Code updated' },
        ],
        hashtags: ['#tech', '#news'],
      });

      expect(buffer).toBeInstanceOf(Buffer);
      expect(mockSetViewport).toHaveBeenCalledWith({ width: 1080, height: 1080 });
      expect(mockSetContent).toHaveBeenCalledTimes(1);

      const html = mockSetContent.mock.calls[0][0];
      expect(html).toContain('Tech News do Dia');
      expect(html).toContain('🤖');
      expect(html).toContain('AI Update');
      expect(html).toContain('#tech');
    });

    it('closes browser after rendering', async () => {
      await generatePostImage({
        titulo: 'Test',
        topicos: [{ emoji: '📌', titulo: 'T', conteudo: 'C' }],
        hashtags: [],
      });

      expect(mockClose).toHaveBeenCalledTimes(1);
    });

    it('closes browser even on error', async () => {
      mockScreenshot.mockRejectedValueOnce(new Error('screenshot failed'));

      await expect(
        generatePostImage({
          titulo: 'Test',
          topicos: [{ emoji: '📌', titulo: 'T', conteudo: 'C' }],
          hashtags: [],
        }),
      ).rejects.toThrow('screenshot failed');

      expect(mockClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('generateCarouselImages', () => {
    it('generates cover + topic slides + closing', async () => {
      const images = await generateCarouselImages({
        titulo: 'Resumo Tech',
        topicos: [
          { emoji: '🔥', titulo: 'Hot', conteudo: 'Hot news' },
          { emoji: '📊', titulo: 'Data', conteudo: 'Data story' },
        ],
        hashtags: ['#ai', '#ml'],
      });

      // 1 cover + 2 topics + 1 closing = 4 slides
      expect(images).toHaveLength(4);
      images.forEach((img) => expect(img).toBeInstanceOf(Buffer));

      // Check cover slide
      const coverHtml = mockSetContent.mock.calls[0][0];
      expect(coverHtml).toContain('Resumo Tech');
      expect(coverHtml).toContain('Deslize para ver');

      // Check closing slide
      const closingHtml = mockSetContent.mock.calls[3][0];
      expect(closingHtml).toContain('Siga para mais');
      expect(closingHtml).toContain('#ai');
    });
  });

  describe('template file', () => {
    it('exists and contains required placeholders', () => {
      const templatePath = path.join(__dirname, '..', '..', 'src', 'templates', 'post-template.html');
      const content = fs.readFileSync(templatePath, 'utf-8');

      expect(content).toContain('{{TITULO}}');
      expect(content).toContain('{{TOPICOS}}');
      expect(content).toContain('{{HASHTAGS}}');
      expect(content).toContain('1080px');
      expect(content).toContain('Inter');
    });
  });
});
