import { queryStream } from './db';
import { PassThrough } from 'stream';
import archiver from 'archiver';
import { getUploadStream } from './gridfs';
import { JobPhase } from './mongoJobTypes';

/**
 * GridFS Report Generator — TRUE STREAMING
 *
 * Architecture (per sequence diagram):
 *   DB (request.stream=true) → row-by-row → Excel stream → ZIP → GridFS
 *
 * Each sheet is processed one at a time:
 *   1. Open a streaming Excel writer pointing at a PassThrough
 *   2. The PassThrough is appended to the archiver (ZIP) as an entry
 *   3. Execute a single unbounded SELECT with request.stream=true
 *   4. For each row: format + commit to the Excel stream
 *   5. Commit the worksheet & finalize the workbook writer (closes the PassThrough)
 *   6. Move to next sheet
 *
 * The archiver pipes into the GridFS upload stream, so data flows
 * from DB → Excel → ZIP → MongoDB with minimal memory buffering.
 *
 * Sheets are split at 500K rows to stay within Excel's 1,048,576 limit.
 */

/** Excel hard limit is 1,048,576 rows; we split well below that */
const MAX_ROWS_PER_SHEET = 500_000;

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

// ─── Streaming SQL queries (single unbounded SELECT — no OFFSET/FETCH) ──

const STREAMING_QUERIES: Record<string, (startDate: string, endDate: string) => { text: string; params: Record<string, any> }> = {
  videos: (startDate, endDate) => ({
    text: `
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
      FROM [dbo].[SPLUNK_VideoStatistics] AS [vs] WITH (NOLOCK)
      WHERE [vs].[Created] >= @Start
        AND [vs].[Created] <= @End
      ORDER BY [vs].[Created], [vs].[VideoId]
    `,
    params: { Start: startDate, End: endDate },
  }),

  transcriptions: (startDate, endDate) => ({
    text: `
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
      FROM [dbo].[SPLUNK_TranscriptionRequestStatistics] AS [trs] WITH (NOLOCK)
      WHERE [trs].[RequestedDate] >= @Start
        AND [trs].[RequestedDate] <= @End
      ORDER BY [trs].[RequestedDate], [trs].[Id]
    `,
    params: { Start: startDate, End: endDate },
  }),

  showreels: (startDate, endDate) => ({
    text: `
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
      FROM [dbo].[ProjectStatistics] AS [ps] WITH (NOLOCK)
        JOIN [dbo].[ClientOverview] AS [co] WITH (NOLOCK) ON [co].[Id] = [ps].[ClientId]
        JOIN [dbo].[SPLUNK_ProjectStatistics] AS [sps] WITH (NOLOCK) ON [sps].[id] = [ps].[id]
        JOIN [dbo].[SPLUNK_LOOKUP_ProjectStatus] AS [slps] WITH (NOLOCK) ON [slps].[ProjectStatus] = [ps].[ProjectStatus]
      WHERE [sps].[Modified] >= @Start
        AND [sps].[Modified] <= @End
      ORDER BY [sps].[Modified], [sps].[Id]
    `,
    params: { Start: startDate, End: endDate },
  }),

  redactions: (startDate, endDate) => ({
    text: `
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
        [vs].[ParentName] AS [Customer Name],
        [vs].[ClientName] AS [Channel Name]
      FROM [dbo].[RedactionRequestStatistics] AS rrs WITH (NOLOCK)
        JOIN [dbo].[SPLUNK_VideoStatistics] AS [vs] WITH (NOLOCK) ON [vs].[VideoId] = rrs.ContentId
      WHERE rrs.CompletedDate >= @Start
        AND rrs.CompletedDate <= @End
      ORDER BY rrs.CompletedDate, rrs.Id
    `,
    params: { Start: startDate, End: endDate },
  }),
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

// ─── Stream a single sheet: DB row stream → Excel → archive entry ───

/**
 * Executes a single unbounded SELECT with request.stream=true and writes
 * each row immediately to an ExcelJS streaming workbook writer backed by
 * a PassThrough stream appended to the ZIP archive.
 *
 * Bytes flow: DB → format row → worksheet.addRow().commit()
 *   → PassThrough → archiver → GridFS
 *
 * When a sheet exceeds MAX_ROWS_PER_SHEET (500K), the current workbook
 * is finalized and a new one is started as a separate archive entry.
 *
 * Returns the total number of rows written.
 */
async function streamSheetToExcel(
  ExcelJS: any,
  archive: archiver.Archiver,
  sheetType: string,
  sheetName: string,
  startDate: string,
  endDate: string,
  dateRange: string,
  formatter: (row: any) => Record<string, any>,
  onChunkWritten?: (rowsSoFar: number) => void,
): Promise<number> {
  const queryConfig = STREAMING_QUERIES[sheetType as keyof typeof STREAMING_QUERIES](startDate, endDate);

  let totalRows = 0;
  let sheetRows = 0;
  let splitIndex = 0;
  let headerKeys: string[] | null = null;

  // ── Helper: open a new PassThrough + WorkbookWriter for a split ──
  function openNewSplit() {
    splitIndex++;
    const suffix = splitIndex > 1 ? `_Part${splitIndex}` : '';
    const excelFileName = `${sheetName.replace(/\s+/g, '_')}${suffix}_${dateRange}.xlsx`;

    const passThrough = new PassThrough();
    archive.append(passThrough, { name: excelFileName });

    const workbookWriter = new ExcelJS.stream.xlsx.WorkbookWriter({
      stream: passThrough,
      useSharedStrings: false,
      useStyles: false,
    });
    const worksheet = workbookWriter.addWorksheet(
      splitIndex > 1 ? `${sheetName} (Part ${splitIndex})` : sheetName,
    );

    if (headerKeys) {
      worksheet.columns = headerKeys.map((key: string) => ({
        header: key,
        key,
        width: Math.min(Math.max(key.length + 2, 12), 60),
      }));
    }

    return { workbookWriter, worksheet, excelFileName };
  }

  async function closeSplit(ws: any, wb: any) {
    ws.commit();
    await wb.commit();
  }

  console.log(`[${sheetType}] Streaming: DB (request.stream=true) → Excel → ZIP...`);

  let current = openNewSplit();
  sheetRows = 0;

  for await (const row of queryStream(queryConfig.text, queryConfig.params, { timeout: 600000 })) {
    const formatted = formatter(row);

    // Set column headers on the very first row
    if (!headerKeys) {
      headerKeys = Object.keys(formatted);
      current.worksheet.columns = headerKeys.map((key: string) => ({
        header: key,
        key,
        width: Math.min(Math.max(key.length + 2, 12), 60),
      }));
    }

    // Multi-sheet split: close current, open next
    if (sheetRows >= MAX_ROWS_PER_SHEET) {
      console.log(`[${sheetType}] Sheet split at ${sheetRows} rows → starting Part ${splitIndex + 1}`);
      await closeSplit(current.worksheet, current.workbookWriter);
      current = openNewSplit();
      sheetRows = 0;
    }

    const rowData: Record<string, unknown> = {};
    for (const key of headerKeys) {
      rowData[key] = formatted[key] ?? null;
    }
    current.worksheet.addRow(rowData).commit();

    sheetRows++;
    totalRows++;

    // Progress callback every 1000 rows
    if (totalRows % 1000 === 0) {
      onChunkWritten?.(totalRows);
    }

    // Log every 50K rows
    if (totalRows % 50000 === 0) {
      console.log(`[${sheetType}] ${totalRows.toLocaleString()} rows streamed...`);
    }
  }

  // Handle empty sheet
  if (totalRows === 0) {
    current.worksheet.addRow({ A: 'No data available for the selected date range' }).commit();
  }

  await closeSplit(current.worksheet, current.workbookWriter);

  console.log(`[${sheetType}] ✓ Streamed ${totalRows.toLocaleString()} rows across ${splitIndex} file(s)`);
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
  const archive = archiver('zip', { zlib: { level: 1 } });
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

    await onProgress?.(
      5 + Math.round((sheetsCompleted / selectedSheets.length) * 80),
      'streaming_data',
      {
        currentSheet: sheetName,
        rowsProcessed: totalRecords,
        message: `Processing ${sheetName}...`,
      },
    );

    // streamSheetToExcel now handles its own PassThrough(s) + archive.append
    // internally, including multi-sheet splitting at 500K rows.
    const sheetRows = await streamSheetToExcel(
      ExcelJS,
      archive,
      sheetType,
      sheetName,
      startDate,
      endDate,
      dateRange,
      formatter,
      (rowsSoFar) => {
        // Granular progress while streaming rows
        const sheetBase = 5 + Math.round((sheetsCompleted / selectedSheets.length) * 80);
        const sheetSlice = Math.round((1 / selectedSheets.length) * 80);
        // Logarithmic progress: grows fast at first, slows down, never caps
        // log(1 + rows/5000) scaled so 10k→40%, 50k→55%, 200k→75%, 500k→85%, 1M→90%
        const logProgress = Math.min(Math.log10(1 + rowsSoFar / 5000) / Math.log10(200), 0.95);
        const progress = sheetBase + Math.round(logProgress * sheetSlice);
        onProgress?.(progress, 'streaming_data', {
          currentSheet: sheetName,
          rowsProcessed: totalRecords + rowsSoFar,
          message: `${sheetName}: ${rowsSoFar.toLocaleString()} rows streamed...`,
        });
      },
    );

    totalRecords += sheetRows;
    sheetsCompleted++;

    console.log(`[${sheetType}] ✓ ${sheetRows} rows → archive`);
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
