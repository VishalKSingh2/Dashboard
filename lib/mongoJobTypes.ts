import { ObjectId } from 'mongodb';

/**
 * MongoDB Job Store Types
 * 
 * Defines the shape of job documents stored in the MongoDB 'jobs' collection.
 * This replaces the file-based ReportJob interface from jobManager.ts.
 */

// ─── Job Status ──────────────────────────────────────────────────────

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export type JobPhase =
  | 'queued'
  | 'initializing'
  | 'fetching_data'
  | 'streaming_data'
  | 'finalizing'
  | 'uploading'
  | 'completed'
  | 'failed';

// ─── Job Document ────────────────────────────────────────────────────

export interface ReportJobDocument {
  /** MongoDB document ID */
  _id: ObjectId;

  /** Human-readable job ID (UUID) */
  jobId: string;

  /** User's email for notification */
  email: string;

  /** Current job status */
  status: JobStatus;

  /** Current processing phase (more granular than status) */
  phase: JobPhase;

  /** Progress percentage (0–100) */
  progress: number;

  // ── Report Parameters ──

  /** Start date of the report range (ISO string) */
  startDate: string;

  /** End date of the report range (ISO string) */
  endDate: string;

  /** Selected sheet types to generate */
  sheets: string[];

  // ── Timestamps ──

  /** When the job was created */
  createdAt: Date;

  /** When processing started */
  startedAt?: Date;

  /** When the job completed or failed */
  completedAt?: Date;

  /** When the report file expires (auto-cleanup) */
  expiresAt?: Date;

  // ── Result (on completion) ──

  /** GridFS file ID of the generated report */
  fileId?: string;

  /** Original filename (e.g., "report_2026-02-16.xlsx") */
  fileName?: string;

  /** Human-readable file size (e.g., "150 MB") */
  fileSize?: string;

  /** Total number of records processed */
  recordCount?: number;

  /** Download URL for the completed report (/api/download/:fileId) */
  downloadUrl?: string;

  // ── Error (on failure) ──

  /** Error message if the job failed */
  errorMessage?: string;

  // ── Progress Details ──

  /** Detailed progress info for SSE updates */
  progressDetails?: {
    /** Current sheet being processed */
    currentSheet?: string;
    /** Number of rows processed so far */
    rowsProcessed?: number;
    /** Total estimated rows */
    totalRows?: number;
    /** Processing message */
    message?: string;
  };
}

// ─── API Input ───────────────────────────────────────────────────────

/** Request body for POST /api/queue-report */
export interface QueueReportRequest {
  email: string;
  startDate: string;
  endDate: string;
  sheets?: string[];
}

// ─── SSE Event Types ─────────────────────────────────────────────────

/** Shape of SSE events sent to the client */
export interface JobSSEEvent {
  type: 'status' | 'progress' | 'completed' | 'failed' | 'heartbeat';
  jobId: string;
  status: JobStatus;
  phase: JobPhase;
  progress: number;
  downloadUrl?: string;
  fileName?: string;
  fileSize?: string;
  recordCount?: number;
  errorMessage?: string;
  progressDetails?: ReportJobDocument['progressDetails'];
  timestamp: string;
}
