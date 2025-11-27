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
}

export default function MediaHoursChart({ data, loading }: MediaHoursChartProps) {
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

  // Determine granularity for label formatting
  const granularity = data.length > 0 && data.length < 365
    ? getDisplayGranularity(data[0].date, data[data.length - 1].date)
    : 'daily';

  // Format data for display with readable labels
  const chartData = data.map(item => ({
    ...item,
    displayDate: formatDateLabel(item.date, granularity),
    fullDate: format(new Date(item.date), 'dd-MM-yyyy'),
  }));

  // Calculate dynamic Y-axis domain based on actual data
  const maxValue = Math.max(...data.map(d => d.hours), 0.1);
  
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
            dataKey="displayDate"
            tick={{ fill: '#6b7280', fontSize: 11 }}
            tickLine={{ stroke: '#e5e7eb' }}
            angle={-45}
            textAnchor="end"
            height={60}
            interval={data.length <= 15 ? 0 : data.length <= 30 ? 1 : Math.floor(data.length / 12)}
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
