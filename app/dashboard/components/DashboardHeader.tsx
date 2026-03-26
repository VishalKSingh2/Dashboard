'use client';

import { useState, useEffect } from 'react';
import { DashboardFilters } from '@/lib/types';
import Select from '@/components/ui/Select';
import SearchableSelect from '@/components/ui/SearchableSelect';
import DatePicker from '@/components/ui/DatePicker';
import Button from '@/components/ui/Button';
import AdvancedDownloadButton from '@/components/ui/AdvancedDownloadButton';

interface DashboardHeaderProps {
  filters: DashboardFilters;
  onFiltersChange: (filters: DashboardFilters) => void;
  onApply: () => void;
}

export default function DashboardHeader({
  filters,
  onFiltersChange,
  onApply,
}: DashboardHeaderProps) {
  const [customerTypes, setCustomerTypes] = useState<Array<{id: string, name: string}>>([{id: 'all', name: 'All Customers'}]);
  const [mediaTypes, setMediaTypes] = useState<string[]>(['all']);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchFilters = async () => {
      try {
        const response = await fetch('/api/filters');
        if (response.ok) {
          const filterData = await response.json();
          setCustomerTypes(filterData.customers || [{id: 'all', name: 'All Customers'}]);
          setMediaTypes(filterData.mediaTypes || ['all']);
        }
      } catch (error) {
        console.error('Error fetching filters:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchFilters();
  }, []);

  const handleFilterChange = (key: keyof DashboardFilters, value: string) => {
    const updatedFilters = {
      ...filters,
      [key]: value,
    };

    if (key === 'startDate' && value > filters.endDate) {
      updatedFilters.endDate = value;
    }
    if (key === 'endDate' && value < filters.startDate) {
      updatedFilters.startDate = value;
    }

    onFiltersChange(updatedFilters);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-6 p-6">
      <div className="flex flex-wrap items-end gap-4">
        <SearchableSelect
          label="Customers"
          options={customerTypes}
          value={filters.customerType}
          onChange={(e) => handleFilterChange('customerType', e.target.value)}
          className="min-w-[220px]"
          maxVisible={5}
          placeholder="Search customers..."
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

        <div className="ml-auto">
          <AdvancedDownloadButton filters={filters} />
        </div>
      </div>
    </div>
  );
}
