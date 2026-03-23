import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/utils/config', () => ({
  config: {
    mongodbUri: 'mongodb://localhost:27017/test',
  },
}));

const mockInsertOne = vi.fn().mockResolvedValue({ insertedId: { toHexString: () => 'abc123' } });
const mockFind = vi.fn().mockReturnValue({
  sort: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
});
const mockFindOne = vi.fn().mockResolvedValue(null);
const mockUpdateOne = vi.fn().mockResolvedValue({ modifiedCount: 1 });
const mockCollection = vi.fn().mockReturnValue({
  insertOne: mockInsertOne,
  find: mockFind,
  findOne: mockFindOne,
  updateOne: mockUpdateOne,
});

vi.mock('mongodb', () => ({
  MongoClient: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    db: vi.fn().mockReturnValue({ collection: mockCollection }),
    close: vi.fn().mockResolvedValue(undefined),
  })),
  ObjectId: vi.fn().mockImplementation((id: string) => id),
}));

describe('mongodb client', () => {
  it('should insert a generation row and return id', async () => {
    const { appendGenerationRow } = await import('../../src/clients/mongodb');

    const id = await appendGenerationRow('AI news', {
      gemini: { success: true, data: { pontos: [], fontes: [], confianca: 'alta' }, source: 'gemini' },
      deepseek: { success: false, error: 'timeout', source: 'deepseek' },
      claude: { success: true, data: { pontos: [], fontes: [], confianca: 'media' }, source: 'claude' },
      timestamp: '2026-03-22T10:00:00.000Z',
    });

    expect(id).toBe('abc123');
    expect(mockInsertOne).toHaveBeenCalledOnce();
    const doc = mockInsertOne.mock.calls[0][0];
    expect(doc.status).toBe('gerado');
    expect(doc.topic).toBe('AI news');
    expect(doc.date).toBe('2026-03-22');
  });
});
