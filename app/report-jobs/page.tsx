'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  Download,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowLeft,
  FileSpreadsheet,
  Search,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { JobSSEEvent } from '@/lib/jobs';

// ─── Types ───────────────────────────────────────────────────────────

type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

interface JobItem {
  jobId: string;
  status: JobStatus;
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

type StatusFilter = 'all' | JobStatus;

// ─── Page Component ──────────────────────────────────────────────────

export default function ReportJobsPage() {
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<Record<string, boolean>>({});
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const sseRefs = useRef<Record<string, EventSource>>({});
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Fetch jobs ─────────────────────────────────────────────────

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/job-logs?list=true');
      if (!res.ok) return;
      const data = await res.json();
      if (!data.success || !data.jobs) return;

      setJobs((prev) => {
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
      // Ignore
    } finally {
      setLoading(false);
    }
  }, []);

  // ─── SSE for active jobs ────────────────────────────────────────

  const listenToJob = useCallback((jobId: string) => {
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
          // Auto-refresh job list to pick up new jobs / update counts
          fetchJobs();
        }
      } catch {
        // Ignore
      }
    };

    es.onerror = () => {
      // EventSource auto-reconnects
    };
  }, []);

  // ─── Lifecycle ──────────────────────────────────────────────────

  useEffect(() => {
    fetchJobs();
    pollRef.current = setInterval(fetchJobs, 10000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      Object.values(sseRefs.current).forEach((es) => es.close());
    };
  }, [fetchJobs]);

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

  // ─── Download ───────────────────────────────────────────────────

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

  // ─── Filtering ─────────────────────────────────────────────────

  const filteredJobs = jobs.filter((job) => {
    if (statusFilter !== 'all' && job.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        job.jobId.toLowerCase().includes(q) ||
        job.startDate.includes(q) ||
        job.endDate.includes(q) ||
        job.sheets.some((s) => s.toLowerCase().includes(q)) ||
        (job.fileName && job.fileName.toLowerCase().includes(q))
      );
    }
    return true;
  });

  // ─── Counts ─────────────────────────────────────────────────────

  const counts = {
    all: jobs.length,
    pending: jobs.filter((j) => j.status === 'pending').length,
    processing: jobs.filter((j) => j.status === 'processing').length,
    completed: jobs.filter((j) => j.status === 'completed').length,
    failed: jobs.filter((j) => j.status === 'failed').length,
  };

  // ─── Render ─────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 relative z-0">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Page Title */}
        <div className="flex items-center gap-2 mb-6">
          <FileSpreadsheet className="w-5 h-5 text-purple-600" />
          <h1 className="text-lg font-semibold text-gray-900">Report Jobs</h1>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <StatCard
            label="Total Jobs"
            value={counts.all}
            color="gray"
          />
          <StatCard
            label="Active"
            value={counts.pending + counts.processing}
            color="purple"
            pulse={counts.pending + counts.processing > 0}
          />
          <StatCard
            label="Completed"
            value={counts.completed}
            color="green"
          />
          <StatCard
            label="Failed"
            value={counts.failed}
            color="red"
          />
        </div>

        {/* Filters Bar */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6">
          <div className="p-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center">
            {/* Search */}
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by job ID, date range, sheet name, or file name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                >
                  <XCircle className="w-4 h-4 text-gray-400 hover:text-gray-600" />
                </button>
              )}
            </div>

            {/* Status Tabs */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              {(['all', 'processing', 'completed', 'failed'] as StatusFilter[]).map(
                (status) => (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    className={cn(
                      'px-3 py-1.5 text-xs font-medium rounded-md transition-all',
                      statusFilter === status
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700',
                    )}
                  >
                    {status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
                    {counts[status] > 0 && (
                      <span className="ml-1.5 text-[10px] text-gray-400">
                        ({counts[status]})
                      </span>
                    )}
                  </button>
                ),
              )}
            </div>
          </div>
        </div>

        {/* Jobs Table / List */}
        {loading && jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-purple-500 animate-spin mb-4" />
            <p className="text-sm text-gray-500">Loading report jobs...</p>
          </div>
        ) : filteredJobs.length === 0 ? (
          <EmptyState hasJobs={jobs.length > 0} />
        ) : (
          <div className="space-y-3">
            {filteredJobs.map((job) => (
              <JobCard
                key={job.jobId}
                job={job}
                expanded={expandedJob === job.jobId}
                onToggle={() =>
                  setExpandedJob((prev) => (prev === job.jobId ? null : job.jobId))
                }
                downloading={downloading[job.jobId] || false}
                onDownload={() => handleDownload(job)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────

function StatCard({
  label,
  value,
  color,
  pulse,
}: {
  label: string;
  value: number;
  color: 'gray' | 'purple' | 'green' | 'red';
  pulse?: boolean;
}) {
  const colorMap = {
    gray: 'bg-gray-50 border-gray-200 text-gray-700',
    purple: 'bg-purple-50 border-purple-200 text-purple-700',
    green: 'bg-green-50 border-green-200 text-green-700',
    red: 'bg-red-50 border-red-200 text-red-700',
  };
  const dotColor = {
    gray: 'bg-gray-400',
    purple: 'bg-purple-500',
    green: 'bg-green-500',
    red: 'bg-red-500',
  };

  return (
    <div className={cn('rounded-xl border p-4', colorMap[color])}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium uppercase tracking-wider opacity-70">
          {label}
        </span>
        {pulse && (
          <span className="relative flex h-2.5 w-2.5">
            <span
              className={cn(
                'animate-ping absolute inline-flex h-full w-full rounded-full opacity-75',
                dotColor[color],
              )}
            />
            <span
              className={cn(
                'relative inline-flex rounded-full h-2.5 w-2.5',
                dotColor[color],
              )}
            />
          </span>
        )}
      </div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

function JobCard({
  job,
  expanded,
  onToggle,
  downloading,
  onDownload,
}: {
  job: JobItem;
  expanded: boolean;
  onToggle: () => void;
  downloading: boolean;
  onDownload: () => void;
}) {
  const isActive = job.status === 'pending' || job.status === 'processing';

  return (
    <div
      className={cn(
        'bg-white rounded-xl border shadow-sm transition-all',
        isActive && 'border-purple-200 ring-1 ring-purple-100',
        job.status === 'completed' && 'border-gray-200',
        job.status === 'failed' && 'border-red-200',
      )}
    >
      {/* Main Row */}
      <div
        className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-gray-50/50 transition-colors rounded-xl"
        onClick={onToggle}
      >
        {/* Status Icon */}
        <div className="flex-shrink-0">
          <StatusIcon status={job.status} />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-semibold text-gray-900">
              {job.startDate} → {job.endDate}
            </span>
            <StatusBadge status={job.status} />
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className="font-mono">{job.jobId.slice(0, 8)}...</span>
            <span>·</span>
            <span>{formatDateTime(job.createdAt)}</span>
            {job.sheets.length > 0 && (
              <>
                <span>·</span>
                <span>{job.sheets.length} sheet{job.sheets.length > 1 ? 's' : ''}</span>
              </>
            )}
          </div>
        </div>

        {/* Progress / Actions */}
        <div className="flex items-center gap-3 flex-shrink-0">
          {isActive && (
            <div className="flex items-center gap-2 min-w-[120px]">
              <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-purple-500 h-2 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${job.progress}%` }}
                />
              </div>
              <span className="text-xs font-medium text-purple-600 w-10 text-right">
                {Math.round(job.progress)}%
              </span>
            </div>
          )}

          {job.status === 'completed' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDownload();
              }}
              disabled={downloading}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                'bg-green-600 text-white hover:bg-green-700 shadow-sm',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              {downloading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              Download
            </button>
          )}
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="border-t border-gray-100 px-5 py-4 bg-gray-50/50 rounded-b-xl">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <DetailItem label="Job ID" value={job.jobId} mono />
            <DetailItem label="Status" value={job.status.toUpperCase()} />
            <DetailItem label="Phase" value={phaseLabel(job.phase)} />
            <DetailItem label="Date Range" value={`${job.startDate} → ${job.endDate}`} />
            <DetailItem label="Created" value={formatDateTime(job.createdAt)} />
            {job.completedAt && (
              <DetailItem label="Completed" value={formatDateTime(job.completedAt)} />
            )}
            {job.fileName && <DetailItem label="File" value={job.fileName} />}
            {job.fileSize && <DetailItem label="Size" value={job.fileSize} />}
            {job.recordCount != null && (
              <DetailItem label="Records" value={job.recordCount.toLocaleString()} />
            )}
          </div>

          {/* Sheets */}
          {job.sheets.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-medium text-gray-500 mb-2">Sheets</p>
              <div className="flex flex-wrap gap-1.5">
                {job.sheets.map((s) => (
                  <span
                    key={s}
                    className="text-xs px-2 py-1 bg-white border border-gray-200 text-gray-600 rounded-md"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Progress details for active jobs */}
          {isActive && (
            <div className="mt-4 p-3 bg-purple-50 rounded-lg border border-purple-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-purple-700">
                  {phaseLabel(job.phase)}
                </span>
                <span className="text-xs font-bold text-purple-600">
                  {Math.round(job.progress)}%
                </span>
              </div>
              <div className="w-full bg-purple-200 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-purple-500 h-2 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${job.progress}%` }}
                />
              </div>
              {job.message && (
                <p className="text-xs text-purple-600 mt-2">{job.message}</p>
              )}
            </div>
          )}

          {/* Error for failed jobs */}
          {job.status === 'failed' && job.errorMessage && (
            <div className="mt-4 p-3 bg-red-50 rounded-lg border border-red-100">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-red-600">{job.errorMessage}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: JobStatus }) {
  switch (status) {
    case 'pending':
      return (
        <div className="w-9 h-9 rounded-full bg-purple-100 flex items-center justify-center">
          <Clock className="w-4.5 h-4.5 text-purple-500" />
        </div>
      );
    case 'processing':
      return (
        <div className="w-9 h-9 rounded-full bg-purple-100 flex items-center justify-center">
          <Loader2 className="w-4.5 h-4.5 text-purple-500 animate-spin" />
        </div>
      );
    case 'completed':
      return (
        <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center">
          <CheckCircle2 className="w-4.5 h-4.5 text-green-500" />
        </div>
      );
    case 'failed':
      return (
        <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center">
          <AlertCircle className="w-4.5 h-4.5 text-red-500" />
        </div>
      );
  }
}

function StatusBadge({ status }: { status: JobStatus }) {
  const styles = {
    pending: 'bg-purple-100 text-purple-700',
    processing: 'bg-purple-100 text-purple-700',
    completed: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700',
  };

  return (
    <span
      className={cn(
        'text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded',
        styles[status],
      )}
    >
      {status}
    </span>
  );
}

function DetailItem({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-0.5">
        {label}
      </p>
      <p
        className={cn(
          'text-sm text-gray-800',
          mono && 'font-mono text-xs break-all',
        )}
      >
        {value}
      </p>
    </div>
  );
}

function EmptyState({ hasJobs }: { hasJobs: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
        <FileSpreadsheet className="w-8 h-8 text-gray-400" />
      </div>
      <h3 className="text-lg font-semibold text-gray-700 mb-1">
        {hasJobs ? 'No matching jobs' : 'No report jobs yet'}
      </h3>
      <p className="text-sm text-gray-500 max-w-sm">
        {hasJobs
          ? 'Try adjusting your search or filter criteria.'
          : 'When you generate reports from the dashboard, they will appear here.'}
      </p>
      {!hasJobs && (
        <Link
          href="/dashboard"
          className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Go to Dashboard
        </Link>
      )}
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

function formatDateTime(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}
