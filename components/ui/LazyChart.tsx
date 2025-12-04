'use client';

import { useLazyLoad } from '@/lib/hooks/useLazyLoad';
import ChartSkeleton from '@/components/ui/ChartSkeleton';
import { ReactNode } from 'react';

interface LazyChartProps {
  children: ReactNode;
  minHeight?: string;
}

/**
 * Wrapper component that lazy loads charts when they become visible
 * Improves initial page load performance significantly
 */
export default function LazyChart({ children, minHeight = '400px' }: LazyChartProps) {
  const { ref, isVisible } = useLazyLoad();

  return (
    <div ref={ref} style={{ minHeight }}>
      {isVisible ? children : <ChartSkeleton />}
    </div>
  );
}
