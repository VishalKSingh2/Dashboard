import { NextRequest, NextResponse } from 'next/server';
import { 
  getPendingJobs, 
  startProcessing, 
  completeJob, 
  failJob,
  getFileSizeString,
  cleanupExpiredReports,
  getJob
} from '@/lib/jobManager';
import { generateAdvancedReportExcel } from '@/lib/advancedReportGenerator';
import { sendReportReadyEmail, sendReportFailedEmail } from '@/lib/emailService';
import { appendJobLog } from '@/lib/jobLogger';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes max execution time

// Track if processing is already running (simple in-memory lock)
let isProcessing = false;

export async function POST(request: NextRequest) {
  try {
    // Prevent concurrent processing
    if (isProcessing) {
      return NextResponse.json({
        message: 'Job processing already in progress',
      });
    }

    isProcessing = true;

    // Cleanup expired reports first
    console.log('Cleaning up expired reports...');
    cleanupExpiredReports();

    // Get pending jobs
    const pendingJobs = getPendingJobs();
    console.log(`Found ${pendingJobs.length} pending jobs`);

    if (pendingJobs.length === 0) {
      isProcessing = false;
      return NextResponse.json({
        message: 'No pending jobs to process',
      });
    }

    // Process each job (one at a time for simplicity)
    for (const job of pendingJobs) {
      console.log(`Processing job ${job.id} for ${job.email}`);
      
      if (job.logFilePath) {
        appendJobLog(job.logFilePath, '='.repeat(60), 'INFO');
        appendJobLog(job.logFilePath, 'Starting report generation process', 'INFO');
      }

      try {
        // Mark as processing
        startProcessing(job.id);

        if (job.logFilePath) {
          appendJobLog(job.logFilePath, 'Initializing Excel workbook...', 'INFO');
          appendJobLog(job.logFilePath, 'Preparing to fetch data from database...', 'INFO');
        }

        // Generate the report
        const startTime = Date.now();
        const result = await generateAdvancedReportExcel(
          job.startDate,
          job.endDate,
          job.sheets
        );
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        if (job.logFilePath) {
          appendJobLog(job.logFilePath, `Report generation completed in ${duration}s`, 'SUCCESS');
        }

        // Get file size
        const fileSize = getFileSizeString(result.filePath);

        // Mark as completed (this also logs completion details)
        const updatedJob = completeJob(
          job.id,
          result.fileName,
          fileSize,
          result.recordCount
        );

        if (job.logFilePath) {
          appendJobLog(job.logFilePath, 'Sending email notification...', 'INFO');
        }

        // Send success email
        await sendReportReadyEmail(
          job.email,
          updatedJob.downloadUrl!,
          job.startDate,
          job.endDate,
          result.recordCount,
          fileSize,
          job.sheets
        );

        if (job.logFilePath) {
          appendJobLog(job.logFilePath, `Email sent successfully to ${job.email}`, 'SUCCESS');
        }

        console.log(`Job ${job.id} completed successfully`);
      } catch (error) {
        console.error(`Job ${job.id} failed:`, error);
        
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        if (job.logFilePath) {
          appendJobLog(job.logFilePath, `CRITICAL ERROR: ${errorMessage}`, 'ERROR');
          appendJobLog(job.logFilePath, 'Sending failure notification email...', 'INFO');
        }
        
        // Mark as failed (this also logs the failure)
        failJob(job.id, errorMessage);

        // Send failure email
        await sendReportFailedEmail(
          job.email,
          job.startDate,
          job.endDate,
          errorMessage
        );
        
        if (job.logFilePath) {
          appendJobLog(job.logFilePath, `Failure email sent to ${job.email}`, 'INFO');
        }
      }
    }

    isProcessing = false;

    return NextResponse.json({
      success: true,
      message: `Processed ${pendingJobs.length} jobs`,
      processedCount: pendingJobs.length,
    });
  } catch (error) {
    isProcessing = false;
    console.error('Job processing error:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to process jobs',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
