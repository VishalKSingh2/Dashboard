import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { format } from 'date-fns';

export const dynamic = 'force-dynamic';

interface AdvancedReportParams {
  startDate: string;
  endDate: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: AdvancedReportParams = await request.json();
    const { startDate, endDate } = body;

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'Start date and end date are required' },
        { status: 400 }
      );
    }

    // Add warning for large date ranges (more than 90 days)
    const start = new Date(startDate);
    const end = new Date(endDate);
    const daysDiff = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysDiff > 90) {
      console.warn('Large date range requested:', daysDiff, 'days');
    }

    // Execute all 4 queries in parallel
    const [videosData, transcriptionsData, showreelsData, redactionRequestsData] = await Promise.all([
      // Query 1: Videos (Limited to prevent memory issues with large exports)
      query(`
        SELECT TOP 100000
          DATEADD(MONTH, DATEDIFF(MONTH, 0, vs.CreatedDate), 0) AS [Month],
          vs.ClientId,
          c.Name AS ParentName,
          co.Name AS ClientName,
          vs.Title,
          vs.Id AS VideoId,
          vs.Region,
          vs.UserId,
          vs.CreatedDate AS Created,
          DATEDIFF(SECOND, '1970-01-01', vs.CreatedDate) AS CreatedUnix,
          vs.LanguageIsoCode,
          vs.Status,
          vs.TranscriptionStatus,
          vs.ViewCount,
          CAST(vs.LengthInMilliseconds AS MONEY) / 60000 AS LengthInMinutes,
          vs.Modified,
          DATEDIFF(SECOND, '1970-01-01', vs.Modified) AS ModifiedUnix,
          vs.MediaSource,
          vs.UploadSource,
          vs.LastUpdated
        FROM 
          [dbo].[VideoStatistics] AS vs
          LEFT JOIN ClientOverview co ON RTRIM(vs.ClientId) = RTRIM(co.Id)
          LEFT JOIN Customer c ON RTRIM(co.CustomerId) = RTRIM(c.Id)
        WHERE
          vs.CreatedDate >= @Start
          AND vs.CreatedDate < DATEADD(day, 1, @End)
        ORDER BY vs.CreatedDate DESC
      `, { Start: startDate, End: endDate }),

      // Query 2: Transcriptions (Using SPLUNK_TranscriptionRequestStatistics)
      query(`
        SELECT 
          DATEADD(MONTH, DATEDIFF(MONTH, 0, [trs].[RequestedDate]), 0) AS [Month],
          [trs].[Id],
          [trs].[VideoId],
          [trs].[ThirdPartyId],
          [trs].[ParentName],
          [trs].[ClientName],
          [trs].[ServiceName],
          [trs].[CreatedDate],
          [trs].[CreatedDateUnix],
          [trs].[RequestedDate],
          [trs].[RequestedDateUnix],
          [trs].[CompletedDate],
          [trs].[CompletedDateUnix],
          [trs].[Type],
          [trs].[TranscriptionStatus],
          [trs].[Status],
          [trs].[Title],
          [trs].[ToIsoCode],
          [trs].[ToThirdPartyIsoCode],
          [trs].[FromIsoCode],
          [trs].[Modified],
          [trs].[ModifiedUnix],
          CAST([trs].[LengthInMilliseconds] AS MONEY) / 60000 AS [LengthInMinutes],
          [trs].[MediaSource],
          [trs].[UploadSource],
          [trs].[Region],
          [trs].[LastUpdated]
        FROM 
          [dbo].[SPLUNK_TranscriptionRequestStatistics] AS [trs]
        WHERE
          [trs].[RequestedDate] >= @Start
          AND [trs].[RequestedDate] < @End
        ORDER BY [trs].[RequestedDate]
      `, { Start: startDate, End: endDate }).catch(() => []),

      // Query 3: Showreels (Fixed to use ProjectStatistics table)
      query(`
        SELECT 
          DATEADD(MONTH, DATEDIFF(MONTH, 0, ps.Modified), 0) AS [Month],
          ps.Id,
          c.Name AS ParentName,
          ps.UserId,
          co.Name AS Name,
          ps.Title,
          ps.Region,
          ps.ProjectStatusText,
          ps.PublishStatusText AS PublishStatus,
          ps.Modified,
          DATEDIFF(SECOND, '1970-01-01', ps.Modified) AS ModifiedUnix,
          CAST(ps.ProjectLengthInMilliseconds AS MONEY) / 60000 AS ProjectLengthInMinutes,
          ps.LastUpdated
        FROM 
          [dbo].[ProjectStatistics] AS ps
          LEFT JOIN ClientOverview co ON RTRIM(ps.ClientId) = RTRIM(co.Id)
          LEFT JOIN Customer c ON RTRIM(co.CustomerId) = RTRIM(c.Id)
        WHERE
          ps.Modified >= @Start
          AND ps.Modified < DATEADD(day, 1, @End)
        ORDER BY ps.Modified
      `, { Start: startDate, End: endDate }).catch(() => []),

      // Query 4: Redaction Requests (if table exists)
      query(`
        SELECT 
          DATEADD(MONTH, DATEDIFF(MONTH, 0, rrs.CompletedDate), 0) AS [Month],
          rrs.Id,
          rrs.LastUpdated,
          rrs.CreatedDate,
          rrs.ContentId,
          rrs.ContentType,
          rrs.RequestedDate,
          rrs.CompletedDate,
          rrs.Status,
          rrs.Region,
          c.Name AS [Customer Name],
          co.Name AS [Channel Name]
        FROM 
          [dbo].[RedactionRequestStatistics] AS rrs
          LEFT JOIN VideoStatistics vs ON RTRIM(vs.Id) = RTRIM(rrs.ContentId)
          LEFT JOIN ClientOverview co ON RTRIM(vs.ClientId) = RTRIM(co.Id)
          LEFT JOIN Customer c ON RTRIM(co.CustomerId) = RTRIM(c.Id)
        WHERE
          rrs.CompletedDate >= @Start
          AND rrs.CompletedDate < @End
        ORDER BY rrs.CompletedDate
      `, { Start: startDate, End: endDate }).catch(() => []),
    ]);

    // Log the results for debugging
    console.log('Advanced Report Query Results:', {
      videos: videosData.length,
      transcriptions: transcriptionsData.length,
      showreels: showreelsData.length,
      redactionRequests: redactionRequestsData.length,
    });

    // Check if any query hit the limit
    const warnings = [];
    if (videosData.length >= 100000) {
      warnings.push('Videos limited to 100,000 records. Use a smaller date range for complete data.');
    }

    // Return the data to be processed on client side
    return NextResponse.json({
      success: true,
      data: {
        videos: videosData,
        transcriptions: transcriptionsData,
        showreels: showreelsData,
        redactionRequests: redactionRequestsData,
      },
      metadata: {
        startDate,
        endDate,
        exportDate: format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
        totalRecords: {
          videos: videosData.length,
          transcriptions: transcriptionsData.length,
          showreels: showreelsData.length,
          redactionRequests: redactionRequestsData.length,
        },
        warnings: warnings.length > 0 ? warnings : undefined,
      },
    });
  } catch (error) {
    console.error('Advanced report error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to generate advanced report',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
