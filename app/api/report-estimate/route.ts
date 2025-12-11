import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface EstimateRequest {
  startDate: string;
  endDate: string;
}

/**
 * Get estimated record counts for each sheet type
 */
export async function POST(request: NextRequest) {
  try {
    const body: EstimateRequest = await request.json();
    const { startDate, endDate } = body;

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'Start date and end date are required' },
        { status: 400 }
      );
    }

    console.log('Estimating report for date range:', { startDate, endDate });

    // Run fast COUNT queries in parallel
    const [videosResult, transcriptionsResult, showreelsResult, redactionsResult] = await Promise.all([
      // Videos count
      query(`
        SELECT COUNT(*) as count
        FROM VideoStaging vs
        WHERE vs.CreatedDate >= @Start 
          AND vs.CreatedDate < DATEADD(DAY, 1, @End)
          AND vs.VideoId IS NOT NULL
      `, { Start: startDate, End: endDate }).catch(err => {
        console.error('Videos count error:', err);
        return [{ count: 0 }];
      }),
      
      // Transcriptions count
      query(`
        SELECT COUNT(*) as count
        FROM [TranscriptionStaging] trs
        WHERE trs.CreatedDate >= @Start 
          AND trs.CreatedDate < DATEADD(DAY, 1, @End)
      `, { Start: startDate, End: endDate }).catch(err => {
        console.error('Transcriptions count error:', err);
        return [{ count: 0 }];
      }),
      
      // Showreels count
      query(`
        SELECT COUNT(*) as count
        FROM ShowreelStaging ss
        WHERE ss.Created >= @Start 
          AND ss.Created < DATEADD(DAY, 1, @End)
      `, { Start: startDate, End: endDate }).catch(err => {
        console.error('Showreels count error:', err);
        return [{ count: 0 }];
      }),
      
      // Redactions count
      query(`
        SELECT COUNT(*) as count
        FROM RedactionRequest rr
        WHERE rr.Created >= @Start 
          AND rr.Created < DATEADD(DAY, 1, @End)
      `, { Start: startDate, End: endDate }).catch(err => {
        console.error('Redactions count error:', err);
        return [{ count: 0 }];
      })
    ]);

    const counts = {
      videos: parseInt(videosResult[0]?.count?.toString() || '0', 10),
      transcriptions: parseInt(transcriptionsResult[0]?.count?.toString() || '0', 10),
      showreels: parseInt(showreelsResult[0]?.count?.toString() || '0', 10),
      redactions: parseInt(redactionsResult[0]?.count?.toString() || '0', 10),
    };

    console.log('Estimated counts:', counts);

    return NextResponse.json({
      success: true,
      counts,
      dateRange: { startDate, endDate }
    });
  } catch (error) {
    console.error('Report estimate error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to estimate report size',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
