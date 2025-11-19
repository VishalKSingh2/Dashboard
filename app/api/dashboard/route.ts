import { NextRequest, NextResponse } from 'next/server';
import { generateMockData } from '@/lib/mockData';
import { DashboardFilters } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const filters: DashboardFilters = {
      customerType: searchParams.get('customerType') || 'all',
      mediaType: searchParams.get('mediaType') || 'all',
      startDate: searchParams.get('startDate') || firstDayOfMonth.toISOString().split('T')[0],
      endDate: searchParams.get('endDate') || now.toISOString().split('T')[0],
    };

    console.log('Dashboard API - Filters:', filters);

    await new Promise((resolve) => setTimeout(resolve, 500));

    const data = generateMockData(filters);

    console.log('Dashboard API - Data generated successfully');

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return NextResponse.json(
      { error: 'Failed to fetch dashboard data', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
