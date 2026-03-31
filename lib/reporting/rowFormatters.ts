/**
 * Row formatters for report generation.
 *
 * Each formatter maps a raw SQL row to a clean object with the
 * column names used as Excel headers.
 */

// ─── Date Helpers ────────────────────────────────────────────────────

const formatDate = (date: any) => {
  if (!date) return '';
  try { return new Date(date).toISOString().split('T')[0]; } catch { return date; }
};

const formatDateTime = (date: any) => {
  if (!date) return '';
  try { return new Date(date).toISOString().replace('T', ' ').split('.')[0]; } catch { return date; }
};

// ─── Formatters ──────────────────────────────────────────────────────

export const FORMATTERS: Record<string, (row: any) => Record<string, any>> = {
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
