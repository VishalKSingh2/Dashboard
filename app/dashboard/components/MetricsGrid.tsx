import { DashboardMetrics } from '@/lib/types';
import MetricCard from './MetricCard';
import { formatNumber, formatHours } from '@/lib/utils';

interface MetricsGridProps {
  metrics: DashboardMetrics;
  loading?: boolean;
}

export default function MetricsGrid({ metrics, loading }: MetricsGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
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

      <MetricCard
        title="Active Users (30d)"
        value={formatNumber(metrics.activeUsers.count)}
        change={{
          value: 0,
          type: metrics.activeUsers.status,
          label: 'vs previous period',
        }}
        loading={loading}
      />

      <MetricCard
        title="Avg Views per Media"
        value={formatHours(metrics.avgViewsPerMedia.average)}
        change={{
          value: metrics.avgViewsPerMedia.engagementPercent,
          type: 'increase',
          label: 'Engagement',
        }}
        loading={loading}
      />
    </div>
  );
}
