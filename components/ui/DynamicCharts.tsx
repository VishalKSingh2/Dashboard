'use client';

import dynamic from 'next/dynamic';
import ChartSkeleton from './ChartSkeleton';

// Dynamically import chart components to reduce initial bundle size
// These will be code-split and loaded only when needed

export const MediaUploadsChart = dynamic(
  () => import('@/app/dashboard/components/MediaUploadsChart'),
  {
    loading: () => <ChartSkeleton />,
    ssr: false, // Disable SSR for charts (they need browser APIs)
  }
);

export const MediaHoursChart = dynamic(
  () => import('@/app/dashboard/components/MediaHoursChart'),
  {
    loading: () => <ChartSkeleton />,
    ssr: false,
  }
);

export const MediaTypeChart = dynamic(
  () => import('@/app/dashboard/components/MediaTypeChart'),
  {
    loading: () => <ChartSkeleton />,
    ssr: false,
  }
);

export const TopChannelsChart = dynamic(
  () => import('@/app/dashboard/components/TopChannelsChart'),
  {
    loading: () => <ChartSkeleton />,
    ssr: false,
  }
);
