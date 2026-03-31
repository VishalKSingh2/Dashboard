import archiver from 'archiver';
import { getUploadStream, getFileInfo } from '@/lib/db/gridfs';
import { query } from '@/lib/db/sqlServer';
import { JobPhase } from '@/lib/jobs/jobTypes';
import { SHEET_NAMES, STREAMING_QUERIES } from './queryDefinitions';
import { FORMATTERS } from './rowFormatters';
import { streamSheetToExcel } from './excelStreamWriter';

/**
 * Report Generator — TRUE STREAMING
 *
 * Orchestrates the full pipeline:
 *   DB → Excel row writes → ZIP entry stream → GridFS upload stream
 *
 * At no point is the full dataset held in memory. Each chunk is
 * formatted and committed to the Excel streaming writer, which pushes
 * bytes through the ZIP archiver into GridFS.
 */

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

  await onProgress?.(2, 'initializing', {
    message: 'Estimating row counts...',
  });

  // ─── Estimate row counts per sheet for weighted progress ──────
  const sheetEstimates: Record<string, number> = {};
  try {
    const countResults = await Promise.all(
      selectedSheets.map(async (sheetType) => {
        const queryConfig = STREAMING_QUERIES[sheetType]?.(startDate, endDate);
        if (!queryConfig) return { sheet: sheetType, count: 0 };
        // Strip ORDER BY — SQL Server disallows it in derived tables
        const textWithoutOrder = queryConfig.text.replace(/ORDER\s+BY\s+[\s\S]+$/i, '');
        const countSql = `SELECT COUNT(*) AS cnt FROM (${textWithoutOrder}) AS __est`;
        const rows = await query<{ cnt: number }>(countSql, queryConfig.params, { timeout: 30000 }).catch(() => [{ cnt: 0 }]);
        return { sheet: sheetType, count: rows[0]?.cnt ?? 0 };
      }),
    );
    for (const { sheet, count } of countResults) {
      sheetEstimates[sheet] = count;
    }
  } catch {
    // Fall back to equal weighting
    for (const s of selectedSheets) sheetEstimates[s] = 1;
  }

  const totalEstimatedRows = Object.values(sheetEstimates).reduce((a, b) => a + b, 0) || 1;
  console.log('Row estimates:', sheetEstimates, 'Total:', totalEstimatedRows);

  await onProgress?.(5, 'streaming_data', {
    message: 'Starting streaming pipeline...',
    totalRows: totalEstimatedRows,
  });

  // ─── Process each sheet sequentially ──────────────────────────────
  let totalRecords = 0;
  let sheetsCompleted = 0;
  let rowsProcessedSoFar = 0; // cumulative across all sheets

  for (const sheetType of selectedSheets) {
    const sheetName = SHEET_NAMES[sheetType] || sheetType;
    const formatter = FORMATTERS[sheetType];

    if (!formatter) {
      console.warn(`No formatter for sheet type: ${sheetType}, skipping.`);
      continue;
    }

    // Calculate this sheet's weight in the overall progress (5% to 90%)
    const sheetWeight = (sheetEstimates[sheetType] || 1) / totalEstimatedRows;
    const progressBefore = 5 + Math.round((rowsProcessedSoFar / totalEstimatedRows) * 85);

    await onProgress?.(
      progressBefore,
      'streaming_data',
      {
        currentSheet: sheetName,
        rowsProcessed: totalRecords,
        totalRows: totalEstimatedRows,
        message: `Processing ${sheetName}...`,
      },
    );

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
        // Linear progress within this sheet's weighted slice
        const sheetFraction = Math.min(rowsSoFar / Math.max(sheetEstimates[sheetType] || 1, 1), 1);
        const progress = 5 + Math.round(((rowsProcessedSoFar + rowsSoFar) / totalEstimatedRows) * 85);
        onProgress?.(Math.min(progress, 90), 'streaming_data', {
          currentSheet: sheetName,
          rowsProcessed: totalRecords + rowsSoFar,
          totalRows: totalEstimatedRows,
          message: `${sheetName}: ${rowsSoFar.toLocaleString()} rows streamed...`,
        });
      },
    );

    totalRecords += sheetRows;
    rowsProcessedSoFar += sheetRows;
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
