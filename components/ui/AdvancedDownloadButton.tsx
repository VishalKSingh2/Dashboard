'use client';

import { useState } from 'react';
import { X, FileSpreadsheet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DashboardFilters } from '@/lib/types';

interface AdvancedDownloadButtonProps {
  filters: DashboardFilters;
  disabled?: boolean;
}

export default function AdvancedDownloadButton({ filters, disabled }: AdvancedDownloadButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedSheets, setSelectedSheets] = useState({
    videos: true,
    transcriptions: true,
    showreels: true,
    redactions: true,
  });

  const handleGenerate = async () => {
    const sheets = Object.entries(selectedSheets)
      .filter(([, selected]) => selected)
      .map(([sheet]) => sheet);

    if (sheets.length === 0) {
      alert('Please select at least one sheet to generate');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/queue-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate: filters.startDate,
          endDate: filters.endDate,
          sheets,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to queue report');
      }

      // Job queued → close modal. ReportJobsPanel will pick it up.
      setIsModalOpen(false);
    } catch (error) {
      alert(
        'Failed to queue report: ' +
          (error instanceof Error ? error.message : 'Unknown error'),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setIsModalOpen(true)}
        disabled={disabled}
        className={cn(
          'flex flex-col items-start gap-0.5 px-4 py-2 rounded-lg font-medium transition-all',
          'bg-purple-600 text-white hover:bg-purple-700',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'shadow-sm hover:shadow-md',
        )}
        title="Generate advanced report"
      >
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4" />
          <span>Advanced Report</span>
        </div>
        <span className="text-[10px] text-purple-200 font-normal">
          Select sheets &amp; generate
        </span>
      </button>

      {/* ─── Sheet Selection Modal ─── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => !isSubmitting && setIsModalOpen(false)}
          />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6 animate-in fade-in zoom-in duration-200">
            {!isSubmitting && (
              <button
                onClick={() => setIsModalOpen(false)}
                className="absolute right-4 top-4 p-1 rounded-lg hover:bg-gray-100 transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            )}

            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                Advanced Report Generation
              </h2>
              <p className="text-sm text-gray-600">
                Select the sheets you want to include in your report. The report
                will be generated as a ZIP file.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Select Sheets to Include
                </label>
                <div className="space-y-2 bg-gray-50 rounded-lg p-3">
                  {([
                    { key: 'videos', label: 'Videos' },
                    { key: 'transcriptions', label: 'Transcriptions' },
                    { key: 'showreels', label: 'Showreels' },
                    { key: 'redactions', label: 'Redactions' },
                  ] as const).map(({ key, label }) => (
                    <label
                      key={key}
                      className="flex items-center gap-3 cursor-pointer group"
                    >
                      <input
                        type="checkbox"
                        checked={selectedSheets[key]}
                        onChange={() =>
                          setSelectedSheets((prev) => ({
                            ...prev,
                            [key]: !prev[key],
                          }))
                        }
                        disabled={isSubmitting}
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
                  <svg
                    className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <div className="text-sm text-blue-800">
                    <p className="font-medium mb-1">What to expect:</p>
                    <ul className="list-disc list-inside space-y-1 text-blue-700">
                      <li>Report generation may take a few minutes</li>
                      <li>You can track progress in the Jobs panel</li>
                      <li>Download button appears when ready</li>
                      <li>Jobs persist across page reloads</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSubmitting}
                  className={cn(
                    'flex-1 px-4 py-2.5 rounded-lg font-medium transition-all',
                    'border border-gray-300 bg-white text-gray-700',
                    'hover:bg-gray-50',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                  )}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={isSubmitting}
                  className={cn(
                    'flex-1 px-4 py-2.5 rounded-lg font-medium transition-all',
                    'bg-purple-600 text-white hover:bg-purple-700',
                    'shadow-sm hover:shadow-md',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                  )}
                >
                  {isSubmitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg
                        className="animate-spin h-4 w-4"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                          fill="none"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      Queuing...
                    </span>
                  ) : (
                    'Generate'
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
