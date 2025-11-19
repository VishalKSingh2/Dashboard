import { ArrowUp, ArrowDown } from 'lucide-react';

interface MetricCardProps {
  title: string;
  value: string | number;
  change?: {
    value: number;
    type: 'increase' | 'decrease' | 'stable';
    label?: string;
  };
  loading?: boolean;
}

export default function MetricCard({ title, value, change, loading }: MetricCardProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-3/4 mb-3"></div>
          <div className="h-8 bg-gray-200 rounded w-1/2 mb-2"></div>
          <div className="h-3 bg-gray-200 rounded w-1/3"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h3 className="text-sm text-gray-600 mb-2">{title}</h3>
      <p className="font-bold text-3xl text-gray-900 mb-2">{value}</p>
      
      {change && (
        <div className="flex items-center gap-1">
          {change.type === 'increase' && change.value !== 0 && (
            <>
              <ArrowUp className="h-4 w-4 text-green-600" />
              <span className="text-sm text-green-600 font-medium">
                {change.value}% {change.label || 'vs Last Month'}
              </span>
            </>
          )}
          
          {change.type === 'decrease' && change.value !== 0 && (
            <>
              <ArrowDown className="h-4 w-4 text-red-600" />
              <span className="text-sm text-red-600 font-medium">
                {Math.abs(change.value)}% {change.label || 'vs Last Month'}
              </span>
            </>
          )}
          
          {change.type === 'stable' && change.value !== 0 && (
            <span className="text-sm text-orange-500 font-medium">
              {change.label || 'Stable'}
            </span>
          )}
          
          {change.value === 0 && (
            <span className="text-sm text-gray-500 font-medium">
              No change vs previous period
            </span>
          )}
        </div>
      )}
    </div>
  );
}
