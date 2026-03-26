import { queryStream } from './db';
import { PassThrough } from 'stream';
import path from 'path';
import fs from 'fs';
import archiver from 'archiver';

/** Excel hard limit is 1,048,576 rows; we split well below that */
const MAX_ROWS_PER_SHEET = 500_000;

interface ExcelGenerationResult {
	fileName: string;
	filePath: string;
	recordCount: number;
}

// ─── Streaming SQL queries (single unbounded SELECT per sheet, no OFFSET/FETCH) ──

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
			ORDER BY [trs].[RequestedDate] ASC, [trs].[Id] ASC
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
			ORDER BY rrs.CompletedDate ASC, rrs.Id ASC
		`,
		params: { Start: startDate, End: endDate },
	}),
};

// Helper functions for date formatting
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

// ─── Row formatters ──────────────────────────────────────────────────

const FORMATTERS: Record<string, (row: any) => Record<string, any>> = {
	videos: (row) => ({
		Month: formatDate(row.Month),
		ClientId: row.ClientId,
		ParentName: row.ParentName,
		ClientName: row.ClientName,
		Title: row.Title,
		VideoId: row.VideoId,
		Region: row.Region,
		UserId: row.userId,
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

// ─── Stream a single sheet: DB row stream → Excel writer → archive ──

/**
 * Streams rows from SQL Server directly into an ExcelJS WorkbookWriter
 * backed by a PassThrough stream.  The PassThrough is appended to the
 * archiver so bytes flow:
 *
 *   DB (request.stream) → format row → worksheet.addRow().commit()
 *     → PassThrough → archiver → disk ZIP
 *
 * When a sheet exceeds MAX_ROWS_PER_SHEET (500K), the current workbook
 * is finalized and a new one is started for the next split, each
 * appended as a separate archive entry.
 */
async function streamSheetToArchive(
	ExcelJS: any,
	archive: archiver.Archiver,
	sheetType: string,
	sheetName: string,
	startDate: string,
	endDate: string,
	dateRange: string,
	formatter: (row: any) => Record<string, any>,
): Promise<{ totalRows: number; filesCreated: number }> {
	const queryConfig = STREAMING_QUERIES[sheetType](startDate, endDate);

	let totalRows = 0;
	let sheetRows = 0;
	let splitIndex = 0;
	let headerKeys: string[] | null = null;

	// ── Helper: create a new PassThrough + WorkbookWriter pair ──
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

		// Re-apply headers if we already know them (subsequent splits)
		if (headerKeys) {
			worksheet.columns = headerKeys.map((key: string) => ({
				header: key,
				key,
				width: Math.min(Math.max(key.length + 2, 12), 60),
			}));
		}

		return { passThrough, workbookWriter, worksheet, excelFileName };
	}

	// ── Helper: close the current split ──
	async function closeSplit(ws: any, wb: any) {
		ws.commit();
		await wb.commit(); // Closes the PassThrough
	}

	console.log(`[${sheetType}] Starting streaming query → Excel → ZIP...`);

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

		// Log progress every 50K rows
		if (totalRows % 50000 === 0) {
			console.log(`[${sheetType}] ${totalRows.toLocaleString()} rows streamed...`);
		}
	}

	// Handle empty result set
	if (totalRows === 0) {
		current.worksheet.addRow({ A: 'No data available for the selected date range' }).commit();
	}

	await closeSplit(current.worksheet, current.workbookWriter);

	console.log(`[${sheetType}] ✓ Streamed ${totalRows.toLocaleString()} rows across ${splitIndex} file(s)`);
	return { totalRows, filesCreated: splitIndex };
}

// ─── Main Entry Point ────────────────────────────────────────────────

/**
 * Generate Excel report with TRUE streaming to disk:
 *
 *   DB (request.stream=true) → format row → ExcelJS WorkbookWriter
 *     → PassThrough → archiver (ZIP) → disk file
 *
 * At no point is the full dataset held in memory.  Each row is
 * formatted and committed to the streaming Excel writer, which pushes
 * bytes through the ZIP archiver into the output file.
 *
 * Sheets are split at 500K rows to stay within Excel's 1,048,576 limit.
 */
export async function generateAdvancedReportExcel(
	startDate: string,
	endDate: string,
	sheets?: string[],
): Promise<ExcelGenerationResult> {
	const startTime = Date.now();
	console.log('=== Starting Advanced Report Generation (TRUE STREAMING) ===');
	console.log('Date Range:', { startDate, endDate });

	const selectedSheets =
		sheets && sheets.length > 0
			? sheets
			: ['videos', 'transcriptions', 'showreels', 'redactions'];
	console.log('Selected sheets:', selectedSheets.join(', '));

	const ExcelJSModule = await import('exceljs');
	const ExcelJS = (ExcelJSModule as any).default ?? ExcelJSModule;

	// ── Set up output path ──
	const reportsDir = path.join(process.cwd(), 'public', 'reports');
	if (!fs.existsSync(reportsDir)) {
		fs.mkdirSync(reportsDir, { recursive: true });
	}

	const timestamp = Date.now();
	const dateRange = `${startDate.replace(/-/g, '')}_to_${endDate.replace(/-/g, '')}`;
	const zipFileName = `Advanced_Report_${dateRange}_${timestamp}.zip`;
	const zipFilePath = path.join(reportsDir, zipFileName);

	// ── Set up streaming pipeline: archiver → disk file ──
	const output = fs.createWriteStream(zipFilePath);
	const archive = archiver('zip', { zlib: { level: 1 } });

	const archiveFinished = new Promise<void>((resolve, reject) => {
		output.on('close', resolve);
		archive.on('error', reject);
	});

	archive.pipe(output);

	// ── Process each sheet sequentially: DB → Excel → ZIP ──
	let totalRecords = 0;

	for (const sheetType of selectedSheets) {
		const sheetName = SHEET_NAMES[sheetType] || sheetType;
		const formatter = FORMATTERS[sheetType];

		if (!formatter || !STREAMING_QUERIES[sheetType]) {
			console.warn(`No formatter/query for sheet type: ${sheetType}, skipping.`);
			continue;
		}

		const { totalRows } = await streamSheetToArchive(
			ExcelJS,
			archive,
			sheetType,
			sheetName,
			startDate,
			endDate,
			dateRange,
			formatter,
		);

		totalRecords += totalRows;
	}

	// ── Finalize archive ──
	await archive.finalize();
	await archiveFinished;

	const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
	console.log('\n=== Advanced Report Generation Complete (TRUE STREAMING) ===');
	console.log(`Total Time: ${totalDuration}s`);
	console.log('Summary:', { zipFileName, totalRecords });

	return {
		fileName: zipFileName,
		filePath: zipFilePath,
		recordCount: totalRecords,
	};
}
