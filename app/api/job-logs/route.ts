import { NextRequest, NextResponse } from 'next/server';
import { getLogFilePath, readJobLog, formatLogForDisplay, listActiveLogs } from '@/lib/jobLogger';

export const dynamic = 'force-dynamic';

/**
 * GET /api/job-logs?jobId=xxx - Get log file for a specific job
 * GET /api/job-logs?list=true - List all active log files
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const jobId = searchParams.get('jobId');
    const listAll = searchParams.get('list') === 'true';

    // List all active logs
    if (listAll) {
      const logFiles = listActiveLogs();
      const formattedLogs = logFiles
        .map(logFile => formatLogForDisplay(logFile))
        .filter(log => log !== null);

      return NextResponse.json({
        success: true,
        count: formattedLogs.length,
        logs: formattedLogs,
      });
    }

    // Get specific job log
    if (!jobId) {
      return NextResponse.json(
        { error: 'jobId parameter is required' },
        { status: 400 }
      );
    }

    const logFilePath = getLogFilePath(jobId);
    
    if (!logFilePath) {
      return NextResponse.json(
        { error: 'Log file not found for this job (may have been deleted after 2 hours)' },
        { status: 404 }
      );
    }

    const logContent = readJobLog(logFilePath);
    
    if (!logContent) {
      return NextResponse.json(
        { error: 'Unable to read log file' },
        { status: 500 }
      );
    }

    const logInfo = formatLogForDisplay(logFilePath);

    return NextResponse.json({
      success: true,
      jobId,
      logInfo,
      content: logContent,
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
