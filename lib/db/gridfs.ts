import { GridFSBucket, ObjectId } from 'mongodb';
import { Readable, PassThrough } from 'stream';
import { getMongoDb } from './mongoClient';

/**
 * GridFS File Storage Utilities
 * 
 * Uses MongoDB GridFS to store large report files (Excel/ZIP) in chunks.
 * This replaces the local filesystem storage (public/reports/).
 * 
 * GridFS automatically splits files into 255KB chunks and stores them
 * across two collections:
 *   - report_files.files    (metadata: filename, size, uploadDate, etc.)
 *   - report_files.chunks   (binary data chunks)
 * 
 * Flow (per sequence diagram):
 *   1. Worker creates an upload stream → getUploadStream()
 *   2. ExcelJS writes rows → stream chunks are stored in GridFS
 *   3. On completion, fileId is saved in the job record
 *   4. Client downloads via /api/download/[fileId] → getDownloadStream()
 */

const BUCKET_NAME = 'report_files';

/**
 * Get a GridFS bucket instance.
 */
export async function getGridFSBucket(): Promise<GridFSBucket> {
  const db = await getMongoDb();
  return new GridFSBucket(db, {
    bucketName: BUCKET_NAME,
    chunkSizeBytes: 255 * 1024, // 255 KB (default)
  });
}

// ─── Upload ──────────────────────────────────────────────────────────

export interface UploadOptions {
  /** Original filename (e.g., "report_2026-02-16.xlsx") */
  filename: string;
  /** MIME content type */
  contentType?: string;
  /** Arbitrary metadata to attach to the file */
  metadata?: Record<string, unknown>;
}

/**
 * Get a writable upload stream to GridFS.
 * 
 * Usage:
 *   const { stream, fileId } = await getUploadStream({ filename: 'report.xlsx' });
 *   someReadableStream.pipe(stream);
 *   stream.on('finish', () => console.log('Upload complete, fileId:', fileId));
 */
export async function getUploadStream(options: UploadOptions): Promise<{
  stream: NodeJS.WritableStream;
  fileId: ObjectId;
}> {
  const bucket = await getGridFSBucket();
  const fileId = new ObjectId();

  const uploadStream = bucket.openUploadStreamWithId(fileId, options.filename, {
    metadata: {
      contentType: options.contentType || 'application/octet-stream',
      ...(options.metadata || {}),
    },
  });

  return {
    stream: uploadStream,
    fileId,
  };
}

/**
 * Upload a complete Buffer or Readable stream to GridFS.
 * Returns the stored file's ObjectId.
 * 
 * Use this for smaller files or when streaming isn't needed.
 */
export async function uploadFile(
  data: Buffer | Readable,
  options: UploadOptions
): Promise<ObjectId> {
  const { stream, fileId } = await getUploadStream(options);

  return new Promise<ObjectId>((resolve, reject) => {
    const readable = Buffer.isBuffer(data)
      ? Readable.from(data)
      : data;

    readable.pipe(stream as unknown as NodeJS.WritableStream);

    (stream as any).on('finish', () => resolve(fileId));
    (stream as any).on('error', (err: Error) => reject(err));
  });
}

/**
 * Create a PassThrough stream that pipes into GridFS.
 * 
 * This is useful when ExcelJS needs a writable stream:
 *   const { passThrough, fileId } = await createUploadPipeline({ filename: 'report.xlsx' });
 *   workbook.xlsx.write(passThrough).then(() => passThrough.end());
 * 
 * The passThrough stream is both writable (for ExcelJS) and readable (for GridFS).
 */
export async function createUploadPipeline(options: UploadOptions): Promise<{
  passThrough: PassThrough;
  fileId: ObjectId;
  uploadPromise: Promise<ObjectId>;
}> {
  const bucket = await getGridFSBucket();
  const fileId = new ObjectId();
  const passThrough = new PassThrough();

  const uploadStream = bucket.openUploadStreamWithId(fileId, options.filename, {
    metadata: {
      contentType: options.contentType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ...(options.metadata || {}),
    },
  });

  // Pipe the passthrough into the GridFS upload stream
  passThrough.pipe(uploadStream);

  const uploadPromise = new Promise<ObjectId>((resolve, reject) => {
    uploadStream.on('finish', () => resolve(fileId));
    uploadStream.on('error', (err: Error) => reject(err));
    passThrough.on('error', (err: Error) => reject(err));
  });

  return { passThrough, fileId, uploadPromise };
}

// ─── Download ────────────────────────────────────────────────────────

/**
 * Get a readable download stream from GridFS by file ID.
 * 
 * Used by the /api/download/[fileId] endpoint.
 */
export async function getDownloadStream(
  fileId: string | ObjectId
): Promise<NodeJS.ReadableStream> {
  const bucket = await getGridFSBucket();
  const objectId = typeof fileId === 'string' ? new ObjectId(fileId) : fileId;
  return bucket.openDownloadStream(objectId);
}

/**
 * Get file metadata from GridFS (filename, size, uploadDate, etc.).
 */
export async function getFileInfo(fileId: string | ObjectId) {
  const bucket = await getGridFSBucket();
  const objectId = typeof fileId === 'string' ? new ObjectId(fileId) : fileId;

  const cursor = bucket.find({ _id: objectId });
  const file = await cursor.next();
  await cursor.close();

  if (!file) {
    return null;
  }

  return {
    id: file._id.toString(),
    filename: file.filename,
    size: file.length,
    contentType: file.metadata?.contentType || 'application/octet-stream',
    uploadDate: file.uploadDate,
    metadata: file.metadata || {},
  };
}

// ─── Delete ──────────────────────────────────────────────────────────

/**
 * Delete a file from GridFS by file ID.
 * Removes both the file metadata and all associated chunks.
 */
export async function deleteFile(fileId: string | ObjectId): Promise<void> {
  const bucket = await getGridFSBucket();
  const objectId = typeof fileId === 'string' ? new ObjectId(fileId) : fileId;
  await bucket.delete(objectId);
}

/**
 * Delete multiple files from GridFS.
 */
export async function deleteFiles(fileIds: (string | ObjectId)[]): Promise<void> {
  const bucket = await getGridFSBucket();
  for (const fileId of fileIds) {
    try {
      const objectId = typeof fileId === 'string' ? new ObjectId(fileId) : fileId;
      await bucket.delete(objectId);
    } catch (error) {
      console.error(`Failed to delete GridFS file ${fileId}:`, error);
    }
  }
}

// ─── Utilities ───────────────────────────────────────────────────────

/**
 * Build the download URL for a given file ID.
 * This is stored in the job record so the client knows where to download.
 */
export function buildDownloadUrl(fileId: string | ObjectId): string {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  const id = typeof fileId === 'string' ? fileId : fileId.toString();
  return `${baseUrl}/api/download/${id}`;
}

/**
 * List all files in the GridFS bucket (for admin/debugging).
 */
export async function listFiles(limit = 50) {
  const bucket = await getGridFSBucket();
  const cursor = bucket.find({}, { limit, sort: { uploadDate: -1 } });
  const files = await cursor.toArray();
  await cursor.close();

  return files.map((file) => ({
    id: file._id.toString(),
    filename: file.filename,
    size: file.length,
    contentType: file.metadata?.contentType || 'application/octet-stream',
    uploadDate: file.uploadDate,
    metadata: file.metadata || {},
  }));
}
