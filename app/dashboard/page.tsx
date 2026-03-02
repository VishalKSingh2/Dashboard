'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { DashboardData, DashboardFilters } from '@/lib/types';
import DashboardHeader from './components/DashboardHeader';
import MetricsGrid from './components/MetricsGrid';
import ReportJobsPanel from '@/components/ui/ReportJobsPanel';
import LazyChart from '@/components/ui/LazyChart';
// Dynamic imports for better code splitting
import {
  MediaUploadsChart,
  MediaHoursChart,
  MediaTypeChart,
  TopChannelsChart,
} from '@/components/ui/DynamicCharts';

export default function DashboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const getDefaultFilters = () => ({
    customerType: searchParams.get('customerType') || 'all',
    mediaType: searchParams.get('mediaType') || 'all',
    startDate: searchParams.get('startDate') || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    endDate: searchParams.get('endDate') || new Date().toISOString().split('T')[0],
  });

  const [filters, setFilters] = useState<DashboardFilters>(getDefaultFilters());
  
  // Applied filters from URL (used for data fetching and chart rendering)
  const appliedFilters = getDefaultFilters();

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const newFilters = getDefaultFilters();
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        customerType: newFilters.customerType,
        mediaType: newFilters.mediaType,
        startDate: newFilters.startDate,
        endDate: newFilters.endDate,
      });

      const response = await fetch(`/api/dashboard-db?${params}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch dashboard data');
      }

      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [searchParams]);

  useEffect(() => {
    const newFilters = getDefaultFilters();
    setFilters(newFilters);
    fetchData();
  }, [searchParams, fetchData]);

  const handleApply = () => {
    const params = new URLSearchParams({
      customerType: filters.customerType,
      mediaType: filters.mediaType,
      startDate: filters.startDate,
      endDate: filters.endDate,
    });
    router.push(`/dashboard?${params}`);
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 max-w-md">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Error</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={fetchData}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <DashboardHeader
          filters={filters}
          onFiltersChange={setFilters}
          onApply={handleApply}
          data = {data || undefined}
        />

        {data && (
          <>
            <MetricsGrid metrics={data.metrics} loading={loading} />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <LazyChart>
                <MediaUploadsChart 
                  key={`uploads-${appliedFilters.startDate}-${appliedFilters.endDate}`} 
                  data={data.mediaUploads} 
                  loading={loading} 
                  startDate={appliedFilters.startDate} 
                  endDate={appliedFilters.endDate}
                />
              </LazyChart>
              
              <LazyChart>
                <MediaHoursChart 
                  key={`hours-${appliedFilters.startDate}-${appliedFilters.endDate}`} 
                  data={data.mediaHours} 
                  loading={loading} 
                  startDate={appliedFilters.startDate} 
                  endDate={appliedFilters.endDate}
                />
              </LazyChart>
              
              <LazyChart>
                <MediaTypeChart data={data.mediaTypes} loading={loading} />
              </LazyChart>
              
              <LazyChart>
                <TopChannelsChart data={data.topChannels} loading={loading} />
              </LazyChart>
            </div>
          </>
        )}

        {loading && !data && (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500" />
          </div>
        )}
      </div>

      {/* Persistent jobs panel — survives page reloads */}
      <ReportJobsPanel />
    </div>
  );
}
