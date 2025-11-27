'use client';

import { ChannelData } from '@/lib/types';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface TopChannelsChartProps {
  data: ChannelData[];
  loading?: boolean;
}

export default function TopChannelsChart({ data, loading }: TopChannelsChartProps) {
  const sortedData = [...data].sort((a, b) => b.hours - a.hours);

  // Calculate dynamic domain based on highest value
  const maxHours = Math.max(...data.map(d => d.hours), 0);
  
  // Determine scale based on max value
  let maxDomain: number;
  let tickInterval: number;
  
  if (maxHours <= 0.1) {
    maxDomain = 0.1;
    tickInterval = 0.02;
  } else if (maxHours <= 1) {
    maxDomain = 1;
    tickInterval = 0.1;
  } else if (maxHours <= 10) {
    maxDomain = 10;
    tickInterval = 1;
  } else if (maxHours <= 100) {
    maxDomain = Math.ceil(maxHours / 10) * 10;
    tickInterval = maxDomain / 10;
  } else {
    maxDomain = Math.ceil(maxHours / 100) * 100;
    tickInterval = maxDomain / 10;
  }
  
  // Generate ticks
  const ticks = [];
  for (let i = 0; i <= maxDomain; i += tickInterval) {
    ticks.push(Math.round(i * 100) / 100);
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="font-semibold text-lg text-gray-700 mb-4">Top Channels by Uploaded Hours</h3>
        <div className="h-80 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h3 className="font-semibold text-lg text-gray-700 mb-4">Top Channels by Uploaded Hours</h3>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={sortedData} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            type="number"
            tick={{ fill: '#6b7280', fontSize: 12 }}
            tickLine={{ stroke: '#e5e7eb' }}
            domain={[0, maxDomain]}
            ticks={ticks}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fill: '#6b7280', fontSize: 12 }}
            tickLine={{ stroke: '#e5e7eb' }}
            width={100}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '8px 12px',
            }}
            cursor={{ fill: 'rgba(139, 92, 246, 0.1)' }}
          />
          <Bar
            dataKey="hours"
            fill="#8b5cf6"
            radius={[0, 4, 4, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
