import { NextRequest, NextResponse } from 'next/server';
import { getJob, getJobs } from '@/lib/jobs';

export const dynamic = 'force-dynamic';

/**
 * GET /api/job-logs?jobId=xxx  - Get status/progress for a specific job
 * GET /api/job-logs?list=true  - List all recent jobs
 * 
 * Now reads from MongoDB instead of file-based logs.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const jobId = searchParams.get('jobId');
    const listAll = searchParams.get('list') === 'true';

    // List all recent jobs
    if (listAll) {
      const jobs = await getJobs({ limit: 50 });

      const formattedJobs = jobs.map((job) => ({
        jobId: job.jobId,
        status: job.status,
        phase: job.phase,
        progress: job.progress,
        sheets: job.sheets,
        startDate: job.startDate,
        endDate: job.endDate,
        createdAt: job.createdAt,
        completedAt: job.completedAt,
        fileName: job.fileName,
        fileSize: job.fileSize,
        recordCount: job.recordCount,
        downloadUrl: job.downloadUrl,
        errorMessage: job.errorMessage,
        progressDetails: job.progressDetails,
      }));

      return NextResponse.json({
        success: true,
        count: formattedJobs.length,
        jobs: formattedJobs,
      });
    }

    // Get specific job
    if (!jobId) {
      return NextResponse.json(
        { error: 'jobId parameter is required' },
        { status: 400 }
      );
    }

    const job = await getJob(jobId);

    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      jobId: job.jobId,
      status: job.status,
      phase: job.phase,
      progress: job.progress,
      sheets: job.sheets,
      startDate: job.startDate,
      endDate: job.endDate,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      fileName: job.fileName,
      fileSize: job.fileSize,
      recordCount: job.recordCount,
      downloadUrl: job.downloadUrl,
      errorMessage: job.errorMessage,
      progressDetails: job.progressDetails,
    });
  } catch (error) {
    console.error('Error reading job logs:', error);
    return NextResponse.json(
      { 
        error: 'Failed to read job logs',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
