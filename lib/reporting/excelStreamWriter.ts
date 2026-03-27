import { PassThrough } from 'stream';
import archiver from 'archiver';
import { queryStream } from '@/lib/db/sqlServer';
import { STREAMING_QUERIES } from './queryDefinitions';

/**
 * Excel Stream Writer
 *
 * Streams rows from a SQL query directly into an Excel workbook
 * that is appended to a ZIP archive entry via a PassThrough stream.
 *
 * Bytes flow: DB → format row → worksheet.addRow().commit()
 *   → PassThrough → archiver → GridFS
 *
 * When a sheet exceeds MAX_ROWS_PER_SHEET (500K), the current workbook
 * is finalized and a new one is started as a separate archive entry.
 */

/** Excel hard limit is 1,048,576 rows; we split well below that */
const MAX_ROWS_PER_SHEET = 500_000;

export async function streamSheetToExcel(
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
