'use client';

import { memo } from 'react';
import { MediaUploadData } from '@/lib/types';
import { formatDateLabel, getDisplayGranularity } from '@/lib/utils';
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
  startDate?: string;
  endDate?: string;
}

function MediaUploadsChart({ data, loading, startDate, endDate }: MediaUploadsChartProps) {
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

  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="font-semibold text-lg text-gray-700 mb-4">Media Uploads Over Time</h3>
        <div className="h-80 flex flex-col items-center justify-center text-gray-400">
          <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>
          <p className="text-sm font-medium">No data available</p>
          <p className="text-xs mt-1">Try adjusting your date range or filters</p>
        </div>
      </div>
    );
  }

  // Fill in missing dates with 0 uploads for complete date range
  const fillMissingDates = (data: MediaUploadData[]): MediaUploadData[] => {
    if (data.length === 0 && !startDate) return [];

    const filled: MediaUploadData[] = [];
    const dataMap = new Map(data.map(d => [d.date, { video: d.video, showreel: d.showreel, audio: d.audio }]));
    
    // Use provided date range or fall back to data's date range
    const start = startDate ? new Date(startDate) : new Date(data[0]?.date);
    const end = endDate ? new Date(endDate) : new Date(data[data.length - 1]?.date);
    
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = format(d, 'yyyy-MM-dd');
      const existing = dataMap.get(dateStr);
      filled.push({
        date: dateStr,
        video: existing?.video || 0,
        showreel: existing?.showreel || 0,
        audio: existing?.audio || 0,
      });
    }
    
    return filled;
  };

  const completeData = fillMissingDates(data);

  // Determine granularity for label formatting
  const granularity = completeData.length > 0 && completeData.length < 365
    ? getDisplayGranularity(completeData[0].date, completeData[completeData.length - 1].date)
    : 'daily';

  // Format data for display with readable labels
  const chartData = completeData.map(item => ({
    ...item,
    displayDate: formatDateLabel(item.date, granularity),
    fullDate: format(new Date(item.date), 'dd-MM-yyyy'),
  }));

  // Calculate dynamic Y-axis domain
  const maxValue = Math.max(...completeData.map(d => Math.max(d.video, d.showreel, d.audio || 0)), 1);
  
  // Determine appropriate scale
  let yAxisMax: number;
  let tickInterval: number;
  
  if (maxValue <= 5) {
    yAxisMax = 5;
    tickInterval = 1;
  } else if (maxValue <= 10) {
    yAxisMax = 10;
    tickInterval = 2;
  } else if (maxValue <= 20) {
    yAxisMax = 20;
    tickInterval = 5;
  } else if (maxValue <= 50) {
    yAxisMax = 50;
    tickInterval = 10;
  } else if (maxValue <= 100) {
    yAxisMax = 100;
    tickInterval = 20;
  } else {
    yAxisMax = Math.ceil(maxValue * 1.2 / 100) * 100;
    tickInterval = yAxisMax / 5;
  }
  
  // Generate ticks
  const yTicks = [];
  for (let i = 0; i <= yAxisMax; i += tickInterval) {
    yTicks.push(i);
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold text-lg text-gray-700">Media Uploads Over Time</h3>
      </div>
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
            interval={completeData.length <= 15 ? 0 : completeData.length <= 30 ? 1 : Math.floor(completeData.length / 12)}
          />
          <YAxis
            tick={{ fill: '#6b7280', fontSize: 12 }}
            tickLine={{ stroke: '#e5e7eb' }}
            domain={[0, yAxisMax]}
            ticks={yTicks}
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
            formatter={(value: number, name: string) => {
              // Only show if value is greater than 0
              if (value > 0) {
                return [value, name];
              }
              return null;
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
            dot={completeData.length <= 30 ? { fill: '#3b82f6', r: 4 } : false}
            activeDot={{ r: 6 }}
          />
          <Line
            type="monotone"
            dataKey="showreel"
            stroke="#8b5cf6"
            strokeWidth={2}
            name="Showreel"
            dot={completeData.length <= 30 ? { fill: '#8b5cf6', r: 4 } : false}
            activeDot={{ r: 6 }}
          />
          <Line
            type="monotone"
            dataKey="audio"
            stroke="#f59e0b"
            strokeWidth={2}
            name="Audio"
            dot={completeData.length <= 30 ? { fill: '#f59e0b', r: 4 } : false}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// Memoize to prevent unnecessary re-renders
export default memo(MediaUploadsChart);
