'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DashboardFilters } from '@/lib/types';

interface AdvancedDownloadButtonProps {
  filters: DashboardFilters;
  disabled?: boolean;
}

interface AdvancedReportData {
  videos: any[];
  transcriptions: any[];
  showreels: any[];
  redactionRequests: any[];
}

export default function AdvancedDownloadButton({ filters, disabled }: AdvancedDownloadButtonProps) {
  const [isExporting, setIsExporting] = useState(false);

  const formatDateForFilename = (date: string) => {
    return date.replace(/-/g, '');
  };

  const handleExport = async () => {
    setIsExporting(true);

    try {
      // Fetch data from API
      const response = await fetch('/api/advanced-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startDate: filters.startDate,
          endDate: filters.endDate,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch advanced report data');
      }

      const result = await response.json();
      const { data, metadata } = result;

      // Check if there's any data at all
      const totalRecords = (data.videos?.length || 0) + 
                          (data.transcriptions?.length || 0) + 
                          (data.showreels?.length || 0) + 
                          (data.redactionRequests?.length || 0);

      if (totalRecords === 0) {
        alert('No data available to download for the selected date range.');
        return;
      }

      // Show warnings if any
      if (metadata.warnings && metadata.warnings.length > 0) {
        const warningMsg = metadata.warnings.join('\n');
        if (!confirm(`⚠️ Warning:\n\n${warningMsg}\n\nDo you want to continue with the export?`)) {
          return;
        }
      }

      // Log data for debugging
      console.log('Advanced Report Data:', {
        videos: data.videos?.length || 0,
        transcriptions: data.transcriptions?.length || 0,
        showreels: data.showreels?.length || 0,
        redactionRequests: data.redactionRequests?.length || 0,
      });

      // Generate Excel file with multiple sheets
      await generateExcelFile(data, metadata);

      // Show success notification
      setTimeout(() => {
        alert('Advanced report downloaded successfully!');
      }, 500);
    } catch (error) {
      console.error('Advanced report export failed:', error);
      alert('Failed to generate advanced report. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const generateExcelFile = async (data: AdvancedReportData, metadata: any) => {
    // Dynamic import to avoid SSR issues
    const XLSX = await import('xlsx');
    const workbook = XLSX.utils.book_new();

    // Helper function to format dates in Excel
    const formatDate = (date: any) => {
      if (!date) return '';
      try {
        const d = new Date(date);
        return d.toISOString().split('T')[0];
      } catch {
        return date;
      }
    };

    // Helper function to format datetime in Excel
    const formatDateTime = (date: any) => {
      if (!date) return '';
      try {
        const d = new Date(date);
        return d.toISOString().replace('T', ' ').split('.')[0];
      } catch {
        return date;
      }
    };

    // Sheet 1: Videos
    if (data.videos && data.videos.length > 0) {
      console.log('Processing Videos:', data.videos.length, 'records');
      const videosFormatted = data.videos.map((row: any) => ({
        'Month': formatDate(row.Month),
        'ClientId': row.ClientId,
        'ParentName': row.ParentName,
        'ClientName': row.ClientName,
        'Title': row.Title,
        'VideoId': row.VideoId,
        'Region': row.Region,
        'userId': row.userId,
        'Created': formatDateTime(row.Created),
        'CreatedUnix': row.CreatedUnix,
        'LanguageIsoCode': row.LanguageIsoCode,
        'Status': row.Status,
        'TranscriptionStatus': row.TranscriptionStatus,
        'ViewCount': row.ViewCount,
        'LengthInMinutes': row.LengthInMinutes,
        'Modified': formatDateTime(row.Modified),
        'ModifiedUnix': row.ModifiedUnix,
        'MediaSource': row.MediaSource,
        'UploadSource': row.UploadSource,
        'LastUpdated': formatDateTime(row.LastUpdated),
      }));
      const ws1 = XLSX.utils.json_to_sheet(videosFormatted);
      XLSX.utils.book_append_sheet(workbook, ws1, 'Videos');
    } else {
      console.log('No Videos data');
      const ws1 = XLSX.utils.aoa_to_sheet([['No data available for the selected date range']]);
      XLSX.utils.book_append_sheet(workbook, ws1, 'Videos');
    }

    // Sheet 2: Transcriptions
    if (data.transcriptions && data.transcriptions.length > 0) {
      console.log('Processing Transcriptions:', data.transcriptions.length, 'records');
      const transcriptionsFormatted = data.transcriptions.map((row: any) => ({
        'Month': formatDate(row.Month),
        'Id': row.Id,
        'VideoId': row.VideoId,
        'ThirdPartyId': row.ThirdPartyId,
        'ParentName': row.ParentName,
        'ClientName': row.ClientName,
        'ServiceName': row.ServiceName,
        'CreatedDate': formatDateTime(row.CreatedDate),
        'CreatedDateUnix': row.CreatedDateUnix,
        'RequestedDate': formatDateTime(row.RequestedDate),
        'RequestedDateUnix': row.RequestedDateUnix,
        'CompletedDate': formatDateTime(row.CompletedDate),
        'CompletedDateUnix': row.CompletedDateUnix,
        'Type': row.Type,
        'TranscriptionStatus': row.TranscriptionStatus,
        'Status': row.Status,
        'Title': row.Title,
        'ToIsoCode': row.ToIsoCode,
        'ToThirdPartyIsoCode': row.ToThirdPartyIsoCode,
        'FromIsoCode': row.FromIsoCode,
        'Modified': formatDateTime(row.Modified),
        'ModifiedUnix': row.ModifiedUnix,
        'LengthInMinutes': row.LengthInMinutes,
        'MediaSource': row.MediaSource,
        'UploadSource': row.UploadSource,
        'Region': row.Region,
        'LastUpdated': formatDateTime(row.LastUpdated),
      }));
      const ws2 = XLSX.utils.json_to_sheet(transcriptionsFormatted);
      XLSX.utils.book_append_sheet(workbook, ws2, 'Transcriptions');
    } else {
      console.log('No Transcriptions data');
      const ws2 = XLSX.utils.aoa_to_sheet([['No data available for the selected date range']]);
      XLSX.utils.book_append_sheet(workbook, ws2, 'Transcriptions');
    }

    // Sheet 3: Showreels
    if (data.showreels && data.showreels.length > 0) {
      console.log('Processing Showreels:', data.showreels.length, 'records');
      const showreelsFormatted = data.showreels.map((row: any) => ({
        'Month': formatDate(row.Month),
        'Id': row.Id,
        'ParentName': row.ParentName,
        'UserId': row.UserId,
        'Name': row.Name,
        'Title': row.Title,
        'Region': row.Region,
        'ProjectStatusText': row.ProjectStatusText,
        'PublishStatus': row.PublishStatus,
        'Modified': formatDateTime(row.Modified),
        'ModifiedUnix': row.ModifiedUnix,
        'ProjectLengthInMinutes': row.ProjectLengthInMinutes,
        'LastUpdated': formatDateTime(row.LastUpdated),
      }));
      const ws3 = XLSX.utils.json_to_sheet(showreelsFormatted);
      XLSX.utils.book_append_sheet(workbook, ws3, 'Showreels');
    } else {
      console.log('No Showreels data');
      const ws3 = XLSX.utils.aoa_to_sheet([['No data available for the selected date range']]);
      XLSX.utils.book_append_sheet(workbook, ws3, 'Showreels');
    }

    // Sheet 4: Redaction Requests
    if (data.redactionRequests && data.redactionRequests.length > 0) {
      console.log('Processing Redaction Requests:', data.redactionRequests.length, 'records');
      const redactionRequestsFormatted = data.redactionRequests.map((row: any) => ({
        'Month': formatDate(row.Month),
        'Id': row.Id,
        'LastUpdated': formatDateTime(row.LastUpdated),
        'CreatedDate': formatDateTime(row.CreatedDate),
        'ContentId': row.ContentId,
        'ContentType': row.ContentType,
        'RequestedDate': formatDateTime(row.RequestedDate),
        'CompletedDate': formatDateTime(row.CompletedDate),
        'Status': row.Status,
        'Region': row.Region,
        'Customer Name': row['Customer Name'],
        'Channel Name': row['Channel Name'],
      }));
      const ws4 = XLSX.utils.json_to_sheet(redactionRequestsFormatted);
      XLSX.utils.book_append_sheet(workbook, ws4, 'Redaction Requests');
    } else {
      console.log('No Redaction Requests data');
      const ws4 = XLSX.utils.aoa_to_sheet([['No data available for the selected date range']]);
      XLSX.utils.book_append_sheet(workbook, ws4, 'Redaction Requests');
    }

    // Generate filename
    const startDateStr = formatDateForFilename(metadata.startDate);
    const endDateStr = formatDateForFilename(metadata.endDate);
    const filename = `Advanced_Report_${startDateStr}_to_${endDateStr}.xlsx`;

    // Write and download
    XLSX.writeFile(workbook, filename);
  };

  return (
    <button
      onClick={handleExport}
      disabled={disabled || isExporting}
      className={cn(
        'flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all',
        'bg-purple-600 text-white hover:bg-purple-700',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        'shadow-sm hover:shadow-md',
        isExporting && 'animate-pulse'
      )}
      title="Download advanced report with detailed data"
    >
      <Download className="w-4 h-4" />
      {isExporting ? 'Generating...' : 'Advanced Report'}
    </button>
  );
}
