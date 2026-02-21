import { NextRequest, NextResponse } from 'next/server';
import {
  getPendingJobs,
  startProcessing,
  completeJob,
  failJob,
  updateProgress,
  cleanupExpiredJobs,
} from '@/lib/mongoJobStore';
import { generateReportToGridFS } from '@/lib/gridfsReportGenerator';
import { buildDownloadUrl, deleteFiles } from '@/lib/gridfs';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes max execution time

/**
 * POST /api/process-jobs
 * 
 * Worker endpoint — picks up pending jobs from MongoDB,
 * generates reports streamed into GridFS, and sends email notifications.
 * 
 * Sequence diagram flow:
 *   Worker picks pending job → Update status "processing"
 *   → Fetch chunks from DB → Write Excel → Stream to GridFS
 *   → Update status "completed" + downloadUrl
 *   → Send email notification
 */

// Simple in-memory lock to prevent concurrent processing
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

    // Cleanup expired jobs + their GridFS files
    console.log('Cleaning up expired jobs...');
    try {
      const expiredFileIds = await cleanupExpiredJobs();
      if (expiredFileIds.length > 0) {
        await deleteFiles(expiredFileIds);
        console.log(`Deleted ${expiredFileIds.length} expired GridFS files`);
      }
    } catch (cleanupErr) {
      console.warn('Cleanup warning (non-fatal):', cleanupErr);
    }

    // Get pending jobs from MongoDB
    const pendingJobs = await getPendingJobs();
    console.log(`Found ${pendingJobs.length} pending jobs`);

    if (pendingJobs.length === 0) {
      isProcessing = false;
      return NextResponse.json({
        message: 'No pending jobs to process',
      });
    }

    // Process each job sequentially
    for (const job of pendingJobs) {
      console.log(`Processing job ${job.jobId}`);

      try {
        // Mark as processing in MongoDB
        await startProcessing(job.jobId);

        // Generate report → stream to GridFS
        const startTime = Date.now();
        const result = await generateReportToGridFS(
          job.startDate,
          job.endDate,
          job.sheets,
          // Progress callback — updates MongoDB job record
          async (progress, phase, details) => {
            await updateProgress(job.jobId, progress, phase, details);
          },
        );
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`Report generated in ${duration}s`);

        // Build download URL
        const downloadUrl = buildDownloadUrl(result.fileId);

        // Mark job completed in MongoDB
        await completeJob(job.jobId, {
          fileId: result.fileId,
          fileName: result.fileName,
          fileSize: result.fileSize,
          recordCount: result.recordCount,
          downloadUrl,
        });

        console.log(`Job ${job.jobId} completed. Download: ${downloadUrl}`);
      } catch (error) {
        console.error(`Job ${job.jobId} failed:`, error);

        const errorMessage = error instanceof Error
          ? error.message
          : 'Unknown error';

        // Mark job failed in MongoDB
        await failJob(job.jobId, errorMessage);
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
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
