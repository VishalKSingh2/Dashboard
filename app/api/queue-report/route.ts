import { NextRequest, NextResponse } from 'next/server';
import { createJob } from '@/lib/jobs';
import { QueueReportRequest } from '@/lib/jobs';

export const dynamic = 'force-dynamic';

/**
 * POST /api/queue-report
 * 
 * Creates a new report job in MongoDB (pending status)
 * and triggers background processing.
 * 
 * Flow (sequence diagram step 1-3):
 *   Client → POST /api/queue-report
 *          → MongoDB creates job (pending)
 *          → Returns { jobId }
 */
export async function POST(request: NextRequest) {
  try {
    const body: QueueReportRequest = await request.json();
    const { startDate, endDate, sheets } = body;

    // Validate input
    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'Start date and end date are required' },
        { status: 400 }
      );
    }

    // Create job in MongoDB
    const job = await createJob({ startDate, endDate, sheets });

    console.log('Report job queued:', {
      jobId: job.jobId,
      dateRange: `${startDate} to ${endDate}`,
      sheets: job.sheets?.join(', ') || 'all',
    });

    // Trigger background processing (fire and forget)
    fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/process-jobs`, {
      method: 'POST',
    }).catch(err => console.error('Failed to trigger job processing:', err));

    return NextResponse.json({
      success: true,
      message: 'Report generation queued successfully',
      jobId: job.jobId,
    });
  } catch (error) {
    console.error('Queue report error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to queue report',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
