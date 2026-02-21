import { query } from './db';
import { PassThrough, Readable } from 'stream';
import archiver from 'archiver';
import { uploadFile } from './gridfs';
import { JobPhase } from './mongoJobTypes';

/**
 * GridFS Report Generator
 * 
 * Generates Excel reports and streams the resulting ZIP directly
 * into MongoDB GridFS — no local filesystem writes.
 * 
 * This is the "Worker" component from the sequence diagram:
 *   DB (SQL Server) → Worker (this file) → Blob Storage (GridFS)
 * 
 * The original advancedReportGenerator.ts is kept intact for the
 * direct-download flow (/api/generate-report).
 * 
 * Key difference from advancedReportGenerator.ts:
 *   - Excel files are written to in-memory buffers (not disk)
 *   - ZIP archive is streamed into GridFS via uploadFile()
 *   - Progress callback notifies the caller (process-jobs) at each step
 */

const BATCH_SIZE = 50000;
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

// ─── Query Templates (same as advancedReportGenerator.ts) ────────────

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

// ─── Date Formatters ─────────────────────────────────────────────────

const formatDate = (date: any) => {
  if (!date) return '';
  try {
    return new Date(date).toISOString().split('T')[0];
  } catch {
    return date;
  }
};

const formatDateTime = (date: any) => {
  if (!date) return '';
  try {
    return new Date(date).toISOString().replace('T', ' ').split('.')[0];
  } catch {
    return date;
  }
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

// ─── Data Fetching (cursor-based, same logic) ───────────────────────

async function fetchAllData(
  queryType: keyof typeof QUERY_TEMPLATES,
  startDate: string,
  endDate: string,
  onChunkFetched?: (rowsSoFar: number) => void,
): Promise<any[]> {
  const allData: any[] = [];
  let offset = 0;
  let hasMore = true;
  let lastDate: string | undefined;
  let lastId: string | undefined;
  let consecutiveErrors = 0;
  const MAX_RETRIES = 3;

  console.log(`[${queryType}] Starting data fetch...`);

  while (hasMore) {
    try {
      const queryConfig = QUERY_TEMPLATES[queryType](
        startDate, endDate, offset, DB_CHUNK_SIZE, lastDate, lastId,
      );

      const chunkStartTime = Date.now();
      const chunk = await Promise.race([
        query(queryConfig.text, queryConfig.params, { timeout: 180000 }),
        new Promise<any[]>((_, reject) =>
          setTimeout(() => reject(new Error('Query timeout after 3 minutes')), 180000),
        ),
      ]);
      const chunkDuration = ((Date.now() - chunkStartTime) / 1000).toFixed(2);
      console.log(`[${queryType}] Chunk fetched in ${chunkDuration}s`);

      if (!chunk || chunk.length === 0) {
        hasMore = false;
      } else {
        allData.push(...chunk);
        offset += chunk.length;
        consecutiveErrors = 0;

        // Cursor tracking
        const lastRow = chunk[chunk.length - 1];
        if (queryType === 'videos') {
          lastDate = lastRow.Created;
          lastId = lastRow.VideoId;
        } else if (queryType === 'transcriptions') {
          lastDate = lastRow.RequestedDate;
          lastId = lastRow.Id;
        } else if (queryType === 'showreels') {
          lastDate = lastRow.Modified;
          lastId = lastRow.Id;
        } else if (queryType === 'redactions') {
          lastDate = lastRow.CompletedDate;
          lastId = lastRow.Id;
        }

        console.log(`[${queryType}] Total so far: ${allData.length}`);
        onChunkFetched?.(allData.length);

        if (chunk.length < DB_CHUNK_SIZE) {
          hasMore = false;
        }

        await new Promise((resolve) => setImmediate(resolve));
      }
    } catch (error) {
      consecutiveErrors++;
      console.error(`[${queryType}] Error (attempt ${consecutiveErrors}/${MAX_RETRIES}):`, error);

      if (consecutiveErrors >= MAX_RETRIES) {
        console.error(`[${queryType}] Max retries reached. Returning ${allData.length} records.`);
        hasMore = false;
      } else {
        const waitTime = Math.min(1000 * Math.pow(2, consecutiveErrors - 1), 10000);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }
  }

  console.log(`[${queryType}] Completed: ${allData.length} total records`);
  return allData;
}

// ─── Write Excel to Buffer (in-memory, no disk) ─────────────────────

async function writeExcelToBuffer(
  ExcelJS: any,
  sheetName: string,
  data: any[],
  formatter: (row: any) => Record<string, any>,
): Promise<Buffer> {
  console.log(`[${sheetName}] Writing ${data.length} rows to in-memory buffer...`);

  if (data.length === 0) {
    const emptyWorkbook = new ExcelJS.Workbook();
    const ws = emptyWorkbook.addWorksheet(sheetName);
    ws.addRow(['No data available for the selected date range']);
    const buffer = await emptyWorkbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  // Use streaming workbook writer → write to PassThrough → collect buffer
  const passThrough = new PassThrough();
  const chunks: Buffer[] = [];

  passThrough.on('data', (chunk: Buffer) => chunks.push(chunk));
  const bufferPromise = new Promise<Buffer>((resolve, reject) => {
    passThrough.on('end', () => resolve(Buffer.concat(chunks)));
    passThrough.on('error', reject);
  });

  const streamingWorkbook = new ExcelJS.stream.xlsx.WorkbookWriter({
    stream: passThrough,
    useSharedStrings: false,
    useStyles: false,
  });
  const worksheet = streamingWorkbook.addWorksheet(sheetName);

  let headerKeys: string[] | null = null;
  let processedRows = 0;

  for (let start = 0; start < data.length; start += BATCH_SIZE) {
    const end = Math.min(start + BATCH_SIZE, data.length);

    for (let i = start; i < end; i++) {
      const formatted = formatter(data[i]);

      if (!headerKeys) {
        headerKeys = Object.keys(formatted);
        worksheet.columns = headerKeys.map((key) => ({
          header: key,
          key,
          width: Math.min(Math.max(key.length + 2, 12), 60),
        }));
      }

      const rowData: Record<string, unknown> = {};
      headerKeys.forEach((key) => {
        rowData[key] = formatted[key] ?? null;
      });
      worksheet.addRow(rowData).commit();
    }

    processedRows += end - start;
    await new Promise((resolve) => setImmediate(resolve));
  }

  worksheet.commit();
  await streamingWorkbook.commit();

  const buffer = await bufferPromise;
  console.log(`[${sheetName}] ✓ Buffer ready (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);
  return buffer;
}

// ─── Create ZIP and stream to GridFS ─────────────────────────────────

async function createZipAndUploadToGridFS(
  excelBuffers: { name: string; buffer: Buffer }[],
  zipFileName: string,
): Promise<{ fileId: string; fileSize: string }> {
  console.log(`Creating ZIP and uploading to GridFS: ${zipFileName}`);

  // Create ZIP in memory → then upload the complete buffer to GridFS
  const archive = archiver('zip', { zlib: { level: 6 } });
  const chunks: Buffer[] = [];
  const passThrough = new PassThrough();

  passThrough.on('data', (chunk: Buffer) => chunks.push(chunk));

  const zipBufferPromise = new Promise<Buffer>((resolve, reject) => {
    passThrough.on('end', () => resolve(Buffer.concat(chunks)));
    passThrough.on('error', reject);
    archive.on('error', reject);
  });

  archive.pipe(passThrough);

  for (const { name, buffer } of excelBuffers) {
    archive.append(buffer, { name });
  }

  await archive.finalize();
  const zipBuffer = await zipBufferPromise;

  console.log(`ZIP buffer ready: ${(zipBuffer.length / 1024 / 1024).toFixed(2)} MB`);

  // Upload to GridFS
  const fileId = await uploadFile(
    Readable.from(zipBuffer),
    {
      filename: zipFileName,
      contentType: 'application/zip',
      metadata: { type: 'report', createdAt: new Date().toISOString() },
    },
  );

  const fileSizeMB = (zipBuffer.length / 1024 / 1024).toFixed(2);
  const fileSize = zipBuffer.length > 1024 * 1024
    ? `${fileSizeMB} MB`
    : `${(zipBuffer.length / 1024).toFixed(2)} KB`;

  console.log(`✓ Uploaded to GridFS: ${fileId.toString()} (${fileSize})`);

  return { fileId: fileId.toString(), fileSize };
}

// ─── Main Entry Point ────────────────────────────────────────────────

/**
 * Generate the advanced report and store it in GridFS.
 * 
 * Sequence diagram flow:
 *   1. Fetch data from SQL Server (DB cursor, 10k chunks)
 *   2. Write Excel files to in-memory buffers
 *   3. Create ZIP archive
 *   4. Upload ZIP to GridFS (Blob Storage)
 *   5. Return fileId + downloadUrl
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
  console.log('=== Starting GridFS Report Generation ===');
  console.log('Date Range:', { startDate, endDate });

  const selectedSheets = sheets && sheets.length > 0
    ? sheets
    : ['videos', 'transcriptions', 'showreels', 'redactions'];
  console.log('Selected sheets:', selectedSheets.join(', '));

  // Dynamic import ExcelJS
  const ExcelJSModule = await import('exceljs');
  const ExcelJS = (ExcelJSModule as any).default ?? ExcelJSModule;

  // ─── Phase 1: Fetch data from SQL Server ───────────────────────
  await onProgress?.(5, 'fetching_data', {
    message: 'Fetching data from database...',
  });

  console.log('\n--- Phase 1: Fetching data ---');
  const fetchStartTime = Date.now();

  const dataFetches: Record<string, Promise<any[]>> = {};
  if (selectedSheets.includes('videos')) {
    dataFetches.videos = fetchAllData('videos', startDate, endDate);
  }
  if (selectedSheets.includes('transcriptions')) {
    dataFetches.transcriptions = fetchAllData('transcriptions', startDate, endDate);
  }
  if (selectedSheets.includes('showreels')) {
    dataFetches.showreels = fetchAllData('showreels', startDate, endDate);
  }
  if (selectedSheets.includes('redactions')) {
    dataFetches.redactions = fetchAllData('redactions', startDate, endDate);
  }

  const fetchedData = await Promise.all(Object.values(dataFetches));
  const dataResults: Record<string, any[]> = {};
  let idx = 0;
  for (const key of Object.keys(dataFetches)) {
    dataResults[key] = fetchedData[idx++];
  }

  const totalRecords =
    (dataResults.videos?.length || 0) +
    (dataResults.transcriptions?.length || 0) +
    (dataResults.showreels?.length || 0) +
    (dataResults.redactions?.length || 0);

  const fetchDuration = ((Date.now() - fetchStartTime) / 1000).toFixed(2);
  console.log(`✓ All data fetched in ${fetchDuration}s (${totalRecords} total records)`);

  await onProgress?.(30, 'fetching_data', {
    message: `Fetched ${totalRecords} records from database`,
    totalRows: totalRecords,
  });

  // ─── Phase 2: Write Excel files to memory buffers ──────────────
  await onProgress?.(35, 'streaming_data', {
    message: 'Creating Excel files...',
    totalRows: totalRecords,
  });

  console.log('\n--- Phase 2: Creating Excel buffers ---');
  const writeStartTime = Date.now();
  const dateRange = `${startDate.replace(/-/g, '')}_to_${endDate.replace(/-/g, '')}`;

  const excelBuffers: { name: string; buffer: Buffer }[] = [];
  let sheetsCompleted = 0;

  for (const sheetType of selectedSheets) {
    const data = dataResults[sheetType] || [];
    const sheetName = SHEET_NAMES[sheetType] || sheetType;
    const formatter = FORMATTERS[sheetType];
    const fileName = `${sheetName.replace(/\s+/g, '_')}_${dateRange}.xlsx`;

    if (!formatter) {
      console.warn(`No formatter for sheet type: ${sheetType}`);
      continue;
    }

    const buffer = await writeExcelToBuffer(ExcelJS, sheetName, data, formatter);
    excelBuffers.push({ name: fileName, buffer });

    sheetsCompleted++;
    const sheetProgress = 35 + Math.round((sheetsCompleted / selectedSheets.length) * 40);
    await onProgress?.(sheetProgress, 'streaming_data', {
      currentSheet: sheetName,
      rowsProcessed: data.length,
      totalRows: totalRecords,
      message: `Completed ${sheetName} (${data.length} rows)`,
    });
  }

  const writeDuration = ((Date.now() - writeStartTime) / 1000).toFixed(2);
  console.log(`✓ Excel buffers created in ${writeDuration}s`);

  // ─── Phase 3: ZIP + Upload to GridFS ───────────────────────────
  await onProgress?.(80, 'uploading', {
    message: 'Creating ZIP and uploading to storage...',
    totalRows: totalRecords,
  });

  console.log('\n--- Phase 3: ZIP + GridFS upload ---');
  const timestamp = Date.now();
  const zipFileName = `Advanced_Report_${dateRange}_${timestamp}.zip`;

  const { fileId, fileSize } = await createZipAndUploadToGridFS(
    excelBuffers,
    zipFileName,
  );

  await onProgress?.(95, 'finalizing', {
    message: 'Finalizing report...',
    totalRows: totalRecords,
  });

  const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log('\n=== GridFS Report Generation Complete ===');
  console.log(`Total Time: ${totalDuration}s`);
  console.log('Summary:', {
    zipFileName,
    fileId,
    fileSize,
    totalRecords,
    sheetsCreated: excelBuffers.length,
  });

  return {
    fileId,
    fileName: zipFileName,
    fileSize,
    recordCount: totalRecords,
  };
}
