import { NextRequest, NextResponse } from 'next/server';
import { createJob } from '@/lib/jobManager';

export const dynamic = 'force-dynamic';

interface QueueReportRequest {
  email: string;
  startDate: string;
  endDate: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: QueueReportRequest = await request.json();
    const { email, startDate, endDate } = body;

    // Validate input
    if (!email || !startDate || !endDate) {
      return NextResponse.json(
        { error: 'Email, start date, and end date are required' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email address' },
        { status: 400 }
      );
    }

    // Create job
    const job = createJob(email, startDate, endDate);

    console.log('Report job queued:', {
      jobId: job.id,
      email: job.email,
      dateRange: `${startDate} to ${endDate}`,
    });

    // Trigger background processing (fire and forget)
    // This will be handled by the processJobs API
    fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/process-jobs`, {
      method: 'POST',
    }).catch(err => console.error('Failed to trigger job processing:', err));

    return NextResponse.json({
      success: true,
      message: 'Report generation queued successfully',
      jobId: job.id,
      email: job.email,
      estimatedTime: 'Your report will be ready in a few minutes. Check your email for the download link.',
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
