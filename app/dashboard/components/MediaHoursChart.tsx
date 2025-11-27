'use client';

import { MediaHoursData } from '@/lib/types';
import { formatDateLabel, getDisplayGranularity } from '@/lib/dataAggregation';
import { format } from 'date-fns';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface MediaHoursChartProps {
  data: MediaHoursData[];
  loading?: boolean;
  startDate?: string;
  endDate?: string;
}

export default function MediaHoursChart({ data, loading, startDate, endDate }: MediaHoursChartProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="font-semibold text-lg text-gray-700 mb-4">Media Hours by Date</h3>
        <div className="h-80 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
        </div>
      </div>
    );
  }

  // Fill in missing dates with 0 hours for complete date range
  const fillMissingDates = (data: MediaHoursData[]): MediaHoursData[] => {
    if (data.length === 0 && !startDate) return [];
    
    const filled: MediaHoursData[] = [];
    const dataMap = new Map(data.map(d => [d.date, d.hours]));
    
    // Use provided date range or fall back to data's date range
    const start = startDate ? new Date(startDate) : new Date(data[0]?.date);
    const end = endDate ? new Date(endDate) : new Date(data[data.length - 1]?.date);
    
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = format(d, 'yyyy-MM-dd');
      filled.push({
        date: dateStr,
        hours: dataMap.get(dateStr) || 0,
      });
    }
    
    return filled;
  };

  const completeData = fillMissingDates(data);

  // Calculate date range in days
  const daysDiff = completeData.length > 0 
    ? Math.floor((new Date(completeData[completeData.length - 1].date).getTime() - new Date(completeData[0].date).getTime()) / (1000 * 60 * 60 * 24)) + 1
    : 0;

  // Determine aggregation strategy based on date range
  const getAggregationType = () => {
    if (daysDiff <= 15) return 'daily';
    if (daysDiff <= 31) return 'weekly';
    if (daysDiff <= 365) return 'monthly';
    return 'quarterly';
  };

  const aggregationType = getAggregationType();

  // Aggregate data based on type
  const aggregateData = () => {
    if (completeData.length === 0) return [];

    const grouped = new Map<string, { hours: number; dates: string[] }>();
    const startDate = new Date(completeData[0].date);
    const endDate = new Date(completeData[completeData.length - 1].date);

    // First, add all data points to grouped
    completeData.forEach(item => {
      const date = new Date(item.date);
      let key: string;

      if (aggregationType === 'daily') {
        key = item.date;
      } else if (aggregationType === 'weekly') {
        const weekNum = Math.ceil(date.getDate() / 7);
        key = `${format(date, 'yyyy-MM')}-W${weekNum}`;
      } else if (aggregationType === 'monthly') {
        key = format(date, 'yyyy-MM');
      } else {
        // Quarterly
        const quarter = Math.floor(date.getMonth() / 3);
        const year = date.getFullYear();
        key = `${year}-Q${quarter}`;
      }

      const existing = grouped.get(key) || { hours: 0, dates: [] };
      grouped.set(key, {
        hours: existing.hours + (item.hours || 0),
        dates: [...existing.dates, item.date],
      });
    });

    // For weekly aggregation, fill in missing weeks
    if (aggregationType === 'weekly') {
      const month = format(startDate, 'yyyy-MM');
      const totalWeeks = Math.ceil(new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0).getDate() / 7);
      
      for (let week = 1; week <= totalWeeks; week++) {
        const key = `${month}-W${week}`;
        if (!grouped.has(key)) {
          // Add empty week
          const weekStartDay = (week - 1) * 7 + 1;
          const weekDate = new Date(startDate.getFullYear(), startDate.getMonth(), weekStartDay);
          grouped.set(key, {
            hours: 0,
            dates: [format(weekDate, 'yyyy-MM-dd')],
          });
        }
      }
    }

    return Array.from(grouped.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, value]) => {
        let label: string;
        
        if (aggregationType === 'quarterly') {
          const [year, quarter] = key.split('-Q');
          const quarterMonths = ['Jan-Mar', 'Apr-Jun', 'Jul-Sep', 'Oct-Dec'];
          label = `${quarterMonths[parseInt(quarter)]} ${year.slice(-2)}`;
        } else if (aggregationType === 'monthly') {
          label = format(new Date(value.dates[0]), 'MMM');
        } else if (aggregationType === 'weekly') {
          const weekNum = Math.ceil(new Date(value.dates[0]).getDate() / 7);
          label = `Week ${weekNum}`;
        } else {
          label = format(new Date(value.dates[0]), 'MMM d');
        }
        
        return {
          displayDate: value.dates[0],
          label,
          hours: Math.round(value.hours * 100) / 100,
          fullDate: value.dates.length > 1 
            ? `${format(new Date(value.dates[0]), 'dd-MM-yyyy')} to ${format(new Date(value.dates[value.dates.length - 1]), 'dd-MM-yyyy')}`
            : format(new Date(value.dates[0]), 'dd-MM-yyyy'),
        };
      });
  };

  const chartData = aggregateData();

  // Calculate dynamic Y-axis domain based on actual data
  const maxValue = Math.max(...completeData.map(d => d.hours), 0.1);
  
  // Determine appropriate scale based on max value
  let yAxisMax: number;
  let yAxisTicks: number[];
  
  if (maxValue <= 1) {
    yAxisMax = 1;
    yAxisTicks = [0, 0.2, 0.4, 0.6, 0.8, 1.0];
  } else if (maxValue <= 5) {
    yAxisMax = 5;
    yAxisTicks = [0, 1, 2, 3, 4, 5];
  } else if (maxValue <= 10) {
    yAxisMax = 10;
    yAxisTicks = [0, 2, 4, 6, 8, 10];
  } else {
    yAxisMax = Math.ceil(maxValue * 1.2 / 10) * 10;
    const step = yAxisMax / 5;
    yAxisTicks = Array.from({ length: 6 }, (_, i) => i * step);
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h3 className="font-semibold text-lg text-gray-700 mb-4">Media Hours by Date</h3>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="label"
            tick={{ fill: '#6b7280', fontSize: 11 }}
            tickLine={{ stroke: '#e5e7eb' }}
            angle={-45}
            textAnchor="end"
            height={60}
            interval={0}
          />
          <YAxis
            tick={{ fill: '#6b7280', fontSize: 12 }}
            tickLine={{ stroke: '#e5e7eb' }}
            domain={[0, yAxisMax]}
            ticks={yAxisTicks}
            tickFormatter={(value) => value.toFixed(1)}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '8px 12px',
            }}
            cursor={{ fill: 'rgba(59, 130, 246, 0.1)' }}
            labelFormatter={(value, payload) => {
              if (payload && payload[0]) {
                return payload[0].payload.fullDate;
              }
              return value;
            }}
            formatter={(value: any) => {
              const numValue = Number(value);
              return [numValue.toFixed(2) + ' hrs', 'Hours'];
            }}
          />
          <Bar
            dataKey="hours"
            fill="#06b6d4"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
