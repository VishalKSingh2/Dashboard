import { MongoClient, Db } from 'mongodb';

/**
 * MongoDB Connection Manager
 * 
 * Manages a singleton connection to MongoDB.
 * Used for:
 *   - Job queue (mongoJobStore.ts)
 *   - File storage via GridFS (gridfs.ts)
 * 
 * SQL Server (lib/db.ts) remains the data source for report queries.
 */

const MONGODB_URI = process.env.MONGODB_URI || '';
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'report_dashboard';

if (!MONGODB_URI) {
  console.warn(
    'WARNING: MONGODB_URI is not defined in environment variables. ' +
    'MongoDB features (job queue, GridFS) will not work.'
  );
}

// Singleton client and db references
let client: MongoClient | null = null;
let db: Db | null = null;

/**
 * Get the MongoDB client instance.
 * Creates a new connection if one doesn't exist or is disconnected.
 */
export async function getMongoClient(): Promise<MongoClient> {
  if (client) {
    // Verify connectivity with a quick ping
    try {
      await client.db(MONGODB_DB_NAME).command({ ping: 1 });
      return client;
    } catch {
      console.warn('MongoDB connection lost. Reconnecting...');
      client = null;
      db = null;
    }
  }

  if (!MONGODB_URI) {
    throw new Error(
      'MONGODB_URI is not configured. Set it in your .env file.'
    );
  }

  try {
    console.log('Connecting to MongoDB...');
    client = new MongoClient(MONGODB_URI, {
      // Connection pool settings
      maxPoolSize: 10,
      minPoolSize: 2,
      maxIdleTimeMS: 60000,
      connectTimeoutMS: 10000,
      serverSelectionTimeoutMS: 10000,
      // Retry settings
      retryWrites: true,
      retryReads: true,
    });

    await client.connect();

    // Verify connection
    await client.db(MONGODB_DB_NAME).command({ ping: 1 });
    console.log('MongoDB connected successfully');

    return client;
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error);
    client = null;
    db = null;
    throw error;
  }
}

/**
 * Get the MongoDB database instance.
 * This is the primary method most modules should use.
 */
export async function getMongoDb(): Promise<Db> {
  if (db) {
    // Quick check – if client is still alive, return cached db
    try {
      await db.command({ ping: 1 });
      return db;
    } catch {
      db = null;
    }
  }

  const mongoClient = await getMongoClient();
  db = mongoClient.db(MONGODB_DB_NAME);
  return db;
}

/**
 * Gracefully close the MongoDB connection.
 * Call this during application shutdown.
 */
export async function closeMongoConnection(): Promise<void> {
  if (client) {
    try {
      console.log('Closing MongoDB connection...');
      await client.close();
      console.log('MongoDB connection closed');
    } catch (error) {
      console.error('Error closing MongoDB connection:', error);
    } finally {
      client = null;
      db = null;
    }
  }
}
