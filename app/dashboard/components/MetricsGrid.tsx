import { DashboardMetrics } from '@/lib/types';
import MetricCard from './MetricCard';
import { formatNumber, formatHours } from '@/lib/utils';

interface MetricsGridProps {
  metrics: DashboardMetrics;
  loading?: boolean;
}

export default function MetricsGrid({ metrics, loading }: MetricsGridProps) {
  return (
    <div className="grid grid-rows-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <MetricCard
        title="Total Videos Uploaded"
        value={formatNumber(metrics.totalVideos.count)}
        change={{
          value: metrics.totalVideos.changePercent,
          type: metrics.totalVideos.changePercent > 0 ? 'increase' : metrics.totalVideos.changePercent < 0 ? 'decrease' : 'stable',
          label: 'vs previous period',
        }}
        loading={loading}
      />

      <MetricCard
        title="Total Hours of Media"
        value={`${formatNumber(metrics.totalHours.hours)} hrs`}
        change={{
          value: metrics.totalHours.changePercent,
          type: metrics.totalHours.changePercent > 0 ? 'increase' : metrics.totalHours.changePercent < 0 ? 'decrease' : 'stable',
          label: 'vs previous period',
        }}
        loading={loading}
      />

      <MetricCard
        title="Total Showreels"
        value={formatNumber(metrics.totalShowreels.count)}
        change={{
          value: metrics.totalShowreels.changePercent,
          type: metrics.totalShowreels.changePercent > 0 ? 'increase' : metrics.totalShowreels.changePercent < 0 ? 'decrease' : 'stable',
          label: 'vs previous period',
        }}
        loading={loading}
      />

      <MetricCard
        title="Total Audio"
        value={formatNumber(metrics.totalAudio.count)}
        change={{
          value: metrics.totalAudio.changePercent,
          type: metrics.totalAudio.changePercent > 0 ? 'increase' : metrics.totalAudio.changePercent < 0 ? 'decrease' : 'stable',
          label: 'vs previous period',
        }}
        loading={loading}
      />
    </div>
  );
}
