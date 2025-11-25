'use client';

import { DashboardData, DashboardFilters } from '@/lib/types';
import Select from '@/components/ui/Select';
import DatePicker from '@/components/ui/DatePicker';
import Button from '@/components/ui/Button';
import DownloadButton from '@/components/ui/DownloadButton';
import { getCustomerTypes, getMediaTypes } from '@/lib/mockData';

interface DashboardHeaderProps {
  filters: DashboardFilters;
  onFiltersChange: (filters: DashboardFilters) => void;
  onApply: () => void;
  data? :DashboardData;
}

export default function DashboardHeader({
  filters,
  onFiltersChange,
  onApply,
  data,
}: DashboardHeaderProps) {
  const customerTypes = getCustomerTypes();
  const mediaTypes = getMediaTypes();

  const handleFilterChange = (key: keyof DashboardFilters, value: string) => {
    const updatedFilters = {
      ...filters,
      [key]: value,
    };

    // Validate date range: if start date is after end date, adjust end date
    if (key === 'startDate' && value > filters.endDate) {
      updatedFilters.endDate = value;
    }
    // If end date is before start date, adjust start date
    if (key === 'endDate' && value < filters.startDate) {
      updatedFilters.startDate = value;
    }

    onFiltersChange(updatedFilters);
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
      <div className="mb-6">
        <h1 className="font-bold text-2xl text-gray-900">
          Report Analytics Dashboard
        </h1>
        <p className="text-gray-600 mt-1">
          Visual insights for Account and Product Management teams
        </p>
      </div>

      <div className="flex flex-wrap gap-4 items-end">
        <Select
          label="Customers"
          options={customerTypes}
          value={filters.customerType}
          onChange={(e) => handleFilterChange('customerType', e.target.value)}
          className="min-w-[180px]"
        />

        <Select
          label="Media Types"
          options={mediaTypes}
          value={filters.mediaType}
          onChange={(e) => handleFilterChange('mediaType', e.target.value)}
          className="min-w-[180px]"
        />

        <DatePicker
          label="Start Date"
          value={filters.startDate}
          onChange={(e) => handleFilterChange('startDate', e.target.value)}
          max={filters.endDate}
          className="min-w-[160px]"
        />

        <DatePicker
          label="End Date"
          value={filters.endDate}
          onChange={(e) => handleFilterChange('endDate', e.target.value)}
          min={filters.startDate}
          className="min-w-[160px]"
        />

        <Button onClick={onApply} variant="primary">
          Apply
        </Button>
        {data && (
          <DownloadButton data={data} filters={filters}/>
        )}
      </div>
    </div>
  );
}
