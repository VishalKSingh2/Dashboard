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

    // Execute all 4 queries in parallel
    const [videosData, transcriptionsData, showreelsData, redactionRequestsData] = await Promise.all([
      // Query 1: Videos
      query(`
        SELECT 
          DATEADD(MONTH, DATEDIFF(MONTH, 0, [vs].[Created]), 0) AS [Month],
          [vs].[ClientId],
          [vs].[ParentName],
          [vs].[ClientName],
          [vs].[Title],
          [vs].[VideoId],
          [vs].[Region],
          [vs].[userId],
          [vs].[Created],
          [vs].[CreatedUnix],
          [vs].[LanguageIsoCode],
          [vs].[Status],
          [vs].[TranscriptionStatus],
          [vs].[ViewCount],
          CAST([vs].[LengthInMilliseconds] AS MONEY) / 60000 AS [LengthInMinutes],
          [vs].[Modified],
          [vs].[ModifiedUnix],
          [vs].[MediaSource],
          [vs].[UploadSource],
          [vs].[LastUpdated]
        FROM 
          [dbo].[SPLUNK_VideoStatistics] AS [vs] 
        WHERE
          [vs].[Created] >= @Start
          AND [vs].[Created] < @End
        ORDER BY [vs].[Created]
      `, { Start: startDate, End: endDate }),

      // Query 2: Transcriptions
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
      `, { Start: startDate, End: endDate }),

      // Query 3: Showreels
      query(`
        SELECT 
          DATEADD(MONTH, DATEDIFF(MONTH, 0, [sps].[Modified]), 0) AS [Month],
          [sps].[Id],
          [sps].[ParentName],
          [sps].[UserId],
          [sps].[Name],
          [sps].[Title],
          [sps].[Region],
          [slps].[ProjectStatusText],
          [sps].[PublishStatus],
          [sps].[Modified],
          [sps].[ModifiedUnix],
          CAST([sps].[ProjectLengthInMilliseconds] AS MONEY) / 60000 AS [ProjectLengthInMinutes],
          [sps].[LastUpdated]
        FROM 
          [dbo].[ProjectStatistics] AS [ps]
          JOIN [dbo].[ClientOverview] AS [co] ON [co].[Id] = [ps].[ClientId]
          JOIN [dbo].[SPLUNK_ProjectStatistics] AS [sps] ON [sps].[id] = [ps].[id]
          JOIN [dbo].[SPLUNK_LOOKUP_ProjectStatus] AS [slps] ON [slps].[ProjectStatus] = [ps].[ProjectStatus]
        WHERE
          [sps].[Modified] >= @Start
          AND [sps].[Modified] < @End
        ORDER BY [sps].[Modified]
      `, { Start: startDate, End: endDate }),

      // Query 4: Redaction Requests
      query(`
        SELECT 
          DATEADD(MONTH, DATEDIFF(MONTH, 0, [rrs].[CompletedDate]), 0) AS [Month],
          [rrs].[Id],
          [rrs].[LastUpdated],
          [rrs].[CreatedDate],
          [rrs].[ContentId],
          [rrs].[ContentType],
          [rrs].[RequestedDate],
          [rrs].[CompletedDate],
          [rrs].[Status],
          [rrs].[Region],
          [vs].[ParentName] AS [Customer Name],
          [vs].[ClientName] AS [Channel Name]
        FROM 
          [dbo].[RedactionRequestStatistics] AS [rrs]
          JOIN [dbo].[SPLUNK_VideoStatistics] AS [vs] ON [vs].[VideoId] = [rrs].[ContentId]
        WHERE
          [rrs].[CompletedDate] >= @Start
          AND [rrs].[CompletedDate] < @End
        ORDER BY [rrs].[CompletedDate]
      `, { Start: startDate, End: endDate }),
    ]);

    // Log the results for debugging
    console.log('Advanced Report Query Results:', {
      videos: videosData.length,
      transcriptions: transcriptionsData.length,
      showreels: showreelsData.length,
      redactionRequests: redactionRequestsData.length,
    });

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
