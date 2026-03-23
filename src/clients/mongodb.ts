import { MongoClient, Db, ObjectId } from 'mongodb';
import { config } from '../utils/config';
import { GenerationResult, ConsolidationResult } from '../types';

let client: MongoClient;
let db: Db;

async function getDb(): Promise<Db> {
  if (!db) {
    client = new MongoClient(config.mongodbUri, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
    });
    try {
      await client.connect();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`[MongoDB] Falha na conexao: ${msg}`);
    }
    db = client.db('bot-news');
  }
  return db;
}

export interface ContentDocument {
  _id?: ObjectId;
  date: string;
  topic: string;
  timestamp: string;
  gemini: object | string;
  deepseek: object | string;
  claude: object | string;
  status: string;
  consolidatedJson?: string;
  finalStatus?: string;
  postId?: string;
}

export async function appendGenerationRow(
  topic: string,
  result: GenerationResult,
): Promise<string> {
  const database = await getDb();
  const doc: ContentDocument = {
    date: result.timestamp.split('T')[0],
    topic,
    timestamp: result.timestamp,
    gemini: result.gemini.success ? result.gemini.data! : `ERRO: ${result.gemini.error}`,
    deepseek: result.deepseek.success ? result.deepseek.data! : `ERRO: ${result.deepseek.error}`,
    claude: result.claude.success ? result.claude.data! : `ERRO: ${result.claude.error}`,
    status: 'gerado',
  };

  const inserted = await database.collection<ContentDocument>('contents').insertOne(doc);
  return inserted.insertedId.toHexString();
}

export async function getRowsByStatus(status: string): Promise<ContentDocument[]> {
  const database = await getDb();
  return database
    .collection<ContentDocument>('contents')
    .find({ status })
    .sort({ timestamp: 1 })
    .toArray();
}

export async function getRowById(id: string): Promise<ContentDocument | null> {
  const database = await getDb();
  return database
    .collection<ContentDocument>('contents')
    .findOne({ _id: new ObjectId(id) });
}

export async function updateConsolidation(
  id: string,
  consolidatedJson: string,
): Promise<void> {
  const database = await getDb();
  await database.collection<ContentDocument>('contents').updateOne(
    { _id: new ObjectId(id) },
    {
      $set: {
        status: 'consolidado',
        consolidatedJson,
        finalStatus: new Date().toISOString(),
      },
    },
  );
}

export async function updateFinalStatus(
  id: string,
  status: string,
  postId?: string,
): Promise<void> {
  const database = await getDb();
  await database.collection<ContentDocument>('contents').updateOne(
    { _id: new ObjectId(id) },
    { $set: { status, ...(postId && { postId }) } },
  );
}

export async function getContentsByDate(date: string): Promise<ContentDocument[]> {
  const database = await getDb();
  return database
    .collection<ContentDocument>('contents')
    .find({ date })
    .sort({ timestamp: -1 })
    .toArray();
}

export async function getRecentContents(limit = 50, includeDeleted = false): Promise<ContentDocument[]> {
  const database = await getDb();
  const filter = includeDeleted ? {} : { status: { $ne: 'apagado' } };
  return database
    .collection<ContentDocument>('contents')
    .find(filter)
    .sort({ timestamp: -1 })
    .limit(limit)
    .toArray();
}

export async function closeConnection(): Promise<void> {
  if (client) {
    await client.close();
  }
}
