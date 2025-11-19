'use client';

import { MediaUploadData } from '@/lib/types';
import { formatDateLabel, getDisplayGranularity } from '@/lib/dataAggregation';
import { format } from 'date-fns';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface MediaUploadsChartProps {
  data: MediaUploadData[];
  loading?: boolean;
}

export default function MediaUploadsChart({ data, loading }: MediaUploadsChartProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="font-semibold text-lg text-gray-700 mb-4">Media Uploads Over Time</h3>
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

  // Calculate dynamic Y-axis domain
  const maxValue = Math.max(...data.map(d => Math.max(d.video, d.showreel)));
  const yAxisMax = Math.ceil(maxValue * 1.2 / 100) * 100;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h3 className="font-semibold text-lg text-gray-700 mb-4">Media Uploads Over Time</h3>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={chartData}>
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
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '8px 12px',
            }}
            labelFormatter={(value, payload) => {
              if (payload && payload[0]) {
                return payload[0].payload.fullDate;
              }
              return value;
            }}
          />
          <Legend
            wrapperStyle={{ paddingTop: '20px' }}
            iconType="line"
          />
          <Line
            type="monotone"
            dataKey="video"
            stroke="#3b82f6"
            strokeWidth={2}
            name="Video"
            dot={data.length <= 30 ? { fill: '#3b82f6', r: 4 } : false}
            activeDot={{ r: 6 }}
          />
          <Line
            type="monotone"
            dataKey="showreel"
            stroke="#8b5cf6"
            strokeWidth={2}
            name="Showreel"
            dot={data.length <= 30 ? { fill: '#8b5cf6', r: 4 } : false}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
