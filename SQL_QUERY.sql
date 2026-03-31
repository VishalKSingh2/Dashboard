-- DECLARE @Limit INT = 100000;
-- DECLARE @Start DATETIME = '2023-01-01';
-- DECLARE @End   DATETIME = '2026-01-01';

-- SELECT TOP (@Limit)
--     DATEADD(MONTH, DATEDIFF(MONTH, 0, vs.Created), 0) AS [Month],
--     vs.ClientId, vs.ParentName, vs.ClientName, vs.Title, vs.VideoId,
--     vs.Region, vs.userId, vs.Created, vs.CreatedUnix, vs.LanguageIsoCode,
--     vs.Status, vs.TranscriptionStatus, vs.ViewCount,
--     CAST(vs.LengthInMilliseconds AS MONEY) / 60000 AS LengthInMinutes,
--     vs.Modified, vs.ModifiedUnix, vs.MediaSource, vs.UploadSource, vs.LastUpdated
-- FROM dbo.SPLUNK_VideoStatistics AS vs WITH (NOLOCK)
-- WHERE vs.Created >= @Start AND vs.Created <= @End
-- ORDER BY vs.Created, vs.VideoId;

-- SET STATISTICS IO ON;
-- SET STATISTICS TIME ON;

-- DECLARE @Limit INT = 100000;
-- DECLARE @Start DATETIME = '2025-01-01';
-- DECLARE @End   DATETIME = '2025-06-01';

-- SELECT TOP (@Limit) *
-- FROM dbo.SPLUNK_VideoStatistics AS vs WITH (NOLOCK)
-- WHERE vs.Created >= @Start AND vs.Created <= @End
-- ORDER BY vs.Created, vs.VideoId;

-- SET STATISTICS IO OFF;
-- SET STATISTICS TIME OFF;

-- Check ClientOverview indexes
-- SELECT i.name, i.type_desc, 
--   STRING_AGG(c.name, ', ') WITHIN GROUP (ORDER BY ic.key_ordinal) AS columns
-- FROM sys.indexes i
-- JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
-- JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
-- WHERE i.object_id = OBJECT_ID('dbo.clientoverview')
-- GROUP BY i.name, i.type_desc;

-- -- Check Customer indexes
-- SELECT i.name, i.type_desc,
--   STRING_AGG(c.name, ', ') WITHIN GROUP (ORDER BY ic.key_ordinal) AS columns
-- FROM sys.indexes i
-- JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
-- JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
-- WHERE i.object_id = OBJECT_ID('dbo.Customer')
-- GROUP BY i.name, i.type_desc;

-- -- Check row counts
-- SELECT 'ClientOverview' AS tbl, COUNT(*) AS rows FROM dbo.clientoverview
-- UNION ALL
-- SELECT 'Customer', COUNT(*) FROM dbo.Customer;

-- Test 1: Just count (no data transfer)
DECLARE @Start DATETIME = '2023-01-01', @End DATETIME = '2026-01-01';

SET STATISTICS TIME ON;
SELECT COUNT(*) FROM dbo.SPLUNK_VideoStatistics WITH (NOLOCK)
WHERE Created >= @Start AND Created <= @End;
SET STATISTICS TIME OFF;