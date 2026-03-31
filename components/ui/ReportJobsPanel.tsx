'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  Download,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { JobSSEEvent } from '@/lib/jobs';

interface JobItem {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  phase: string;
  progress: number;
  sheets: string[];
  startDate: string;
  endDate: string;
  createdAt: string;
  completedAt?: string;
  fileName?: string;
  fileSize?: string;
  recordCount?: number;
  downloadUrl?: string;
  errorMessage?: string;
  message?: string;
}

export default function ReportJobsPanel() {
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [expanded, setExpanded] = useState(true);
  const [downloading, setDownloading] = useState<Record<string, boolean>>({});
  const sseRefs = useRef<Record<string, EventSource>>({});
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Fetch existing jobs from DB ────────────────────────────────

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/job-logs?list=true');
      if (!res.ok) return;
      const data = await res.json();
      if (!data.success || !data.jobs) return;

      setJobs((prev) => {
        // Merge server state, but keep local SSE updates for active jobs
        const activeIds = new Set(
          prev.filter((j) => j.status === 'processing').map((j) => j.jobId),
        );
        const merged = data.jobs.map((serverJob: any) => {
          if (activeIds.has(serverJob.jobId)) {
            const local = prev.find((j) => j.jobId === serverJob.jobId);
            if (local && local.progress > serverJob.progress) return local;
          }
          return {
            jobId: serverJob.jobId,
            status: serverJob.status,
            phase: serverJob.phase,
            progress: serverJob.progress,
            sheets: serverJob.sheets || [],
            startDate: serverJob.startDate,
            endDate: serverJob.endDate,
            createdAt: serverJob.createdAt,
            completedAt: serverJob.completedAt,
            fileName: serverJob.fileName,
            fileSize: serverJob.fileSize,
            recordCount: serverJob.recordCount,
            downloadUrl: serverJob.downloadUrl,
            errorMessage: serverJob.errorMessage,
          } as JobItem;
        });
        return merged;
      });
    } catch {
      // Ignore fetch errors silently
    }
  }, []);

  // ─── SSE for active jobs ────────────────────────────────────────

  const listenToJob = useCallback((jobId: string) => {
    // Don't duplicate connections
    if (sseRefs.current[jobId]) return;

    const es = new EventSource(`/api/job-status/${jobId}`);
    sseRefs.current[jobId] = es;

    es.onmessage = (event) => {
      try {
        const data: JobSSEEvent = JSON.parse(event.data);

        setJobs((prev) =>
          prev.map((j) =>
            j.jobId === data.jobId
              ? {
                  ...j,
                  status: data.status,
                  phase: data.phase,
                  progress: data.progress,
                  downloadUrl: data.downloadUrl || j.downloadUrl,
                  fileName: data.fileName || j.fileName,
                  fileSize: data.fileSize || j.fileSize,
                  recordCount: data.recordCount ?? j.recordCount,
                  errorMessage: data.errorMessage || j.errorMessage,
                  message: data.progressDetails?.message,
                }
              : j,
          ),
        );

        if (data.status === 'completed' || data.status === 'failed') {
          es.close();
          delete sseRefs.current[jobId];
        }
      } catch {
        // Ignore parse errors
      }
    };

    es.onerror = () => {
      // Auto-reconnect is built-in to EventSource
    };
  }, []);

  // ─── Initial load + polling ─────────────────────────────────────

  useEffect(() => {
    fetchJobs();

    // Poll every 30s to pick up new jobs / refresh stale state
    pollRef.current = setInterval(fetchJobs, 30000);

    // Listen for instant job creation events from AdvancedDownloadButton
    const handleJobCreated = () => {
      fetchJobs();
    };
    window.addEventListener('job-created', handleJobCreated);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      Object.values(sseRefs.current).forEach((es) => es.close());
      window.removeEventListener('job-created', handleJobCreated);
    };
  }, [fetchJobs]);

  // Attach SSE listeners when we discover active (pending/processing) jobs
  useEffect(() => {
    jobs.forEach((job) => {
      if (
        (job.status === 'pending' || job.status === 'processing') &&
        !sseRefs.current[job.jobId]
      ) {
        listenToJob(job.jobId);
      }
    });
  }, [jobs, listenToJob]);

  // ─── Download handler ───────────────────────────────────────────

  const handleDownload = async (job: JobItem) => {
    if (!job.downloadUrl) return;
    setDownloading((prev) => ({ ...prev, [job.jobId]: true }));
    try {
      const res = await fetch(job.downloadUrl);
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = job.fileName || 'Report.zip';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch {
      alert('Failed to download the report. Please try again.');
    } finally {
      setDownloading((prev) => ({ ...prev, [job.jobId]: false }));
    }
  };

  // ─── Helpers ────────────────────────────────────────────────────

  const activeJobs = jobs.filter(
    (j) => j.status === 'pending' || j.status === 'processing',
  );
  const hasActiveJobs = activeJobs.length > 0;

  // Don't render if there are no jobs at all
  if (jobs.length === 0) return null;

  const recentJobs = jobs.slice(0, 10); // Show last 10

  return (
    <div className="fixed bottom-6 right-6 z-50 w-[420px] animate-in slide-in-from-bottom-4 duration-300">
      <div className="bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden">
        {/* ── Header ── */}
        <button
          onClick={() => setExpanded((e) => !e)}
          className={cn(
            'w-full flex items-center justify-between px-4 py-3 transition-colors',
            hasActiveJobs ? 'bg-purple-50' : 'bg-gray-50',
          )}
        >
          <div className="flex items-center gap-2">
            <ClipboardList
              className={cn(
                'w-4 h-4',
                hasActiveJobs ? 'text-purple-600' : 'text-gray-500',
              )}
            />
            <span
              className={cn(
                'text-sm font-semibold',
                hasActiveJobs ? 'text-purple-800' : 'text-gray-700',
              )}
            >
              Report Jobs
              {hasActiveJobs && (
                <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold bg-purple-600 text-white rounded-full">
                  {activeJobs.length}
                </span>
              )}
            </span>
          </div>
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          )}
        </button>

        {/* View All link */}
        {expanded && (
          <Link
            href="/report-jobs"
            className="flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium text-purple-600 hover:text-purple-800 hover:bg-purple-50 transition-colors border-b border-gray-100"
          >
            View all jobs
            <ExternalLink className="w-3 h-3" />
          </Link>
        )}

        {/* ── Job List ── */}
        {expanded && (
          <div className="max-h-80 overflow-y-auto divide-y divide-gray-100">
            {recentJobs.map((job) => (
              <div key={job.jobId} className="px-4 py-3">
                {/* Top line: status + date range */}
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    {(job.status === 'pending' || job.status === 'processing') && (
                      <Loader2 className="w-3.5 h-3.5 text-purple-500 animate-spin" />
                    )}
                    {job.status === 'completed' && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                    )}
                    {job.status === 'failed' && (
                      <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                    )}
                    <span className="text-xs font-medium text-gray-700">
                      {job.startDate} → {job.endDate}
                    </span>
                  </div>
                </div>

                {/* Sheets */}
                <div className="flex gap-1 mb-1.5 flex-wrap">
                  {job.sheets.map((s) => (
                    <span
                      key={s}
                      className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded"
                    >
                      {s}
                    </span>
                  ))}
                </div>

                {/* Progress bar for active jobs */}
                {(job.status === 'pending' || job.status === 'processing') && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] text-gray-500">
                      <span>{phaseLabel(job.phase)}</span>
                      <span>{Math.round(job.progress)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-purple-500 h-1.5 rounded-full transition-all duration-500 ease-out"
                        style={{ width: `${job.progress}%` }}
                      />
                    </div>
                    {job.message && (
                      <p className="text-[10px] text-gray-400 truncate">{job.message}</p>
                    )}
                  </div>
                )}

                {/* Completed: file info + download */}
                {job.status === 'completed' && (
                  <div className="flex items-center justify-between">
                    <div className="text-[11px] text-gray-500">
                      {job.fileSize && <span>{job.fileSize}</span>}
                      {job.recordCount != null && (
                        <span className="ml-2">
                          {job.recordCount.toLocaleString()} records
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => handleDownload(job)}
                      disabled={downloading[job.jobId]}
                      className={cn(
                        'flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all',
                        'bg-green-600 text-white hover:bg-green-700',
                        'disabled:opacity-50 disabled:cursor-not-allowed',
                      )}
                    >
                      {downloading[job.jobId] ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Download className="w-3 h-3" />
                      )}
                      Download
                    </button>
                  </div>
                )}

                {/* Failed: error */}
                {job.status === 'failed' && (
                  <p className="text-[11px] text-red-500 truncate">
                    {job.errorMessage || 'Unknown error'}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────

function phaseLabel(phase: string): string {
  const labels: Record<string, string> = {
    queued: 'Queued',
    initializing: 'Initializing...',
    fetching_data: 'Fetching data...',
    streaming_data: 'Processing rows...',
    finalizing: 'Finalizing...',
    uploading: 'Uploading...',
    completed: 'Completed',
    failed: 'Failed',
  };
  return labels[phase] || phase;
}


