/**
 * Loading skeleton for chart components
 * Shows placeholder animation while data loads
 */
export default function ChartSkeleton() {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 animate-pulse">
      <div className="h-6 bg-gray-200 rounded w-1/3 mb-4" />
      <div className="h-80 bg-gray-100 rounded flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500" />
          <div className="text-sm text-gray-400">Loading chart...</div>
        </div>
      </div>
    </div>
  );
}
