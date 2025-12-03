
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const searchTerm = searchParams.get('search') || '';

    // Get unique customers with optional search
    let customersQuery = `
      SELECT DISTINCT RTRIM(c.Id) as Id, RTRIM(c.Name) as Name
      FROM Customer c
      INNER JOIN ClientOverview co ON RTRIM(c.Id) = RTRIM(co.CustomerId)
      WHERE c.Name IS NOT NULL
    `;

    if (searchTerm) {
      customersQuery += ` AND RTRIM(c.Name) LIKE @searchTerm`;
    }

    customersQuery += ` ORDER BY RTRIM(c.Name)`;

    const customers = searchTerm 
      ? await query<{ Id: string; Name: string }>(customersQuery, { searchTerm: `%${searchTerm}%` })
      : await query<{ Id: string; Name: string }>(customersQuery);

    // Get unique media types
    const mediaTypesQuery = `
      SELECT DISTINCT RTRIM(MediaSource) as MediaSource
      FROM VideoStatistics
      WHERE MediaSource IS NOT NULL
      ORDER BY RTRIM(MediaSource)
    `;

    const mediaTypes = await query<{ MediaSource: string }>(mediaTypesQuery);

    // Map database values to UI-friendly names
    const mappedMediaTypes = mediaTypes.map(m => {
      const source = m.MediaSource;
      // Convert 'Project' to 'Showreel' for UI consistency
      return source === 'Project' ? 'Showreel' : source;
    });

    return NextResponse.json({
      customers: [{ id: 'all', name: 'All Customers' }, ...customers.map(c => ({ id: c.Id, name: c.Name }))],
      mediaTypes: ['all', ...mappedMediaTypes],
    });

  } catch (error) {
    console.error('Error fetching filters:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch filters',
        details: error instanceof Error ? error.message : String(error),
        // Return defaults if DB fails
        customers: [{ id: 'all', name: 'All Customers' }],
        mediaTypes: ['all'],
      },
      { status: 500 }
    );
  }
}
