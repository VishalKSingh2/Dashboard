import { Collection, ObjectId } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import { getMongoDb } from '../db/mongoClient';
import {
  ReportJobDocument,
  JobStatus,
  JobPhase,
  QueueReportRequest,
} from './jobTypes';

/**
 * MongoDB Job Store
 * 
 * Manages report generation jobs in a MongoDB 'jobs' collection.
 * Replaces the file-based job queue (jobManager.ts) with a proper 
 * database-backed queue.
 * 
 * Responsibilities:
 *   - Create new jobs (pending)
 *   - Update job status, phase, and progress
 *   - Fetch pending jobs for worker processing
 *   - Complete/fail jobs with result metadata
 * Collection: 'jobs'
 * Indexes: jobId (unique), status, createdAt
 */

const COLLECTION_NAME = 'jobs';

// ─── Collection Access ───────────────────────────────────────────────

/**
 * Get the jobs collection with proper typing.
 */
async function getJobsCollection(): Promise<Collection<ReportJobDocument>> {
  const db = await getMongoDb();
  return db.collection<ReportJobDocument>(COLLECTION_NAME);
}

// ─── Index Setup ─────────────────────────────────────────────────────

let indexesCreated = false;

/**
 * Ensure required indexes exist on the jobs collection.
 * Called once on first access, idempotent.
 */
export async function ensureIndexes(): Promise<void> {
  if (indexesCreated) return;

  const collection = await getJobsCollection();

  await Promise.all([
    // Unique index on jobId for fast lookups
    collection.createIndex({ jobId: 1 }, { unique: true }),
    // Index on status for fetching pending jobs
    collection.createIndex({ status: 1, createdAt: 1 }),
  ]);

  // Drop legacy TTL index on expiresAt if it exists (jobs no longer auto-expire)
  try {
    await collection.dropIndex('expiresAt_1');
    console.log('Dropped legacy TTL index on expiresAt');
  } catch {
    // Index doesn't exist — ignore
  }

  indexesCreated = true;
  console.log('MongoDB job indexes ensured');
}

// ─── Create ──────────────────────────────────────────────────────────

/**
 * Create a new report job in 'pending' status.
 * Returns the created job document.
 */
export async function createJob(request: QueueReportRequest): Promise<ReportJobDocument> {
  await ensureIndexes();
  const collection = await getJobsCollection();

  const jobId = uuidv4();
  const selectedSheets =
    request.sheets && request.sheets.length > 0
      ? request.sheets
      : ['videos', 'transcriptions', 'showreels', 'redactions'];

  const now = new Date();

  const job: ReportJobDocument = {
    _id: new ObjectId(),
    jobId,
    status: 'pending',
    phase: 'queued',
    progress: 0,
    startDate: request.startDate,
    endDate: request.endDate,
    sheets: selectedSheets,
    createdAt: now,
  };

  await collection.insertOne(job);
  console.log(`Job created: ${jobId} (sheets: ${selectedSheets.join(', ')})`);

  return job;
}

// ─── Read ────────────────────────────────────────────────────────────

/**
 * Get a job by its human-readable jobId (UUID).
 */
export async function getJob(jobId: string): Promise<ReportJobDocument | null> {
  await ensureIndexes();
  const collection = await getJobsCollection();
  return collection.findOne({ jobId });
}

/**
 * Get a job by its MongoDB _id.
 */
export async function getJobById(id: string | ObjectId): Promise<ReportJobDocument | null> {
  const collection = await getJobsCollection();
  const objectId = typeof id === 'string' ? new ObjectId(id) : id;
  return collection.findOne({ _id: objectId });
}

/**
 * Get all pending jobs, ordered by creation time (FIFO).
 */
export async function getPendingJobs(): Promise<ReportJobDocument[]> {
  await ensureIndexes();
  const collection = await getJobsCollection();
  return collection
    .find({ status: 'pending' })
    .sort({ createdAt: 1 })
    .toArray();
}

/**
 * Get all jobs (optionally filtered by status).
 */
export async function getJobs(options?: {
  status?: JobStatus;
  limit?: number;
}): Promise<ReportJobDocument[]> {
  await ensureIndexes();
  const collection = await getJobsCollection();
  const filter = options?.status ? { status: options.status } : {};
  return collection
    .find(filter)
    .sort({ createdAt: -1 })
    .limit(options?.limit || 100)
    .toArray();
}

// ─── Update ──────────────────────────────────────────────────────────

/**
 * Update a job with partial fields.
 * Returns the updated document.
 */
export async function updateJob(
  jobId: string,
  updates: Partial<Omit<ReportJobDocument, '_id' | 'jobId'>>
): Promise<ReportJobDocument | null> {
  const collection = await getJobsCollection();
  const result = await collection.findOneAndUpdate(
    { jobId },
    { $set: updates },
    { returnDocument: 'after' }
  );
  return result;
}

/**
 * Mark a job as 'processing' (worker has picked it up).
 */
export async function startProcessing(jobId: string): Promise<ReportJobDocument | null> {
  return updateJob(jobId, {
    status: 'processing',
    phase: 'initializing',
    progress: 0,
    startedAt: new Date(),
  });
}

/**
 * Atomically claim the next pending job (FIFO).
 * Uses findOneAndUpdate so concurrent callers never claim the same job.
 * Returns null when no pending jobs remain.
 */
export async function claimNextPendingJob(): Promise<ReportJobDocument | null> {
  await ensureIndexes();
  const collection = await getJobsCollection();
  const result = await collection.findOneAndUpdate(
    { status: 'pending' },
    {
      $set: {
        status: 'processing',
        phase: 'initializing',
        progress: 0,
        startedAt: new Date(),
      },
    },
    { sort: { createdAt: 1 }, returnDocument: 'after' },
  );
  return result ?? null;
}

/**
 * Update job progress during processing.
 * Called by the worker after each chunk is processed.
 */
export async function updateProgress(
  jobId: string,
  progress: number,
  phase: JobPhase,
  details?: ReportJobDocument['progressDetails']
): Promise<ReportJobDocument | null> {
  const updates: Partial<ReportJobDocument> = {
    progress: Math.min(100, Math.max(0, progress)),
    phase,
  };
  if (details) {
    updates.progressDetails = details;
  }
  return updateJob(jobId, updates);
}

/**
 * Mark a job as 'completed' with file metadata.
 */
export async function completeJob(
  jobId: string,
  result: {
    fileId: string;
    fileName: string;
    fileSize: string;
    recordCount: number;
    downloadUrl: string;
  }
): Promise<ReportJobDocument | null> {
  const now = new Date();

  return updateJob(jobId, {
    status: 'completed',
    phase: 'completed',
    progress: 100,
    completedAt: now,
    fileId: result.fileId,
    fileName: result.fileName,
    fileSize: result.fileSize,
    recordCount: result.recordCount,
    downloadUrl: result.downloadUrl,
  });
}

/**
 * Mark a job as 'failed' with an error message.
 */
export async function failJob(
  jobId: string,
  errorMessage: string
): Promise<ReportJobDocument | null> {
  return updateJob(jobId, {
    status: 'failed',
    phase: 'failed',
    completedAt: new Date(),
    errorMessage,
  });
}

/**
 * Get count of jobs by status (for monitoring/dashboard).
 */
export async function getJobCounts(): Promise<Record<JobStatus, number>> {
  const collection = await getJobsCollection();

  const pipeline = [
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ];

  const results = await collection.aggregate(pipeline).toArray();

  const counts: Record<JobStatus, number> = {
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
  };

  for (const result of results) {
    const status = result._id as JobStatus;
    if (status in counts) {
      counts[status] = result.count;
    }
  }

  return counts;
}
