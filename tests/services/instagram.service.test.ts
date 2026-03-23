import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/utils/config', () => ({
  config: {
    gcpProjectId: 'test-project',
    instagramAccountId: 'ig-123',
    metaAccessToken: 'meta-token-abc',
    metaAppId: 'app-id',
    metaAppSecret: 'app-secret',
  },
}));

// Mock GCS
const mockSave = vi.fn().mockResolvedValue(undefined);
const mockGetSignedUrl = vi.fn().mockResolvedValue(['https://storage.example.com/signed-url']);
const mockDelete = vi.fn().mockResolvedValue(undefined);

vi.mock('@google-cloud/storage', () => ({
  Storage: vi.fn().mockImplementation(() => ({
    bucket: () => ({
      file: () => ({
        save: mockSave,
        getSignedUrl: mockGetSignedUrl,
        delete: mockDelete,
      }),
    }),
  })),
}));

const fetchMock = vi.fn();
global.fetch = fetchMock as any;

import { publishToInstagram, publishCarousel, refreshMetaToken } from '../../src/services/instagram.service';

describe('instagram.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('publishToInstagram', () => {
    it('uploads image to GCS and publishes via Meta API', async () => {
      // Mock create container response
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'container-123' }),
      });
      // Mock publish response
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'post-456' }),
      });

      const result = await publishToInstagram({
        imageBuffer: Buffer.from('test-image'),
        caption: 'Test caption',
        hashtags: ['#test', '#news'],
      });

      expect(result.postId).toBe('post-456');

      // Verify GCS upload
      expect(mockSave).toHaveBeenCalledWith(Buffer.from('test-image'), { contentType: 'image/png' });

      // Verify container creation
      const createCall = fetchMock.mock.calls[0];
      expect(createCall[0]).toContain('/ig-123/media');
      const createBody = JSON.parse(createCall[1].body);
      expect(createBody.image_url).toBe('https://storage.example.com/signed-url');
      expect(createBody.caption).toContain('Test caption');
      expect(createBody.caption).toContain('#test #news');

      // Verify publish
      const publishCall = fetchMock.mock.calls[1];
      expect(publishCall[0]).toContain('/ig-123/media_publish');
      const publishBody = JSON.parse(publishCall[1].body);
      expect(publishBody.creation_id).toBe('container-123');

      // Verify cleanup
      expect(mockDelete).toHaveBeenCalled();
    });

    it('throws on container creation failure', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'Bad Request',
      });

      await expect(
        publishToInstagram({
          imageBuffer: Buffer.from('test'),
          caption: 'Test',
          hashtags: [],
        }),
      ).rejects.toThrow('Meta media create failed (400)');
    });

    it('throws on publish failure', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'container-123' }),
      });
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Server Error',
      });

      await expect(
        publishToInstagram({
          imageBuffer: Buffer.from('test'),
          caption: 'Test',
          hashtags: [],
        }),
      ).rejects.toThrow('Meta media_publish failed (500)');

      // Should still attempt cleanup
      expect(mockDelete).toHaveBeenCalled();
    });
  });

  describe('publishCarousel', () => {
    it('uploads multiple images and creates carousel', async () => {
      const images = [Buffer.from('img1'), Buffer.from('img2'), Buffer.from('img3')];

      // 3 carousel item creates
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'child-1' }) });
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'child-2' }) });
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'child-3' }) });
      // Carousel container create
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'carousel-100' }) });
      // Carousel publish
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'post-789' }) });

      const result = await publishCarousel({
        images,
        caption: 'Carousel test',
        hashtags: ['#carousel'],
      });

      expect(result.postId).toBe('post-789');
      expect(fetchMock).toHaveBeenCalledTimes(5);

      // Verify carousel item creation has is_carousel_item
      const itemBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(itemBody.is_carousel_item).toBe(true);

      // Verify carousel container has children
      const carouselBody = JSON.parse(fetchMock.mock.calls[3][1].body);
      expect(carouselBody.media_type).toBe('CAROUSEL');
      expect(carouselBody.children).toBe('child-1,child-2,child-3');
      expect(carouselBody.caption).toContain('Carousel test');
    });
  });

  describe('refreshMetaToken', () => {
    it('exchanges token and updates Secret Manager', async () => {
      const mockAddSecretVersion = vi.fn().mockResolvedValue(undefined);
      vi.doMock('@google-cloud/secret-manager', () => ({
        SecretManagerServiceClient: vi.fn().mockImplementation(() => ({
          addSecretVersion: mockAddSecretVersion,
        })),
      }));

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'new-token-xyz' }),
      });

      const newToken = await refreshMetaToken();

      expect(newToken).toBe('new-token-xyz');

      const [url] = fetchMock.mock.calls[0];
      expect(url).toContain('fb_exchange_token');
      expect(url).toContain('meta-token-abc');
    });

    it('throws on token refresh failure', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });

      await expect(refreshMetaToken()).rejects.toThrow('Meta token refresh failed (401)');
    });
  });
});
