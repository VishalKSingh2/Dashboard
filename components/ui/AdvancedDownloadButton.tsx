'use client';

import { useState } from 'react';
import { Download, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DashboardFilters } from '@/lib/types';

interface AdvancedDownloadButtonProps {
  filters: DashboardFilters;
  disabled?: boolean;
}

export default function AdvancedDownloadButton({ filters, disabled }: AdvancedDownloadButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedSheets, setSelectedSheets] = useState({
    videos: true,
    transcriptions: true,
    showreels: true,
    redactions: true,
  });

  const handleButtonClick = () => {
    setIsModalOpen(true);
  };

  const handleDownload = async () => {
    setIsGenerating(true);

    try {
      // Get selected sheets as array
      const sheets = Object.entries(selectedSheets)
        .filter(([_, isSelected]) => isSelected)
        .map(([sheet, _]) => sheet);

      if (sheets.length === 0) {
        alert('Please select at least one sheet to generate');
        setIsGenerating(false);
        return;
      }

      // Generate the report (stored in GridFS) and get download URL
      const response = await fetch('/api/generate-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startDate: filters.startDate,
          endDate: filters.endDate,
          sheets,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate report');
      }

      const result = await response.json();

      if (!result.success || !result.downloadUrl) {
        throw new Error('Report generated but no download URL returned');
      }

      // Download the file from GridFS via /api/download/:fileId
      const downloadResponse = await fetch(result.downloadUrl);
      if (!downloadResponse.ok) {
        throw new Error('Failed to download the generated report');
      }

      const blob = await downloadResponse.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.fileName || 'Advanced_Report.zip';
      document.body.appendChild(a);
      a.click();

      // Cleanup
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      // Close modal and show success message
      setIsModalOpen(false);
      
      alert(
        `✅ Report Downloaded Successfully!\n\n` +
        `The advanced report has been downloaded to your system.\n` +
        `Filename: ${result.fileName}\n` +
        `Size: ${result.fileSize}\n` +
        `Records: ${result.recordCount?.toLocaleString()}`
      );

      console.log('Report downloaded:', result.fileName);
    } catch (error) {
      console.error('Failed to generate report:', error);
      alert(
        '❌ Failed to Generate Report\n\n' +
        'There was an error generating your report. Please try again.\n\n' +
        (error instanceof Error ? error.message : 'Unknown error')
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleClose = () => {
    if (!isGenerating) {
      setIsModalOpen(false);
    }
  };

  return (
    <>
      <button
        onClick={handleButtonClick}
        disabled={disabled || isGenerating}
        className={cn(
          'flex flex-col items-start gap-0.5 px-4 py-2 rounded-lg font-medium transition-all',
          'bg-purple-600 text-white hover:bg-purple-700',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'shadow-sm hover:shadow-md',
          isGenerating && 'animate-pulse'
        )}
        title="Generate and download advanced report"
      >
        <div className="flex items-center gap-2">
          <Download className="w-4 h-4" />
          <span>{isGenerating ? 'Generating...' : 'Advanced Report'}</span>
        </div>
        <span className="text-[10px] text-purple-200 font-normal">
          📊 Select sheets & download
        </span>
      </button>

      {/* Sheet Selection Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={handleClose}
          />
          
          {/* Modal */}
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6 animate-in fade-in zoom-in duration-200">
            {/* Close button */}
            {!isGenerating && (
              <button
                onClick={handleClose}
                className="absolute right-4 top-4 p-1 rounded-lg hover:bg-gray-100 transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            )}

            {/* Header */}
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                Advanced Report Generation
              </h2>
              <p className="text-sm text-gray-600">
                Select the sheets you want to include in your report. The report will be downloaded as a ZIP file.
              </p>
            </div>

            {/* Form */}
            <div className="space-y-4">
              {/* Sheet Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Select Sheets to Include
                </label>
                <div className="space-y-2 bg-gray-50 rounded-lg p-3">
                  {[
                    { key: 'videos', label: 'Videos' },
                    { key: 'transcriptions', label: 'Transcriptions' },
                    { key: 'showreels', label: 'Showreels' },
                    { key: 'redactions', label: 'Redactions' },
                  ].map(({ key, label }) => (
                    <label key={key} className="flex items-center gap-3 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={selectedSheets[key as keyof typeof selectedSheets]}
                        onChange={() => setSelectedSheets(prev => ({ ...prev, [key]: !prev[key as keyof typeof prev] }))}
                        disabled={isGenerating}
                        className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                      />
                      <span className="text-sm font-medium text-gray-900 group-hover:text-purple-600 transition-colors">
                        {label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Info box */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex gap-2">
                  <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  <div className="text-sm text-blue-800">
                    <p className="font-medium mb-1">What to expect:</p>
                    <ul className="list-disc list-inside space-y-1 text-blue-700">
                      <li>Report generation may take a few minutes</li>
                      <li>The file will download automatically when ready</li>
                      <li>Large date ranges may take longer</li>
                      <li>Please keep this window open during generation</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isGenerating}
                  className={cn(
                    'flex-1 px-4 py-2.5 rounded-lg font-medium transition-all',
                    'border border-gray-300 bg-white text-gray-700',
                    'hover:bg-gray-50',
                    'disabled:opacity-50 disabled:cursor-not-allowed'
                  )}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={isGenerating}
                  className={cn(
                    'flex-1 px-4 py-2.5 rounded-lg font-medium transition-all',
                    'bg-purple-600 text-white hover:bg-purple-700',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    'shadow-sm hover:shadow-md',
                    isGenerating && 'animate-pulse'
                  )}
                >
                  {isGenerating ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Generating...
                    </span>
                  ) : (
                    'Generate & Download'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
