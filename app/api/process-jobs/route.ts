import { NextRequest, NextResponse } from 'next/server';
import { 
  getPendingJobs, 
  startProcessing, 
  completeJob, 
  failJob,
  getFileSizeString,
  cleanupExpiredReports
} from '@/lib/jobManager';
import { generateAdvancedReportExcel } from '@/lib/advancedReportGenerator';
import { sendReportReadyEmail, sendReportFailedEmail } from '@/lib/emailService';

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

      try {
        // Mark as processing
        startProcessing(job.id);

        // Generate the report
        const result = await generateAdvancedReportExcel(
          job.startDate,
          job.endDate
        );

        // Get file size
        const fileSize = getFileSizeString(result.filePath);

        // Mark as completed
        const updatedJob = completeJob(
          job.id,
          result.fileName,
          fileSize,
          result.recordCount
        );

        // Send success email
        await sendReportReadyEmail(
          job.email,
          updatedJob.downloadUrl!,
          job.startDate,
          job.endDate,
          result.recordCount,
          fileSize
        );

        console.log(`Job ${job.id} completed successfully`);
      } catch (error) {
        console.error(`Job ${job.id} failed:`, error);
        
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        // Mark as failed
        failJob(job.id, errorMessage);

        // Send failure email
        await sendReportFailedEmail(
          job.email,
          job.startDate,
          job.endDate,
          errorMessage
        );
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
