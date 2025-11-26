
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET() {
  try {
    // Get unique customers
    const customersQuery = `
      SELECT DISTINCT RTRIM(c.Name) as Name
      FROM Customer c
      INNER JOIN ClientOverview co ON RTRIM(c.Id) = RTRIM(co.CustomerId)
      WHERE c.Name IS NOT NULL
      ORDER BY RTRIM(c.Name)
    `;

    const customers = await query<{ Name: string }>(customersQuery);

    // Get unique media types
    const mediaTypesQuery = `
      SELECT DISTINCT RTRIM(MediaSource) as MediaSource
      FROM VideoStatistics
      WHERE MediaSource IS NOT NULL
      ORDER BY RTRIM(MediaSource)
    `;

    const mediaTypes = await query<{ MediaSource: string }>(mediaTypesQuery);

    return NextResponse.json({
      customers: ['all', ...customers.map(c => c.Name)],
      mediaTypes: ['all', ...mediaTypes.map(m => m.MediaSource)],
    });

  } catch (error) {
    console.error('Error fetching filters:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch filters',
        details: error instanceof Error ? error.message : String(error),
        // Return defaults if DB fails
        customers: ['all'],
        mediaTypes: ['all'],
      },
      { status: 500 }
    );
  }
}
