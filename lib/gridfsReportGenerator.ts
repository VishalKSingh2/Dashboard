import { query } from './db';
import { PassThrough } from 'stream';
import archiver from 'archiver';
import { getUploadStream } from './gridfs';
import { JobPhase } from './mongoJobTypes';

/**
 * GridFS Report Generator — TRUE STREAMING
 *
 * Architecture (per sequence diagram):
 *   DB → fetch 10k chunk → write rows to Excel stream → pipe to ZIP → pipe to GridFS
 *
 * Each sheet is processed one at a time:
 *   1. Open a streaming Excel writer pointing at a PassThrough
 *   2. The PassThrough is appended to the archiver (ZIP) as an entry
 *   3. Fetch 10k rows from SQL Server
 *   4. Format + commit rows immediately to the Excel stream
 *   5. Repeat step 3-4 until no more rows
 *   6. Commit the worksheet & finalize the workbook writer (closes the PassThrough)
 *   7. Move to next sheet
 *
 * The archiver pipes into the GridFS upload stream, so data flows
 * from DB → Excel → ZIP → MongoDB with minimal memory buffering.
 */

const DB_CHUNK_SIZE = 10000;

// ─── Types ───────────────────────────────────────────────────────────

export interface GridFSReportResult {
  fileId: string;
  fileName: string;
  fileSize: string;
  recordCount: number;
}

export interface ProgressCallback {
  (progress: number, phase: JobPhase, details?: {
    currentSheet?: string;
    rowsProcessed?: number;
    totalRows?: number;
    message?: string;
  }): Promise<void>;
}

// ─── Query Templates ─────────────────────────────────────────────────

const QUERY_TEMPLATES = {
  videos: (startDate: string, endDate: string, offset: number, limit: number, lastDate?: string, lastId?: string) => ({
    text: `
      SELECT TOP (@Limit)
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
      FROM [dbo].[SPLUNK_VideoStatistics] AS [vs] WITH (NOLOCK)
      WHERE [vs].[Created] >= @Start
        AND [vs].[Created] <= @End
        ${offset > 0 && lastDate && lastId ? `
        AND (
          [vs].[Created] < @LastDate OR 
          ([vs].[Created] = @LastDate AND [vs].[VideoId] < @LastId)
        )` : ''}
      ORDER BY [vs].[Created], [vs].[VideoId]
    `,
    params: {
      Start: startDate,
      End: endDate,
      Limit: limit,
      ...(offset > 0 && lastDate && lastId && { LastDate: lastDate, LastId: lastId })
    }
  }),

  transcriptions: (startDate: string, endDate: string, offset: number, limit: number, lastDate?: string, lastId?: string) => ({
    text: `
      SELECT TOP (@Limit)
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
      FROM [dbo].[SPLUNK_TranscriptionRequestStatistics] AS [trs] WITH (NOLOCK)
      WHERE [trs].[RequestedDate] >= @Start
        AND [trs].[RequestedDate] <= @End
        ${offset > 0 && lastDate && lastId ? `
        AND (
          [trs].[RequestedDate] > @LastDate OR 
          ([trs].[RequestedDate] = @LastDate AND [trs].[Id] > @LastId)
        )` : ''}
      ORDER BY [trs].[RequestedDate] ASC, [trs].[Id] ASC
    `,
    params: {
      Start: startDate,
      End: endDate,
      Limit: limit,
      ...(offset > 0 && lastDate && lastId && { LastDate: lastDate, LastId: lastId })
    }
  }),

  showreels: (startDate: string, endDate: string, offset: number, limit: number, lastDate?: string, lastId?: string) => ({
    text: `
      SELECT TOP (@Limit)
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
      FROM [dbo].[ProjectStatistics] AS [ps] WITH (NOLOCK)
        JOIN [dbo].[ClientOverview] AS [co] WITH (NOLOCK) ON [co].[Id] = [ps].[ClientId]
        JOIN [dbo].[SPLUNK_ProjectStatistics] AS [sps] WITH (NOLOCK) ON [sps].[id] = [ps].[id]
        JOIN [dbo].[SPLUNK_LOOKUP_ProjectStatus] AS [slps] WITH (NOLOCK) ON [slps].[ProjectStatus] = [ps].[ProjectStatus]
      WHERE [sps].[Modified] >= @Start
        AND [sps].[Modified] <= @End
        ${offset > 0 && lastDate && lastId ? `
        AND (
          [sps].[Modified] > @LastDate OR 
          ([sps].[Modified] = @LastDate AND [sps].[Id] > @LastId)
        )` : ''}
      ORDER BY [sps].[Modified], [sps].[Id]
    `,
    params: {
      Start: startDate,
      End: endDate,
      Limit: limit,
      ...(offset > 0 && lastDate && lastId && { LastDate: lastDate, LastId: lastId })
    }
  }),

  redactions: (startDate: string, endDate: string, offset: number, limit: number, lastDate?: string, lastId?: string) => ({
    text: `
      SELECT TOP (@Limit)
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
        [vs].[ParentName] AS [Customer Name],
        [vs].[ClientName] AS [Channel Name]
      FROM [dbo].[RedactionRequestStatistics] AS rrs WITH (NOLOCK)
        JOIN [dbo].[SPLUNK_VideoStatistics] AS [vs] WITH (NOLOCK) ON [vs].[VideoId] = rrs.ContentId
      WHERE rrs.CompletedDate >= @Start
        AND rrs.CompletedDate <= @End
        ${offset > 0 && lastDate && lastId ? `
        AND (
          rrs.CompletedDate > @LastDate OR 
          (rrs.CompletedDate = @LastDate AND rrs.Id > @LastId)
        )` : ''}
      ORDER BY rrs.CompletedDate ASC, rrs.Id ASC
    `,
    params: {
      Start: startDate,
      End: endDate,
      Limit: limit,
      ...(offset > 0 && lastDate && lastId && { LastDate: lastDate, LastId: lastId })
    }
  })
};

// ─── Cursor field mapping (for keyset pagination) ────────────────────

const CURSOR_FIELDS: Record<string, { dateField: string; idField: string }> = {
  videos:         { dateField: 'Created',       idField: 'VideoId' },
  transcriptions: { dateField: 'RequestedDate', idField: 'Id' },
  showreels:      { dateField: 'Modified',      idField: 'Id' },
  redactions:     { dateField: 'CompletedDate', idField: 'Id' },
};

// ─── Date Formatters ─────────────────────────────────────────────────

const formatDate = (date: any) => {
  if (!date) return '';
  try { return new Date(date).toISOString().split('T')[0]; } catch { return date; }
};

const formatDateTime = (date: any) => {
  if (!date) return '';
  try { return new Date(date).toISOString().replace('T', ' ').split('.')[0]; } catch { return date; }
};

// ─── Row Formatters ──────────────────────────────────────────────────

const FORMATTERS: Record<string, (row: any) => Record<string, any>> = {
  videos: (row) => ({
    Month: formatDate(row.Month),
    ClientId: row.ClientId,
    ParentName: row.ParentName,
    ClientName: row.ClientName,
    Title: row.Title,
    VideoId: row.VideoId,
    Region: row.Region,
    UserId: row.UserId,
    Created: formatDateTime(row.Created),
    CreatedUnix: row.CreatedUnix,
    LanguageIsoCode: row.LanguageIsoCode,
    Status: row.Status,
    TranscriptionStatus: row.TranscriptionStatus,
    ViewCount: row.ViewCount,
    LengthInMinutes: row.LengthInMinutes,
    Modified: formatDateTime(row.Modified),
    ModifiedUnix: row.ModifiedUnix,
    MediaSource: row.MediaSource,
    UploadSource: row.UploadSource,
    LastUpdated: formatDateTime(row.LastUpdated),
  }),

  transcriptions: (row) => ({
    Month: formatDate(row.Month),
    Id: row.Id,
    VideoId: row.VideoId,
    ThirdPartyId: row.ThirdPartyId,
    ParentName: row.ParentName,
    ClientName: row.ClientName,
    ServiceName: row.ServiceName,
    CreatedDate: formatDateTime(row.CreatedDate),
    CreatedDateUnix: row.CreatedDateUnix,
    RequestedDate: formatDateTime(row.RequestedDate),
    RequestedDateUnix: row.RequestedDateUnix,
    CompletedDate: formatDateTime(row.CompletedDate),
    CompletedDateUnix: row.CompletedDateUnix,
    Type: row.Type,
    TranscriptionStatus: row.TranscriptionStatus,
    Status: row.Status,
    Title: row.Title,
    ToIsoCode: row.ToIsoCode,
    ToThirdPartyIsoCode: row.ToThirdPartyIsoCode,
    FromIsoCode: row.FromIsoCode,
    Modified: formatDateTime(row.Modified),
    ModifiedUnix: row.ModifiedUnix,
    LengthInMinutes: row.LengthInMinutes,
    MediaSource: row.MediaSource,
    UploadSource: row.UploadSource,
    Region: row.Region,
    LastUpdated: formatDateTime(row.LastUpdated),
  }),

  showreels: (row) => ({
    Month: formatDate(row.Month),
    Id: row.Id,
    ParentName: row.ParentName,
    UserId: row.UserId,
    Name: row.Name,
    Title: row.Title,
    Region: row.Region,
    ProjectStatusText: row.ProjectStatusText,
    PublishStatus: row.PublishStatus,
    Modified: formatDateTime(row.Modified),
    ModifiedUnix: row.ModifiedUnix,
    ProjectLengthInMinutes: row.ProjectLengthInMinutes,
    LastUpdated: formatDateTime(row.LastUpdated),
  }),

  redactions: (row) => ({
    Month: formatDate(row.Month),
    Id: row.Id,
    LastUpdated: formatDateTime(row.LastUpdated),
    CreatedDate: formatDateTime(row.CreatedDate),
    ContentId: row.ContentId,
    ContentType: row.ContentType,
    RequestedDate: formatDateTime(row.RequestedDate),
    CompletedDate: formatDateTime(row.CompletedDate),
    Status: row.Status,
    Region: row.Region,
    'Customer Name': row['Customer Name'],
    'Channel Name': row['Channel Name'],
  }),
};

const SHEET_NAMES: Record<string, string> = {
  videos: 'Videos',
  transcriptions: 'Transcriptions',
  showreels: 'Showreels',
  redactions: 'Redaction Requests',
};

// ─── Stream a single sheet: fetch chunk → write to Excel → repeat ───

/**
 * Fetches data from SQL Server in 10k-row chunks and writes each chunk
 * immediately to the ExcelJS streaming workbook writer.
 *
 * The workbook writer is backed by a PassThrough stream that the caller
 * has already appended to the ZIP archive, so bytes flow:
 *   DB → format row → worksheet.addRow().commit() → PassThrough → archiver → GridFS
 *
 * Returns the total number of rows written.
 */
async function streamSheetToExcel(
  ExcelJS: any,
  excelStream: PassThrough,
  sheetType: string,
  sheetName: string,
  startDate: string,
  endDate: string,
  formatter: (row: any) => Record<string, any>,
  onChunkWritten?: (rowsSoFar: number) => void,
): Promise<number> {
  const workbookWriter = new ExcelJS.stream.xlsx.WorkbookWriter({
    stream: excelStream,
    useSharedStrings: false,
    useStyles: false,
  });

  const worksheet = workbookWriter.addWorksheet(sheetName);

  let headerKeys: string[] | null = null;
  let totalRows = 0;
  let offset = 0;
  let hasMore = true;
  let lastDate: string | undefined;
  let lastId: string | undefined;
  let consecutiveErrors = 0;
  const MAX_RETRIES = 3;
  const cursorFields = CURSOR_FIELDS[sheetType];

  console.log(`[${sheetType}] Streaming: fetch chunk → write to Excel...`);

  while (hasMore) {
    try {
      // ── Fetch one chunk from DB ──
      const queryConfig = QUERY_TEMPLATES[sheetType as keyof typeof QUERY_TEMPLATES](
        startDate, endDate, offset, DB_CHUNK_SIZE, lastDate, lastId,
      );

      const chunkStart = Date.now();
      const chunk = await Promise.race([
        query(queryConfig.text, queryConfig.params, { timeout: 180000 }),
        new Promise<any[]>((_, reject) =>
          setTimeout(() => reject(new Error('Query timeout after 3 minutes')), 180000),
        ),
      ]);
      const chunkMs = Date.now() - chunkStart;

      if (!chunk || chunk.length === 0) {
        hasMore = false;
        break;
      }

      console.log(`[${sheetType}] Chunk ${offset}–${offset + chunk.length} fetched in ${(chunkMs / 1000).toFixed(2)}s → writing rows...`);

      // ── Write rows immediately ──
      for (const row of chunk) {
        const formatted = formatter(row);

        // Set headers on the first row
        if (!headerKeys) {
          headerKeys = Object.keys(formatted);
          worksheet.columns = headerKeys.map((key) => ({
            header: key,
            key,
            width: Math.min(Math.max(key.length + 2, 12), 60),
          }));
        }

        const rowData: Record<string, unknown> = {};
        for (const key of headerKeys) {
          rowData[key] = formatted[key] ?? null;
        }
        worksheet.addRow(rowData).commit();
      }

      // Update cursors
      offset += chunk.length;
      totalRows += chunk.length;
      consecutiveErrors = 0;

      const lastRow = chunk[chunk.length - 1];
      if (cursorFields) {
        lastDate = lastRow[cursorFields.dateField];
        lastId = lastRow[cursorFields.idField];
      }

      onChunkWritten?.(totalRows);

      if (chunk.length < DB_CHUNK_SIZE) {
        hasMore = false;
      }

      // Yield to event loop so the stream can flush
      await new Promise((resolve) => setImmediate(resolve));

    } catch (error) {
      consecutiveErrors++;
      console.error(`[${sheetType}] Error (attempt ${consecutiveErrors}/${MAX_RETRIES}):`, error);

      if (consecutiveErrors >= MAX_RETRIES) {
        console.error(`[${sheetType}] Max retries reached. Written ${totalRows} rows so far.`);
        hasMore = false;
      } else {
        const waitTime = Math.min(1000 * Math.pow(2, consecutiveErrors - 1), 10000);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }
  }

  // Handle empty sheet
  if (totalRows === 0) {
    worksheet.addRow({ A: 'No data available for the selected date range' }).commit();
  }

  // Finalize the workbook → closes the PassThrough stream
  worksheet.commit();
  await workbookWriter.commit();

  console.log(`[${sheetType}] ✓ Streamed ${totalRows} rows`);
  return totalRows;
}

// ─── Main Entry Point ────────────────────────────────────────────────

/**
 * Generate the advanced report with TRUE streaming:
 *
 *   DB → 10k chunk → Excel row writes → ZIP entry stream → GridFS upload stream
 *
 * At no point is the full dataset held in memory. Each 10k chunk is
 * formatted and committed to the Excel streaming writer, which pushes
 * bytes through the ZIP archiver into GridFS.
 *
 * @param startDate  Report start date (ISO string)
 * @param endDate    Report end date (ISO string)
 * @param sheets     Selected sheet types
 * @param onProgress Optional callback for progress updates
 */
export async function generateReportToGridFS(
  startDate: string,
  endDate: string,
  sheets?: string[],
  onProgress?: ProgressCallback,
): Promise<GridFSReportResult> {
  const startTime = Date.now();
  console.log('=== Starting GridFS Report Generation (TRUE STREAMING) ===');
  console.log('Date Range:', { startDate, endDate });

  const selectedSheets = sheets && sheets.length > 0
    ? sheets
    : ['videos', 'transcriptions', 'showreels', 'redactions'];
  console.log('Selected sheets:', selectedSheets.join(', '));

  // Dynamic import ExcelJS
  const ExcelJSModule = await import('exceljs');
  const ExcelJS = (ExcelJSModule as any).default ?? ExcelJSModule;

  // ─── Set up streaming pipeline: archiver → GridFS upload stream ──
  const dateRange = `${startDate.replace(/-/g, '')}_to_${endDate.replace(/-/g, '')}`;
  const timestamp = Date.now();
  const zipFileName = `Advanced_Report_${dateRange}_${timestamp}.zip`;

  const { stream: gridfsWriteStream, fileId } = await getUploadStream({
    filename: zipFileName,
    contentType: 'application/zip',
    metadata: { type: 'report', createdAt: new Date().toISOString() },
  });

  // archiver → GridFS
  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.pipe(gridfsWriteStream as NodeJS.WritableStream);

  // Track total bytes written via GridFS 'finish' event
  const uploadFinished = new Promise<void>((resolve, reject) => {
    (gridfsWriteStream as NodeJS.WritableStream).on('finish', resolve);
    (gridfsWriteStream as NodeJS.WritableStream).on('error', reject);
    archive.on('error', reject);
  });

  await onProgress?.(5, 'streaming_data', {
    message: 'Starting streaming pipeline...',
  });

  // ─── Process each sheet sequentially ──────────────────────────────
  let totalRecords = 0;
  let sheetsCompleted = 0;

  for (const sheetType of selectedSheets) {
    const sheetName = SHEET_NAMES[sheetType] || sheetType;
    const formatter = FORMATTERS[sheetType];

    if (!formatter) {
      console.warn(`No formatter for sheet type: ${sheetType}, skipping.`);
      continue;
    }

    const excelFileName = `${sheetName.replace(/\s+/g, '_')}_${dateRange}.xlsx`;

    await onProgress?.(
      5 + Math.round((sheetsCompleted / selectedSheets.length) * 80),
      'streaming_data',
      {
        currentSheet: sheetName,
        rowsProcessed: totalRecords,
        message: `Processing ${sheetName}...`,
      },
    );

    // Create a PassThrough that the ExcelJS writer will write into.
    // We append this PassThrough to the archiver so bytes flow through
    // immediately as the writer produces them.
    const excelPassThrough = new PassThrough();
    archive.append(excelPassThrough, { name: excelFileName });

    const sheetRows = await streamSheetToExcel(
      ExcelJS,
      excelPassThrough,
      sheetType,
      sheetName,
      startDate,
      endDate,
      formatter,
      (rowsSoFar) => {
        // Granular progress while streaming rows
        const sheetBase = 5 + Math.round((sheetsCompleted / selectedSheets.length) * 80);
        const sheetSlice = Math.round((1 / selectedSheets.length) * 80);
        // We don't know total rows upfront, so approximate within the slice
        const estimated = Math.min(rowsSoFar / 100000, 0.95); // cap at 95% of slice
        const progress = sheetBase + Math.round(estimated * sheetSlice);
        onProgress?.(progress, 'streaming_data', {
          currentSheet: sheetName,
          rowsProcessed: totalRecords + rowsSoFar,
          message: `${sheetName}: ${rowsSoFar.toLocaleString()} rows streamed...`,
        });
      },
    );

    totalRecords += sheetRows;
    sheetsCompleted++;

    console.log(`[${sheetType}] ✓ ${sheetRows} rows → archive entry "${excelFileName}"`);
  }

  // ─── Finalize archive → flush to GridFS ────────────────────────────
  await onProgress?.(90, 'uploading', {
    message: 'Finalizing ZIP and flushing to storage...',
    rowsProcessed: totalRecords,
    totalRows: totalRecords,
  });

  await archive.finalize();
  await uploadFinished;

  // Read file size from GridFS metadata
  const { getFileInfo } = await import('./gridfs');
  const info = await getFileInfo(fileId.toString());
  const sizeBytes = info?.size ?? 0;
  const fileSize = sizeBytes > 1024 * 1024
    ? `${(sizeBytes / 1024 / 1024).toFixed(2)} MB`
    : `${(sizeBytes / 1024).toFixed(2)} KB`;

  await onProgress?.(95, 'finalizing', {
    message: 'Report complete!',
    totalRows: totalRecords,
  });

  const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log('\n=== GridFS Report Generation Complete (TRUE STREAMING) ===');
  console.log(`Total Time: ${totalDuration}s`);
  console.log('Summary:', {
    zipFileName,
    fileId: fileId.toString(),
    fileSize,
    totalRecords,
    sheetsCreated: sheetsCompleted,
  });

  return {
    fileId: fileId.toString(),
    fileName: zipFileName,
    fileSize,
    recordCount: totalRecords,
  };
}
