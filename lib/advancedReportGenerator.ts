import { query } from './db';
import path from 'path';
import fs from 'fs';
import archiver from 'archiver';

const BATCH_SIZE = 50000; // Write 50k records per batch to Excel
const DB_CHUNK_SIZE = 25000; // Reduced to 25k to improve query performance and reduce memory pressure

interface ExcelGenerationResult {
	fileName: string;
	filePath: string;
	recordCount: number;
}

// Query templates for parallel execution with cursor-based pagination (optimized)
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

/**
 * Fetch all data for a specific query type with cursor-based pagination (optimized)
 */
async function fetchAllData(
	queryType: keyof typeof QUERY_TEMPLATES,
	startDate: string,
	endDate: string
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
			const queryConfig = QUERY_TEMPLATES[queryType](startDate, endDate, offset, DB_CHUNK_SIZE, lastDate, lastId);

			console.log(`[${queryType}] Fetching chunk starting at offset ${offset} (lastDate: ${lastDate}, lastId: ${lastId})...`);
			const chunkStartTime = Date.now();

			// Add timeout wrapper (3 minutes per chunk)
			const chunk = await Promise.race([
				query(queryConfig.text, queryConfig.params, { timeout: 180000 }),
				new Promise<any[]>((_, reject) =>
					setTimeout(() => reject(new Error('Query timeout after 3 minutes')), 180000)
				)
			]);

			const chunkDuration = ((Date.now() - chunkStartTime) / 1000).toFixed(2);
			console.log(`[${queryType}] Query completed in ${chunkDuration}s`);

			if (!chunk || chunk.length === 0) {
				console.log(`[${queryType}] No more data, ending fetch`);
				hasMore = false;
			} else {
				allData.push(...chunk);
				offset += chunk.length;
				consecutiveErrors = 0; // Reset error counter on success

				// Track cursor position for next iteration
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

				console.log(`[${queryType}] Fetched ${chunk.length} records (total: ${allData.length})`);

				if (chunk.length < DB_CHUNK_SIZE) {
					console.log(`[${queryType}] Received less than ${DB_CHUNK_SIZE} records, assuming end of data`);
					hasMore = false;
				}

				// Yield to event loop between chunks
				await new Promise((resolve) => setImmediate(resolve));
			}
		} catch (error) {
			consecutiveErrors++;
			console.error(`[${queryType}] Error fetching chunk at offset ${offset} (attempt ${consecutiveErrors}/${MAX_RETRIES}):`, error);

			if (consecutiveErrors >= MAX_RETRIES) {
				console.error(`[${queryType}] Max retries reached, stopping fetch. Returning ${allData.length} records so far.`);
				hasMore = false;
			} else {
				// Wait before retry (exponential backoff)
				const waitTime = Math.min(1000 * Math.pow(2, consecutiveErrors - 1), 10000);
				console.log(`[${queryType}] Waiting ${waitTime}ms before retry...`);
				await new Promise((resolve) => setTimeout(resolve, waitTime));
			}
		}
	}

	console.log(`[${queryType}] Completed: ${allData.length} total records`);
	return allData;
}

/**
 * Write data to separate Excel file using streaming approach for large datasets
 */
async function writeToSeparateExcelFile(
	ExcelJS: any,
	fileName: string,
	filePath: string,
	sheetName: string,
	data: any[],
	formatter: (row: any) => any
): Promise<void> {
	console.log(`[${sheetName}] Creating separate file: ${fileName}`);

	const dir = path.dirname(filePath);
	if (!fs.existsSync(dir)) {
		console.log(`[${sheetName}] Creating directory: ${dir}`);
		fs.mkdirSync(dir, { recursive: true });
	}

	if (data.length === 0) {
		console.log(`[${sheetName}] No data available for selected date range, creating empty sheet...`);

		const emptyWorkbook = new ExcelJS.Workbook();
		const worksheet = emptyWorkbook.addWorksheet(sheetName);
		worksheet.addRow(['No data available for the selected date range']);

		await emptyWorkbook.xlsx.writeFile(filePath);

		console.log(`[${sheetName}] ✓ Empty file created: ${fileName}`);
		return;
	}

	console.log(`[${sheetName}] Processing ${data.length} records with streaming writer...`);

	const streamingWorkbook = new ExcelJS.stream.xlsx.WorkbookWriter({
		filename: filePath,
		useSharedStrings: false,
		useStyles: false
	});
	const worksheet = streamingWorkbook.addWorksheet(sheetName);

	let headerKeys: string[] | null = null;
	let processedRows = 0;

	const ensureHeaders = (formattedRow: Record<string, any>) => {
		if (!headerKeys) {
			headerKeys = Object.keys(formattedRow);
			worksheet.columns = headerKeys.map((key: string) => ({
				header: key,
				key,
				width: Math.min(Math.max(key.length + 2, 12), 60)
			}));
		}
	};

	for (let start = 0; start < data.length; start += BATCH_SIZE) {
		const end = Math.min(start + BATCH_SIZE, data.length);
		console.log(`[${sheetName}] Streaming rows ${start + 1}-${end}...`);

		for (let index = start; index < end; index++) {
			const formattedRow = formatter(data[index]);
			ensureHeaders(formattedRow);

			const rowData: Record<string, unknown> = {};
			headerKeys!.forEach((key) => {
				rowData[key] = formattedRow[key] ?? null;
			});

			worksheet.addRow(rowData).commit();
		}

		processedRows += end - start;
		console.log(`[${sheetName}] ${processedRows} rows written so far`);

		await new Promise((resolve) => setImmediate(resolve));

		if (processedRows !== 0 && processedRows % (BATCH_SIZE * 2) === 0 && global.gc) {
			global.gc();
		}
	}

	worksheet.commit();

	try {
		await streamingWorkbook.commit();
	} catch (error) {
		console.error(`[${sheetName}] Error committing workbook:`, error);
		if (fs.existsSync(filePath)) {
			fs.unlinkSync(filePath);
		}
		throw error;
	}

	console.log(`[${sheetName}] ✓ File complete: ${fileName} (${data.length} records)`);
}

/**
 * Create ZIP file from multiple Excel files
 */
async function createZipFile(
	files: { path: string; name: string }[],
	zipPath: string
): Promise<void> {
	return new Promise((resolve, reject) => {
		const output = fs.createWriteStream(zipPath);
		const archive = archiver('zip', { zlib: { level: 9 } });

		output.on('close', () => {
			console.log(`ZIP file created: ${zipPath} (${archive.pointer()} bytes)`);
			resolve();
		});

		archive.on('error', (err) => {
			reject(err);
		});

		archive.pipe(output);

		// Add files to ZIP
		files.forEach((file) => {
			if (fs.existsSync(file.path)) {
				archive.file(file.path, { name: file.name });
			}
		});

		archive.finalize();
	});
}

/**
 * Generate Excel file on server with parallel queries and batched writing
 */
export async function generateAdvancedReportExcel(
	startDate: string,
	endDate: string,
	sheets?: string[]
): Promise<ExcelGenerationResult> {
	const startTime = Date.now();
	console.log('=== Starting Advanced Report Generation ===');
	console.log('Date Range:', { startDate, endDate });

	// Default to all sheets if none specified
	const selectedSheets = sheets && sheets.length > 0 ? sheets : ['videos', 'transcriptions', 'showreels', 'redactions'];
	console.log('Selected sheets:', selectedSheets.join(', '));

	// Dynamic import ExcelJS for server-side use
	const ExcelJSModule = await import('exceljs');
	const ExcelJS = (ExcelJSModule as any).default ?? ExcelJSModule;

	// ============ PARALLEL DATA FETCHING (only selected sheets) ============
	console.log('\n--- Phase 1: Fetching data in parallel ---');
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
	let index = 0;
	for (const key of Object.keys(dataFetches)) {
		dataResults[key] = fetchedData[index++];
	}

	const fetchDuration = ((Date.now() - fetchStartTime) / 1000).toFixed(2);
	console.log(`\n✓ All data fetched in ${fetchDuration}s`);
	console.log('Record counts:', {
		videos: dataResults.videos?.length || 0,
		transcriptions: dataResults.transcriptions?.length || 0,
		showreels: dataResults.showreels?.length || 0,
		redactions: dataResults.redactions?.length || 0,
		total:
			(dataResults.videos?.length || 0) +
			(dataResults.transcriptions?.length || 0) +
			(dataResults.showreels?.length || 0) +
			(dataResults.redactions?.length || 0)
	});

	// ============ PARALLEL EXCEL FILE CREATION ============
	console.log('\n--- Phase 2: Creating separate Excel files in parallel ---');
	const writeStartTime = Date.now();

	const reportsDir = path.join(process.cwd(), 'public', 'reports');
	if (!fs.existsSync(reportsDir)) {
		fs.mkdirSync(reportsDir, { recursive: true });
	}

	const timestamp = Date.now();
	const dateRange = `${startDate.replace(/-/g, '')}_to_${endDate.replace(/-/g, '')}`;

	// Formatters
	const videosFormatter = (row: any) => ({
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
		LastUpdated: formatDateTime(row.LastUpdated)
	});

	const transcriptionsFormatter = (row: any) => ({
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
		LastUpdated: formatDateTime(row.LastUpdated)
	});

	const showreelsFormatter = (row: any) => ({
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
		LastUpdated: formatDateTime(row.LastUpdated)
	});

	const redactionsFormatter = (row: any) => ({
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
		'Channel Name': row['Channel Name']
	});

	const createdFiles: { path: string; name: string }[] = [];
	const hasLargeFiles = Object.values(dataResults).some((dataset) => (dataset?.length || 0) > 100000);

	if (hasLargeFiles) {
		console.log('⚠️  Large datasets detected - writing files sequentially to prevent memory issues...');

		if (selectedSheets.includes('videos')) {
			const fileName = `Videos_${dateRange}.xlsx`;
			const filePath = path.join(reportsDir, fileName);
			await writeToSeparateExcelFile(ExcelJS, fileName, filePath, 'Videos', dataResults.videos || [], videosFormatter);
			createdFiles.push({ path: filePath, name: fileName });
		}

		if (selectedSheets.includes('transcriptions')) {
			const fileName = `Transcriptions_${dateRange}.xlsx`;
			const filePath = path.join(reportsDir, fileName);
			await writeToSeparateExcelFile(
				ExcelJS,
				fileName,
				filePath,
				'Transcriptions',
				dataResults.transcriptions || [],
				transcriptionsFormatter
			);
			createdFiles.push({ path: filePath, name: fileName });
		}

		if (selectedSheets.includes('showreels')) {
			const fileName = `Showreels_${dateRange}.xlsx`;
			const filePath = path.join(reportsDir, fileName);
			await writeToSeparateExcelFile(ExcelJS, fileName, filePath, 'Showreels', dataResults.showreels || [], showreelsFormatter);
			createdFiles.push({ path: filePath, name: fileName });
		}

		if (selectedSheets.includes('redactions')) {
			const fileName = `Redactions_${dateRange}.xlsx`;
			const filePath = path.join(reportsDir, fileName);
			await writeToSeparateExcelFile(
				ExcelJS,
				fileName,
				filePath,
				'Redaction Requests',
				dataResults.redactions || [],
				redactionsFormatter
			);
			createdFiles.push({ path: filePath, name: fileName });
		}
	} else {
		console.log('Writing files in parallel (small datasets)...');
		const filePromises: Promise<{ path: string; name: string }>[] = [];

		if (selectedSheets.includes('videos')) {
			const fileName = `Videos_${dateRange}.xlsx`;
			const filePath = path.join(reportsDir, fileName);
			filePromises.push(
				writeToSeparateExcelFile(ExcelJS, fileName, filePath, 'Videos', dataResults.videos || [], videosFormatter).then(() => ({
					path: filePath,
					name: fileName
				}))
			);
		}

		if (selectedSheets.includes('transcriptions')) {
			const fileName = `Transcriptions_${dateRange}.xlsx`;
			const filePath = path.join(reportsDir, fileName);
			filePromises.push(
				writeToSeparateExcelFile(
					ExcelJS,
					fileName,
					filePath,
					'Transcriptions',
					dataResults.transcriptions || [],
					transcriptionsFormatter
				).then(() => ({ path: filePath, name: fileName }))
			);
		}

		if (selectedSheets.includes('showreels')) {
			const fileName = `Showreels_${dateRange}.xlsx`;
			const filePath = path.join(reportsDir, fileName);
			filePromises.push(
				writeToSeparateExcelFile(ExcelJS, fileName, filePath, 'Showreels', dataResults.showreels || [], showreelsFormatter).then(
					() => ({ path: filePath, name: fileName })
				)
			);
		}

		if (selectedSheets.includes('redactions')) {
			const fileName = `Redactions_${dateRange}.xlsx`;
			const filePath = path.join(reportsDir, fileName);
			filePromises.push(
				writeToSeparateExcelFile(
					ExcelJS,
					fileName,
					filePath,
					'Redaction Requests',
					dataResults.redactions || [],
					redactionsFormatter
				).then(() => ({ path: filePath, name: fileName }))
			);
		}

		const results = await Promise.allSettled(filePromises);
		results.forEach((result) => {
			if (result.status === 'fulfilled') {
				createdFiles.push(result.value);
			} else {
				console.error('File creation failed:', result.reason);
			}
		});
	}

	const writeDuration = ((Date.now() - writeStartTime) / 1000).toFixed(2);
	console.log(`\n✓ All Excel files created in ${writeDuration}s`);
	console.log(`Created ${createdFiles.length} files:`, createdFiles.map((f) => f.name));

	// ============ CREATE ZIP FILE ============
	console.log('\n--- Phase 3: Creating ZIP archive ---');
	const zipStartTime = Date.now();

	const zipFileName = `Advanced_Report_${dateRange}_${timestamp}.zip`;
	const zipFilePath = path.join(reportsDir, zipFileName);

	await createZipFile(createdFiles, zipFilePath);

	const zipDuration = ((Date.now() - zipStartTime) / 1000).toFixed(2);
	console.log(`✓ ZIP file created in ${zipDuration}s`);

	// Clean up individual Excel files
	console.log('\n--- Phase 4: Cleaning up temporary files ---');
	for (const file of createdFiles) {
		try {
			fs.unlinkSync(file.path);
			console.log(`Deleted: ${file.name}`);
		} catch (err) {
			console.warn(`Could not delete ${file.name}:`, err);
		}
	}

	const totalRecords =
		(dataResults.videos?.length || 0) +
		(dataResults.transcriptions?.length || 0) +
		(dataResults.showreels?.length || 0) +
		(dataResults.redactions?.length || 0);
	const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);

	console.log('\n=== Report Generation Complete ===');
	console.log(`Total Time: ${totalDuration}s`);
	console.log('Summary:', {
		zipFileName,
		totalRecords,
		filesCreated: createdFiles.length,
		videos: dataResults.videos?.length || 0,
		transcriptions: dataResults.transcriptions?.length || 0,
		showreels: dataResults.showreels?.length || 0,
		redactions: dataResults.redactions?.length || 0
	});

	return {
		fileName: zipFileName,
		filePath: zipFilePath,
		recordCount: totalRecords
	};
}
