import { NextRequest, NextResponse } from 'next/server';
import {
  claimNextPendingJob,
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
 * Worker endpoint — atomically claims pending jobs from MongoDB one at a time,
 * generates reports streamed into GridFS.
 *
 * Uses MongoDB findOneAndUpdate for atomic job claiming, so multiple
 * concurrent calls are safe — no in-memory lock needed.
 */

export async function POST(request: NextRequest) {
  try {
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

    // Atomically claim and process jobs one at a time until none remain.
    // claimNextPendingJob uses findOneAndUpdate so concurrent callers
    // never claim the same job — no in-memory lock required.
    let totalProcessed = 0;

    while (true) {
      const job = await claimNextPendingJob();

      if (!job) {
        console.log('No more pending jobs to process');
        break;
      }

      console.log(`Claimed job ${job.jobId} — processing...`);

      try {
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

      totalProcessed++;
    }

    if (totalProcessed === 0) {
      return NextResponse.json({ message: 'No pending jobs to process' });
    }

    return NextResponse.json({
      success: true,
      message: `Processed ${totalProcessed} jobs`,
      processedCount: totalProcessed,
    });
  } catch (error) {
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
