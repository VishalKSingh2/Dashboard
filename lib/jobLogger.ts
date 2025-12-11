import fs from 'fs';
import path from 'path';

const LOGS_DIR = path.join(process.cwd(), 'reports', 'logs');
const LOG_RETENTION_MS = 2 * 60 * 60 * 1000; // 2 hours in milliseconds

/**
 * Ensure logs directory exists
 */
function ensureLogsDir() {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
}

/**
 * Create a new log file for a job
 */
export function createJobLog(jobId: string): string {
  ensureLogsDir();
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logFileName = `job_${jobId}_${timestamp}.log`;
  const logFilePath = path.join(LOGS_DIR, logFileName);
  
  // Create log file with initial entry
  const initialLog = [
    '='.repeat(80),
    `Job Log Created`,
    `Job ID: ${jobId}`,
    `Timestamp: ${new Date().toISOString()}`,
    `Log File: ${logFileName}`,
    '='.repeat(80),
    '',
  ].join('\n');
  
  fs.writeFileSync(logFilePath, initialLog);
  
  console.log(`[JobLogger] Log file created: ${logFilePath}`);
  
  // Schedule automatic deletion after 2 hours
  scheduleLogDeletion(logFilePath, jobId);
  
  return logFilePath;
}

/**
 * Append log entry to job log file
 */
export function appendJobLog(logFilePath: string, message: string, level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS' = 'INFO') {
  if (!fs.existsSync(logFilePath)) {
    console.error(`[JobLogger] Log file not found: ${logFilePath}`);
    return;
  }
  
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] [${level}] ${message}\n`;
  
  fs.appendFileSync(logFilePath, logEntry);
  console.log(`[JobLogger] ${level}: ${message}`);
}

/**
 * Read log file contents
 */
export function readJobLog(logFilePath: string): string | null {
  if (!fs.existsSync(logFilePath)) {
    return null;
  }
  
  return fs.readFileSync(logFilePath, 'utf-8');
}

/**
 * Schedule automatic deletion of log file after 2 hours
 */
function scheduleLogDeletion(logFilePath: string, jobId: string) {
  setTimeout(() => {
    try {
      if (fs.existsSync(logFilePath)) {
        fs.unlinkSync(logFilePath);
        console.log(`[JobLogger] Log file deleted after 2 hours: ${logFilePath}`);
      }
    } catch (error) {
      console.error(`[JobLogger] Error deleting log file for job ${jobId}:`, error);
    }
  }, LOG_RETENTION_MS);
  
  console.log(`[JobLogger] Scheduled deletion for log file in 2 hours: ${logFilePath}`);
}

/**
 * Manually clean up old log files (backup cleanup mechanism)
 * Deletes logs older than 2 hours
 */
export function cleanupOldLogs() {
  ensureLogsDir();
  
  const now = Date.now();
  const files = fs.readdirSync(LOGS_DIR);
  let deletedCount = 0;
  
  files.forEach(file => {
    const filePath = path.join(LOGS_DIR, file);
    const stats = fs.statSync(filePath);
    const fileAge = now - stats.mtimeMs;
    
    if (fileAge > LOG_RETENTION_MS) {
      try {
        fs.unlinkSync(filePath);
        deletedCount++;
        console.log(`[JobLogger] Cleaned up old log: ${file}`);
      } catch (error) {
        console.error(`[JobLogger] Error deleting old log ${file}:`, error);
      }
    }
  });
  
  if (deletedCount > 0) {
    console.log(`[JobLogger] Cleanup completed: ${deletedCount} old log file(s) deleted`);
  }
  
  return deletedCount;
}

/**
 * Get log file path for a job ID
 */
export function getLogFilePath(jobId: string): string | null {
  ensureLogsDir();
  
  const files = fs.readdirSync(LOGS_DIR);
  const logFile = files.find(file => file.startsWith(`job_${jobId}_`));
  
  return logFile ? path.join(LOGS_DIR, logFile) : null;
}

/**
 * List all active log files
 */
export function listActiveLogs(): string[] {
  ensureLogsDir();
  
  return fs.readdirSync(LOGS_DIR).map(file => path.join(LOGS_DIR, file));
}

/**
 * Format log file for display
 */
export function formatLogForDisplay(logFilePath: string): { jobId: string; createdAt: string; age: string; size: string } | null {
  if (!fs.existsSync(logFilePath)) {
    return null;
  }
  
  const stats = fs.statSync(logFilePath);
  const fileName = path.basename(logFilePath);
  const match = fileName.match(/job_([^_]+)_(.+)\.log/);
  
  if (!match) {
    return null;
  }
  
  const jobId = match[1];
  const ageMs = Date.now() - stats.mtimeMs;
  const ageMinutes = Math.floor(ageMs / 60000);
  const sizeKB = (stats.size / 1024).toFixed(2);
  
  return {
    jobId,
    createdAt: stats.mtime.toISOString(),
    age: `${ageMinutes} minutes ago`,
    size: `${sizeKB} KB`,
  };
}


