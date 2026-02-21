'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Download, X, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DashboardFilters } from '@/lib/types';
import { JobSSEEvent } from '@/lib/mongoJobTypes';

interface AdvancedDownloadButtonProps {
  filters: DashboardFilters;
  disabled?: boolean;
}

type ViewState =
  | { kind: 'idle' }
  | { kind: 'modal' }
  | { kind: 'progress'; jobId: string; progress: number; phase: string; message?: string }
  | { kind: 'completed'; jobId: string; downloadUrl: string; fileName: string; fileSize: string; recordCount?: number }
  | { kind: 'failed'; jobId: string; error: string };

export default function AdvancedDownloadButton({ filters, disabled }: AdvancedDownloadButtonProps) {
  const [view, setView] = useState<ViewState>({ kind: 'idle' });
  const [selectedSheets, setSelectedSheets] = useState({
    videos: true,
    transcriptions: true,
    showreels: true,
    redactions: true,
  });
  const [isDownloading, setIsDownloading] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Cleanup SSE on unmount
  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  // ─── SSE listener ──────────────────────────────────────────────────

  const listenToJob = useCallback((jobId: string) => {
    // Close any existing connection
    eventSourceRef.current?.close();

    const es = new EventSource(`/api/job-status/${jobId}`);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data: JobSSEEvent = JSON.parse(event.data);

        if (data.type === 'completed') {
          setView({
            kind: 'completed',
            jobId: data.jobId,
            downloadUrl: data.downloadUrl || '',
            fileName: data.fileName || 'Report.zip',
            fileSize: data.fileSize || '',
            recordCount: data.recordCount,
          });
          es.close();
        } else if (data.type === 'failed') {
          setView({
            kind: 'failed',
            jobId: data.jobId,
            error: data.errorMessage || 'Report generation failed',
          });
          es.close();
        } else {
          // progress / status
          setView({
            kind: 'progress',
            jobId: data.jobId,
            progress: data.progress,
            phase: phaseLabel(data.phase),
            message: data.progressDetails?.message,
          });
        }
      } catch (err) {
        console.error('SSE parse error:', err);
      }
    };

    es.onerror = () => {
      // EventSource will auto-reconnect, but if it keeps failing, show error
      console.warn('SSE connection error, will retry...');
    };
  }, []);

  // ─── Handlers ──────────────────────────────────────────────────────

  const handleGenerate = async () => {
    const sheets = Object.entries(selectedSheets)
      .filter(([, selected]) => selected)
      .map(([sheet]) => sheet);

    if (sheets.length === 0) {
      alert('Please select at least one sheet to generate');
      return;
    }

    // Close modal immediately and show progress
    setView({ kind: 'progress', jobId: '', progress: 0, phase: 'Queuing job...' });

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

      const { jobId } = await response.json();

      setView({ kind: 'progress', jobId, progress: 0, phase: 'Queued' });
      listenToJob(jobId);
    } catch (error) {
      setView({
        kind: 'failed',
        jobId: '',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  const handleDownload = async (downloadUrl: string, fileName: string) => {
    setIsDownloading(true);
    try {
      const response = await fetch(downloadUrl);
      if (!response.ok) throw new Error('Download failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Download error:', error);
      alert('Failed to download the report. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDismiss = () => {
    eventSourceRef.current?.close();
    setView({ kind: 'idle' });
  };

  const handleCloseModal = () => {
    setView({ kind: 'idle' });
  };

  // ─── Render ────────────────────────────────────────────────────────

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setView({ kind: 'modal' })}
        disabled={disabled || view.kind === 'progress'}
        className={cn(
          'flex flex-col items-start gap-0.5 px-4 py-2 rounded-lg font-medium transition-all',
          'bg-purple-600 text-white hover:bg-purple-700',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'shadow-sm hover:shadow-md',
          view.kind === 'progress' && 'animate-pulse'
        )}
        title="Generate advanced report"
      >
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4" />
          <span>{view.kind === 'progress' ? 'Generating...' : 'Advanced Report'}</span>
        </div>
        <span className="text-[10px] text-purple-200 font-normal">
          Select sheets &amp; generate
        </span>
      </button>

      {/* ─── Sheet Selection Modal ─── */}
      {view.kind === 'modal' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleCloseModal} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6 animate-in fade-in zoom-in duration-200">
            <button
              onClick={handleCloseModal}
              className="absolute right-4 top-4 p-1 rounded-lg hover:bg-gray-100 transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>

            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Advanced Report Generation</h2>
              <p className="text-sm text-gray-600">
                Select the sheets you want to include in your report. The report will be generated as a ZIP file.
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
                    <label key={key} className="flex items-center gap-3 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={selectedSheets[key]}
                        onChange={() =>
                          setSelectedSheets((prev) => ({ ...prev, [key]: !prev[key] }))
                        }
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
                      <li>You can track progress in real time</li>
                      <li>Download button will appear when ready</li>
                      <li>Large date ranges may take longer</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className={cn(
                    'flex-1 px-4 py-2.5 rounded-lg font-medium transition-all',
                    'border border-gray-300 bg-white text-gray-700',
                    'hover:bg-gray-50'
                  )}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleGenerate}
                  className={cn(
                    'flex-1 px-4 py-2.5 rounded-lg font-medium transition-all',
                    'bg-purple-600 text-white hover:bg-purple-700',
                    'shadow-sm hover:shadow-md'
                  )}
                >
                  Generate
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Progress / Completed / Failed Banner ─── */}
      {(view.kind === 'progress' || view.kind === 'completed' || view.kind === 'failed') && (
        <div className="fixed bottom-6 right-6 z-50 w-96 animate-in slide-in-from-bottom-4 duration-300">
          <div className="bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden">
            {/* Header bar */}
            <div
              className={cn(
                'flex items-center justify-between px-4 py-3',
                view.kind === 'progress' && 'bg-purple-50',
                view.kind === 'completed' && 'bg-green-50',
                view.kind === 'failed' && 'bg-red-50'
              )}
            >
              <div className="flex items-center gap-2">
                {view.kind === 'progress' && (
                  <Loader2 className="w-4 h-4 text-purple-600 animate-spin" />
                )}
                {view.kind === 'completed' && (
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                )}
                {view.kind === 'failed' && (
                  <AlertCircle className="w-4 h-4 text-red-600" />
                )}
                <span
                  className={cn(
                    'text-sm font-semibold',
                    view.kind === 'progress' && 'text-purple-800',
                    view.kind === 'completed' && 'text-green-800',
                    view.kind === 'failed' && 'text-red-800'
                  )}
                >
                  {view.kind === 'progress' && 'Generating Report...'}
                  {view.kind === 'completed' && 'Report Ready'}
                  {view.kind === 'failed' && 'Generation Failed'}
                </span>
              </div>
              {(view.kind === 'completed' || view.kind === 'failed') && (
                <button
                  onClick={handleDismiss}
                  className="p-1 rounded hover:bg-black/5 transition-colors"
                  aria-label="Dismiss"
                >
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              )}
            </div>

            {/* Body */}
            <div className="px-4 py-3">
              {/* Progress state */}
              {view.kind === 'progress' && (
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-gray-600">
                    <span>{view.phase}</span>
                    <span>{Math.round(view.progress)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                    <div
                      className="bg-purple-600 h-2.5 rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${view.progress}%` }}
                    />
                  </div>
                  {view.message && (
                    <p className="text-xs text-gray-500 truncate">{view.message}</p>
                  )}
                </div>
              )}

              {/* Completed state */}
              {view.kind === 'completed' && (
                <div className="space-y-3">
                  <div className="text-sm text-gray-600 space-y-1">
                    <p>
                      <span className="font-medium">File:</span> {view.fileName}
                    </p>
                    {view.fileSize && (
                      <p>
                        <span className="font-medium">Size:</span> {view.fileSize}
                      </p>
                    )}
                    {view.recordCount != null && (
                      <p>
                        <span className="font-medium">Records:</span>{' '}
                        {view.recordCount.toLocaleString()}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => handleDownload(view.downloadUrl, view.fileName)}
                    disabled={isDownloading}
                    className={cn(
                      'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-all',
                      'bg-green-600 text-white hover:bg-green-700',
                      'disabled:opacity-50 disabled:cursor-not-allowed',
                      'shadow-sm hover:shadow-md'
                    )}
                  >
                    {isDownloading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Downloading...
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4" />
                        Download Report
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Failed state */}
              {view.kind === 'failed' && (
                <div className="space-y-3">
                  <p className="text-sm text-red-600">{view.error}</p>
                  <button
                    onClick={handleDismiss}
                    className={cn(
                      'w-full px-4 py-2 rounded-lg font-medium text-sm transition-all',
                      'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                    )}
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────

function phaseLabel(phase: string): string {
  const labels: Record<string, string> = {
    queued: 'Queued',
    initializing: 'Initializing...',
    fetching_data: 'Fetching data...',
    streaming_data: 'Processing rows...',
    finalizing: 'Finalizing report...',
    uploading: 'Uploading to storage...',
    completed: 'Completed',
    failed: 'Failed',
  };
  return labels[phase] || phase;
}
