import { Collection, ObjectId } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import { getMongoDb } from './mongodb';
import {
  ReportJobDocument,
  JobStatus,
  JobPhase,
  QueueReportRequest,
} from './mongoJobTypes';

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
 *   - Cleanup expired jobs and their GridFS files
 * 
 * Collection: 'jobs'
 * Indexes: jobId (unique), status, createdAt, expiresAt
 */

const COLLECTION_NAME = 'jobs';

/** Report files expire after 24 hours */
const EXPIRY_HOURS = 24;

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
    // TTL index — MongoDB auto-deletes docs after expiresAt
    // Note: Only deletes completed/failed jobs that have expiresAt set
    collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]);

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
    email: request.email,
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
  const expiresAt = new Date(now.getTime() + EXPIRY_HOURS * 60 * 60 * 1000);

  return updateJob(jobId, {
    status: 'completed',
    phase: 'completed',
    progress: 100,
    completedAt: now,
    expiresAt,
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

// ─── Cleanup ─────────────────────────────────────────────────────────

/**
 * Manually clean up expired jobs and return their file IDs 
 * so the caller can also delete GridFS files.
 * 
 * Note: The TTL index on expiresAt handles automatic document deletion,
 * but this method is useful for explicitly cleaning up GridFS files
 * before the TTL kicks in.
 */
export async function cleanupExpiredJobs(): Promise<string[]> {
  const collection = await getJobsCollection();
  const now = new Date();

  // Find expired jobs that have file IDs (need GridFS cleanup)
  const expiredJobs = await collection
    .find({
      expiresAt: { $lte: now },
      fileId: { $exists: true, $ne: '' },
    })
    .toArray();

  const fileIds = expiredJobs
    .map((job) => job.fileId)
    .filter((id): id is string => !!id);

  if (expiredJobs.length > 0) {
    // Delete the expired job documents
    await collection.deleteMany({
      expiresAt: { $lte: now },
    });
    console.log(`Cleaned up ${expiredJobs.length} expired jobs`);
  }

  return fileIds;
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
