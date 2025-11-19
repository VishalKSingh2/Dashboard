'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { DashboardData, DashboardFilters } from '@/lib/types';
import DashboardHeader from './components/DashboardHeader';
import MetricsGrid from './components/MetricsGrid';
import MediaUploadsChart from './components/MediaUploadsChart';
import MediaHoursChart from './components/MediaHoursChart';
import MediaTypeChart from './components/MediaTypeChart';
import TopChannelsChart from './components/TopChannelsChart';
import ActiveUsersTable from './components/ActiveUsersTable';

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

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        customerType: filters.customerType,
        mediaType: filters.mediaType,
        startDate: filters.startDate,
        endDate: filters.endDate,
      });

      const response = await fetch(`/api/dashboard?${params}`);
      
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
  };

  useEffect(() => {
    setFilters(getDefaultFilters());
  }, [searchParams]);

  useEffect(() => {
    fetchData();
  }, [filters]);

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
        />

        {data && (
          <>
            <MetricsGrid metrics={data.metrics} loading={loading} />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <MediaUploadsChart data={data.mediaUploads} loading={loading} />
              <MediaHoursChart data={data.mediaHours} loading={loading} />
              <MediaTypeChart data={data.mediaTypes} loading={loading} />
              <TopChannelsChart data={data.topChannels} loading={loading} />
            </div>

            <ActiveUsersTable data={data.activeUsers} loading={loading} />
          </>
        )}

        {loading && !data && (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500" />
          </div>
        )}
      </div>
    </div>
  );
}
