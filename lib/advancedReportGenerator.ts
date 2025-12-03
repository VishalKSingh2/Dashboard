import { query } from './db';
import path from 'path';
import fs from 'fs';

const CHUNK_SIZE = 10000; // Process 10k records at a time

interface ExcelGenerationResult {
  fileName: string;
  filePath: string;
  recordCount: number;
}

/**
 * Generate Excel file on server with chunked database queries
 */
export async function generateAdvancedReportExcel(
  startDate: string,
  endDate: string
): Promise<ExcelGenerationResult> {
  // Dynamic import XLSX for server-side use
  const XLSX = await import('xlsx');
  const workbook = XLSX.utils.book_new();

  let totalRecords = 0;

  console.log('Starting advanced report generation:', { startDate, endDate });

  // Helper function to format dates
  const formatDate = (date: any) => {
    if (!date) return '';
    try {
      const d = new Date(date);
      return d.toISOString().split('T')[0];
    } catch {
      return date;
    }
  };

  const formatDateTime = (date: any) => {
    if (!date) return '';
    try {
      const d = new Date(date);
      return d.toISOString().replace('T', ' ').split('.')[0];
    } catch {
      return date;
    }
  };

  // ============ SHEET 1: Videos (Chunked) ============
  console.log('Processing Videos...');
  const videosData: any[] = [];
  let videosOffset = 0;
  let hasMoreVideos = true;

  while (hasMoreVideos) {
    const chunk = await query(`
      SELECT TOP ${CHUNK_SIZE}
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
        AND vs.Id NOT IN (
          SELECT TOP ${videosOffset} Id 
          FROM [dbo].[VideoStatistics] 
          WHERE CreatedDate >= @Start AND CreatedDate < DATEADD(day, 1, @End)
          ORDER BY CreatedDate DESC
        )
      ORDER BY vs.CreatedDate DESC
    `, { Start: startDate, End: endDate });

    if (chunk.length === 0) {
      hasMoreVideos = false;
    } else {
      videosData.push(...chunk);
      videosOffset += chunk.length;
      console.log(`Fetched ${chunk.length} videos (total: ${videosData.length})`);
      
      if (chunk.length < CHUNK_SIZE) {
        hasMoreVideos = false;
      }
    }
  }

  if (videosData.length > 0) {
    const videosFormatted = videosData.map(row => ({
      'Month': formatDate(row.Month),
      'ClientId': row.ClientId,
      'ParentName': row.ParentName,
      'ClientName': row.ClientName,
      'Title': row.Title,
      'VideoId': row.VideoId,
      'Region': row.Region,
      'UserId': row.UserId,
      'Created': formatDateTime(row.Created),
      'CreatedUnix': row.CreatedUnix,
      'LanguageIsoCode': row.LanguageIsoCode,
      'Status': row.Status,
      'TranscriptionStatus': row.TranscriptionStatus,
      'ViewCount': row.ViewCount,
      'LengthInMinutes': row.LengthInMinutes,
      'Modified': formatDateTime(row.Modified),
      'ModifiedUnix': row.ModifiedUnix,
      'MediaSource': row.MediaSource,
      'UploadSource': row.UploadSource,
      'LastUpdated': formatDateTime(row.LastUpdated),
    }));
    const ws1 = XLSX.utils.json_to_sheet(videosFormatted);
    XLSX.utils.book_append_sheet(workbook, ws1, 'Videos');
    totalRecords += videosData.length;
  } else {
    const ws1 = XLSX.utils.aoa_to_sheet([['No data available for the selected date range']]);
    XLSX.utils.book_append_sheet(workbook, ws1, 'Videos');
  }

  // ============ SHEET 2: Transcriptions (Chunked) ============
  console.log('Processing Transcriptions...');
  const transcriptionsData: any[] = [];
  let transcriptionsOffset = 0;
  let hasMoreTranscriptions = true;

  while (hasMoreTranscriptions) {
    const chunk = await query(`
      SELECT TOP ${CHUNK_SIZE}
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
        AND [trs].[Id] NOT IN (
          SELECT TOP ${transcriptionsOffset} Id 
          FROM [dbo].[SPLUNK_TranscriptionRequestStatistics]
          WHERE RequestedDate >= @Start AND RequestedDate < @End
          ORDER BY RequestedDate
        )
      ORDER BY [trs].[RequestedDate]
    `, { Start: startDate, End: endDate }).catch(() => []);

    if (chunk.length === 0) {
      hasMoreTranscriptions = false;
    } else {
      transcriptionsData.push(...chunk);
      transcriptionsOffset += chunk.length;
      console.log(`Fetched ${chunk.length} transcriptions (total: ${transcriptionsData.length})`);
      
      if (chunk.length < CHUNK_SIZE) {
        hasMoreTranscriptions = false;
      }
    }
  }

  if (transcriptionsData.length > 0) {
    const transcriptionsFormatted = transcriptionsData.map(row => ({
      'Month': formatDate(row.Month),
      'Id': row.Id,
      'VideoId': row.VideoId,
      'ThirdPartyId': row.ThirdPartyId,
      'ParentName': row.ParentName,
      'ClientName': row.ClientName,
      'ServiceName': row.ServiceName,
      'CreatedDate': formatDateTime(row.CreatedDate),
      'CreatedDateUnix': row.CreatedDateUnix,
      'RequestedDate': formatDateTime(row.RequestedDate),
      'RequestedDateUnix': row.RequestedDateUnix,
      'CompletedDate': formatDateTime(row.CompletedDate),
      'CompletedDateUnix': row.CompletedDateUnix,
      'Type': row.Type,
      'TranscriptionStatus': row.TranscriptionStatus,
      'Status': row.Status,
      'Title': row.Title,
      'ToIsoCode': row.ToIsoCode,
      'ToThirdPartyIsoCode': row.ToThirdPartyIsoCode,
      'FromIsoCode': row.FromIsoCode,
      'Modified': formatDateTime(row.Modified),
      'ModifiedUnix': row.ModifiedUnix,
      'LengthInMinutes': row.LengthInMinutes,
      'MediaSource': row.MediaSource,
      'UploadSource': row.UploadSource,
      'Region': row.Region,
      'LastUpdated': formatDateTime(row.LastUpdated),
    }));
    const ws2 = XLSX.utils.json_to_sheet(transcriptionsFormatted);
    XLSX.utils.book_append_sheet(workbook, ws2, 'Transcriptions');
    totalRecords += transcriptionsData.length;
  } else {
    const ws2 = XLSX.utils.aoa_to_sheet([['No data available for the selected date range']]);
    XLSX.utils.book_append_sheet(workbook, ws2, 'Transcriptions');
  }

  // ============ SHEET 3: Showreels (Chunked) ============
  console.log('Processing Showreels...');
  const showreelsData: any[] = [];
  let showreelsOffset = 0;
  let hasMoreShowreels = true;

  while (hasMoreShowreels) {
    const chunk = await query(`
      SELECT TOP ${CHUNK_SIZE}
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
        AND ps.Id NOT IN (
          SELECT TOP ${showreelsOffset} Id 
          FROM [dbo].[ProjectStatistics]
          WHERE Modified >= @Start AND Modified < DATEADD(day, 1, @End)
          ORDER BY Modified
        )
      ORDER BY ps.Modified
    `, { Start: startDate, End: endDate }).catch(() => []);

    if (chunk.length === 0) {
      hasMoreShowreels = false;
    } else {
      showreelsData.push(...chunk);
      showreelsOffset += chunk.length;
      console.log(`Fetched ${chunk.length} showreels (total: ${showreelsData.length})`);
      
      if (chunk.length < CHUNK_SIZE) {
        hasMoreShowreels = false;
      }
    }
  }

  if (showreelsData.length > 0) {
    const showreelsFormatted = showreelsData.map(row => ({
      'Month': formatDate(row.Month),
      'Id': row.Id,
      'ParentName': row.ParentName,
      'UserId': row.UserId,
      'Name': row.Name,
      'Title': row.Title,
      'Region': row.Region,
      'ProjectStatusText': row.ProjectStatusText,
      'PublishStatus': row.PublishStatus,
      'Modified': formatDateTime(row.Modified),
      'ModifiedUnix': row.ModifiedUnix,
      'ProjectLengthInMinutes': row.ProjectLengthInMinutes,
      'LastUpdated': formatDateTime(row.LastUpdated),
    }));
    const ws3 = XLSX.utils.json_to_sheet(showreelsFormatted);
    XLSX.utils.book_append_sheet(workbook, ws3, 'Showreels');
    totalRecords += showreelsData.length;
  } else {
    const ws3 = XLSX.utils.aoa_to_sheet([['No data available for the selected date range']]);
    XLSX.utils.book_append_sheet(workbook, ws3, 'Showreels');
  }

  // ============ SHEET 4: Redaction Requests (Chunked) ============
  console.log('Processing Redaction Requests...');
  const redactionRequestsData: any[] = [];
  let redactionOffset = 0;
  let hasMoreRedaction = true;

  while (hasMoreRedaction) {
    const chunk = await query(`
      SELECT TOP ${CHUNK_SIZE}
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
        AND rrs.Id NOT IN (
          SELECT TOP ${redactionOffset} Id 
          FROM [dbo].[RedactionRequestStatistics]
          WHERE CompletedDate >= @Start AND CompletedDate < @End
          ORDER BY CompletedDate
        )
      ORDER BY rrs.CompletedDate
    `, { Start: startDate, End: endDate }).catch(() => []);

    if (chunk.length === 0) {
      hasMoreRedaction = false;
    } else {
      redactionRequestsData.push(...chunk);
      redactionOffset += chunk.length;
      console.log(`Fetched ${chunk.length} redaction requests (total: ${redactionRequestsData.length})`);
      
      if (chunk.length < CHUNK_SIZE) {
        hasMoreRedaction = false;
      }
    }
  }

  if (redactionRequestsData.length > 0) {
    const redactionRequestsFormatted = redactionRequestsData.map(row => ({
      'Month': formatDate(row.Month),
      'Id': row.Id,
      'LastUpdated': formatDateTime(row.LastUpdated),
      'CreatedDate': formatDateTime(row.CreatedDate),
      'ContentId': row.ContentId,
      'ContentType': row.ContentType,
      'RequestedDate': formatDateTime(row.RequestedDate),
      'CompletedDate': formatDateTime(row.CompletedDate),
      'Status': row.Status,
      'Region': row.Region,
      'Customer Name': row['Customer Name'],
      'Channel Name': row['Channel Name'],
    }));
    const ws4 = XLSX.utils.json_to_sheet(redactionRequestsFormatted);
    XLSX.utils.book_append_sheet(workbook, ws4, 'Redaction Requests');
    totalRecords += redactionRequestsData.length;
  } else {
    const ws4 = XLSX.utils.aoa_to_sheet([['No data available for the selected date range']]);
    XLSX.utils.book_append_sheet(workbook, ws4, 'Redaction Requests');
  }

  // ============ Save to file ============
  const fileName = `Advanced_Report_${startDate.replace(/-/g, '')}_to_${endDate.replace(/-/g, '')}_${Date.now()}.xlsx`;
  const reportsDir = path.join(process.cwd(), 'public', 'reports');
  
  // Ensure reports directory exists
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  const filePath = path.join(reportsDir, fileName);
  
  // Write the file using writeFileXLSX for better Node.js compatibility
  try {
    XLSX.writeFileXLSX(workbook, filePath);
    console.log(`File saved successfully: ${filePath}`);
  } catch (writeError) {
    console.error('XLSX write error:', writeError);
    // Fallback: try writing as buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    fs.writeFileSync(filePath, buffer);
    console.log(`File saved via buffer: ${filePath}`);
  }

  console.log('Report generation complete:', {
    fileName,
    totalRecords,
    videos: videosData.length,
    transcriptions: transcriptionsData.length,
    showreels: showreelsData.length,
    redactionRequests: redactionRequestsData.length,
  });

  return {
    fileName,
    filePath,
    recordCount: totalRecords,
  };
}
