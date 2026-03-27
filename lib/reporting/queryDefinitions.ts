/**
 * SQL query definitions for report generation.
 *
 * Each query returns all rows for a given date range with ORDER BY
 * so the streaming generator can process them sequentially.
 * Uses `request.stream = true` on the SQL Server side (no OFFSET/FETCH).
 */

export const STREAMING_QUERIES: Record<string, (startDate: string, endDate: string) => { text: string; params: Record<string, any> }> = {
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

export const SHEET_NAMES: Record<string, string> = {
  videos: 'Videos',
  transcriptions: 'Transcriptions',
  showreels: 'Showreels',
  redactions: 'Redaction Requests',
};
