import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

export interface ReportJob {
  id: string;
  email: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  startDate: string;
  endDate: string;
  createdAt: string;
  completedAt?: string;
  fileName?: string;
  fileSize?: string;
  recordCount?: number;
  downloadUrl?: string;
  expiresAt?: string;
  errorMessage?: string;
}

const JOBS_DIR = path.join(process.cwd(), 'reports', 'jobs');
const JOBS_FILE = path.join(JOBS_DIR, 'jobs.json');
const REPORTS_DIR = path.join(process.cwd(), 'public', 'reports');

/**
 * Ensure required directories exist
 */
export function ensureDirectories() {
  if (!fs.existsSync(JOBS_DIR)) {
    fs.mkdirSync(JOBS_DIR, { recursive: true });
  }
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }
  if (!fs.existsSync(JOBS_FILE)) {
    fs.writeFileSync(JOBS_FILE, JSON.stringify([], null, 2));
  }
}

/**
 * Read all jobs from jobs.json
 */
export function readJobs(): ReportJob[] {
  try {
    ensureDirectories();
    const data = fs.readFileSync(JOBS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading jobs:', error);
    return [];
  }
}

/**
 * Write jobs to jobs.json
 */
export function writeJobs(jobs: ReportJob[]) {
  try {
    ensureDirectories();
    fs.writeFileSync(JOBS_FILE, JSON.stringify(jobs, null, 2));
  } catch (error) {
    console.error('Error writing jobs:', error);
    throw error;
  }
}

/**
 * Create a new job
 */
export function createJob(email: string, startDate: string, endDate: string): ReportJob {
  const jobs = readJobs();
  
  const newJob: ReportJob = {
    id: uuidv4(),
    email,
    status: 'pending',
    startDate,
    endDate,
    createdAt: new Date().toISOString(),
  };

  jobs.push(newJob);
  writeJobs(jobs);
  
  return newJob;
}

/**
 * Get job by ID
 */
export function getJob(jobId: string): ReportJob | undefined {
  const jobs = readJobs();
  return jobs.find(job => job.id === jobId);
}

/**
 * Update job status and metadata
 */
export function updateJob(jobId: string, updates: Partial<ReportJob>) {
  const jobs = readJobs();
  const index = jobs.findIndex(job => job.id === jobId);
  
  if (index === -1) {
    throw new Error(`Job ${jobId} not found`);
  }

  jobs[index] = { ...jobs[index], ...updates };
  writeJobs(jobs);
  
  return jobs[index];
}

/**
 * Get pending jobs
 */
export function getPendingJobs(): ReportJob[] {
  const jobs = readJobs();
  return jobs.filter(job => job.status === 'pending');
}

/**
 * Mark job as processing
 */
export function startProcessing(jobId: string) {
  return updateJob(jobId, { status: 'processing' });
}

/**
 * Mark job as completed
 */
export function completeJob(
  jobId: string, 
  fileName: string, 
  fileSize: string, 
  recordCount: number
) {
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24); // 24 hours from now

  return updateJob(jobId, {
    status: 'completed',
    completedAt: new Date().toISOString(),
    fileName,
    fileSize,
    recordCount,
    downloadUrl: `/reports/${fileName}`,
    expiresAt: expiresAt.toISOString(),
  });
}

/**
 * Mark job as failed
 */
export function failJob(jobId: string, errorMessage: string) {
  return updateJob(jobId, {
    status: 'failed',
    completedAt: new Date().toISOString(),
    errorMessage,
  });
}

/**
 * Delete expired reports (older than 24 hours)
 */
export function cleanupExpiredReports() {
  try {
    const jobs = readJobs();
    const now = new Date();
    let deletedCount = 0;

    const updatedJobs = jobs.filter(job => {
      if (job.status === 'completed' && job.expiresAt) {
        const expiresAt = new Date(job.expiresAt);
        
        if (now > expiresAt) {
          // Delete the file
          if (job.fileName) {
            const filePath = path.join(REPORTS_DIR, job.fileName);
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
              console.log(`Deleted expired report: ${job.fileName}`);
            }
          }
          deletedCount++;
          return false; // Remove from jobs list
        }
      }
      return true; // Keep the job
    });

    if (deletedCount > 0) {
      writeJobs(updatedJobs);
      console.log(`Cleaned up ${deletedCount} expired reports`);
    }

    return deletedCount;
  } catch (error) {
    console.error('Error cleaning up expired reports:', error);
    return 0;
  }
}

/**
 * Get file size in human-readable format
 */
export function getFileSizeString(filePath: string): string {
  try {
    const stats = fs.statSync(filePath);
    const bytes = stats.size;
    
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  } catch (error) {
    return 'Unknown';
  }
}
