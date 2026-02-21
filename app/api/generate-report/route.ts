import { NextRequest, NextResponse } from 'next/server';
import { generateReportToGridFS } from '@/lib/gridfsReportGenerator';
import { buildDownloadUrl } from '@/lib/gridfs';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes max execution time

/**
 * POST /api/generate-report
 * 
 * Generates a report, stores it in GridFS, and returns the download URL.
 * The client then redirects/downloads from /api/download/:fileId.
 * 
 * This replaces the old synchronous blob-download approach.
 */

interface GenerateReportRequest {
  startDate: string;
  endDate: string;
  sheets?: string[];
}

export async function POST(request: NextRequest) {
  try {
    const body: GenerateReportRequest = await request.json();
    const { startDate, endDate, sheets } = body;

    // Validate input
    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'Start date and end date are required' },
        { status: 400 }
      );
    }

    // Validate sheets if provided
    const validSheets = ['videos', 'transcriptions', 'showreels', 'redactions'];
    const selectedSheets = sheets && sheets.length > 0 ? sheets : validSheets;
    
    const invalidSheets = selectedSheets.filter(sheet => !validSheets.includes(sheet));
    if (invalidSheets.length > 0) {
      return NextResponse.json(
        { error: `Invalid sheets: ${invalidSheets.join(', ')}` },
        { status: 400 }
      );
    }

    console.log('Generating report:', {
      startDate,
      endDate,
      sheets: selectedSheets.join(', '),
    });

    // Generate the report and store in GridFS
    const startTime = Date.now();
    const result = await generateReportToGridFS(startDate, endDate, selectedSheets);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`Report generated in ${duration}s: ${result.fileName} (${result.fileSize})`);

    // Return the download URL — client will fetch from /api/download/:fileId
    const downloadUrl = buildDownloadUrl(result.fileId);

    return NextResponse.json({
      success: true,
      fileName: result.fileName,
      fileSize: result.fileSize,
      recordCount: result.recordCount,
      downloadUrl,
    });
  } catch (error) {
    console.error('Report generation error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to generate report',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
