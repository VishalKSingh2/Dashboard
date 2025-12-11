'use client';

import { format, subDays, subMonths, startOfWeek, startOfMonth } from 'date-fns';

interface TimeRangeOption {
  label: string;
  value: string;
  getDates: () => { startDate: string; endDate: string };
}

interface TimeRangeSelectorProps {
  onRangeSelect: (startDate: string, endDate: string) => void;
  currentStartDate?: string;
  currentEndDate?: string;
}

const TIME_RANGES: TimeRangeOption[] = [
  {
    label: 'Last 7 Days',
    value: '7d',
    getDates: () => ({
      startDate: format(subDays(new Date(), 7), 'yyyy-MM-dd'),
      endDate: format(new Date(), 'yyyy-MM-dd'),
    }),
  },
  {
    label: 'Last 30 Days',
    value: '30d',
    getDates: () => ({
      startDate: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
      endDate: format(new Date(), 'yyyy-MM-dd'),
    }),
  },
  {
    label: 'Last 3 Months',
    value: '3m',
    getDates: () => ({
      startDate: format(subMonths(new Date(), 3), 'yyyy-MM-dd'),
      endDate: format(new Date(), 'yyyy-MM-dd'),
    }),
  },
  {
    label: 'Last 6 Months',
    value: '6m',
    getDates: () => ({
      startDate: format(subMonths(new Date(), 6), 'yyyy-MM-dd'),
      endDate: format(new Date(), 'yyyy-MM-dd'),
    }),
  },
  {
    label: 'Last 12 Months',
    value: '12m',
    getDates: () => ({
      startDate: format(subMonths(new Date(), 12), 'yyyy-MM-dd'),
      endDate: format(new Date(), 'yyyy-MM-dd'),
    }),
  },
  {
    label: 'This Month',
    value: 'this-month',
    getDates: () => ({
      startDate: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
      endDate: format(new Date(), 'yyyy-MM-dd'),
    }),
  },
];

export default function TimeRangeSelector({ onRangeSelect, currentStartDate, currentEndDate }: TimeRangeSelectorProps) {
  const handleRangeClick = (option: TimeRangeOption) => {
    const { startDate, endDate } = option.getDates();
    onRangeSelect(startDate, endDate);
  };

  const isActive = (option: TimeRangeOption) => {
    if (!currentStartDate || !currentEndDate) return false;
    const { startDate, endDate } = option.getDates();
    return startDate === currentStartDate && endDate === currentEndDate;
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
      <h4 className="text-sm font-medium text-gray-700 mb-3">Quick Time Ranges</h4>
      <div className="flex flex-wrap gap-2">
        {TIME_RANGES.map((option) => (
          <button
            key={option.value}
            onClick={() => handleRangeClick(option)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              isActive(option)
                ? 'bg-blue-500 text-white shadow-sm'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      <div className="mt-3 text-xs text-gray-500">
        <span className="font-medium">Auto-granularity:</span>
        {' '}≤30 days = Daily · 31-365 days = Weekly · &gt;365 days = Monthly
      </div>
    </div>
  );
}
