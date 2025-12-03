import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { DashboardData, DashboardFilters } from '@/lib/types';
import { format, subDays } from 'date-fns';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    // Use a date range that has actual data (latest data is June 2025)
    const latestDate = new Date('2025-06-27');
    const defaultStart = new Date(latestDate);
    defaultStart.setDate(defaultStart.getDate() - 90); // Last 90 days
    
    const filters: DashboardFilters = {
      customerType: searchParams.get('customerType') || 'all',
      mediaType: searchParams.get('mediaType') || 'all',
      startDate: searchParams.get('startDate') || format(defaultStart, 'yyyy-MM-dd'),
      endDate: searchParams.get('endDate') || format(latestDate, 'yyyy-MM-dd'),
    };

    console.log('Dashboard DB API - Filters:', filters);

    // Map UI filter values to database values
    // 'Showreel' in UI maps to 'Project' in database
    const dbMediaType = filters.mediaType === 'Showreel' ? 'Project' : filters.mediaType;

    // Build WHERE clauses based on filters
    const whereConditions: string[] = [
      `CAST(vs.CreatedDate AS DATE) >= @startDate`,
      `CAST(vs.CreatedDate AS DATE) <= @endDate`
    ];

    if (filters.customerType !== 'all') {
      whereConditions.push(`RTRIM(c.Name) = @customerType`);
    }

    if (dbMediaType !== 'all') {
      whereConditions.push(`RTRIM(vs.MediaSource) = @mediaType`);
    }

    const whereClause = whereConditions.join(' AND ');

    // Query 1: Get metrics (Fixed: removed DISTINCT from COUNT to match SUM calculation)
    const metricsQuery = `
      SELECT 
        COUNT(CASE WHEN RTRIM(vs.MediaSource) = 'Video' THEN vs.Id END) as totalVideos,
        SUM(CAST(vs.LengthInMilliseconds AS BIGINT)) / 3600000.0 as totalHours,
        COUNT(CASE WHEN RTRIM(vs.MediaSource) = 'Project' THEN vs.Id END) as totalShowreels,
        COUNT(CASE WHEN RTRIM(vs.MediaSource) = 'Audio' THEN vs.Id END) as totalAudio,
        AVG(CAST(vs.ViewCount AS FLOAT)) as avgViews
      FROM VideoStatistics vs
      LEFT JOIN ClientOverview co ON RTRIM(vs.ClientId) = RTRIM(co.Id)
      LEFT JOIN Customer c ON RTRIM(co.CustomerId) = RTRIM(c.Id)
      WHERE ${whereClause}
    `;
    
    // Query for active users with optional customer filter
    const activeUsersWhereConditions: string[] = [
      'CAST(us.LastLogin AS DATE) >= @startDate',
      'CAST(us.LastLogin AS DATE) <= @endDate',
      'us.IsActive = 1'
    ];
    
    if (filters.customerType !== 'all') {
      activeUsersWhereConditions.push('RTRIM(c.Id) = @customerId');
    }
    
    const activeUsersQuery = `
      SELECT COUNT(DISTINCT us.Email) as activeUsers
      FROM UserStatistics us
      INNER JOIN ClientUserRoles cur ON us.Id = cur.UserId
      INNER JOIN ClientOverview co ON cur.ClientId = co.Id
      INNER JOIN Customer c ON co.CustomerId = c.Id
      WHERE ${activeUsersWhereConditions.join(' AND ')}
    `;

    const [metrics, activeUsersResult] = await Promise.all([
      query(metricsQuery, {
        startDate: filters.startDate,
        endDate: filters.endDate,
        customerType: filters.customerType,
        mediaType: dbMediaType,
      }),
      query(activeUsersQuery, {
        startDate: filters.startDate,
        endDate: filters.endDate,
        customerId: filters.customerType,
      })
    ]);

    // Query 2: Get daily upload data
    const dailyDataQuery = `
      SELECT 
        CAST(vs.CreatedDate AS DATE) as date,
        COUNT(CASE WHEN RTRIM(vs.MediaSource) = 'Video' THEN 1 END) as video,
        COUNT(CASE WHEN RTRIM(vs.MediaSource) = 'Project' THEN 1 END) as showreel,
        COUNT(CASE WHEN RTRIM(vs.MediaSource) = 'Audio' THEN 1 END) as audio,
        SUM(CAST(vs.LengthInMilliseconds AS BIGINT)) / 3600000.0 as hours
      FROM VideoStatistics vs
      LEFT JOIN ClientOverview co ON RTRIM(vs.ClientId) = RTRIM(co.Id)
      LEFT JOIN Customer c ON RTRIM(co.CustomerId) = RTRIM(c.Id)
      WHERE ${whereClause}
      GROUP BY CAST(vs.CreatedDate AS DATE)
      ORDER BY CAST(vs.CreatedDate AS DATE)
    `;

    const dailyData = await query(dailyDataQuery, {
      startDate: filters.startDate,
      endDate: filters.endDate,
      customerType: filters.customerType,
      mediaType: dbMediaType,
    });

    // Query 3: Get top clients (channels)
    const channelsQuery = `
      SELECT TOP 4
        co.Name as name,
        SUM(CAST(vs.LengthInMilliseconds AS BIGINT)) / 3600000.0 as hours
      FROM VideoStatistics vs
      INNER JOIN ClientOverview co ON RTRIM(vs.ClientId) = RTRIM(co.Id)
      LEFT JOIN Customer c ON RTRIM(co.CustomerId) = RTRIM(c.Id)
      WHERE ${whereClause}
      GROUP BY co.Name
      ORDER BY SUM(CAST(vs.LengthInMilliseconds AS BIGINT)) DESC
    `;

    const topChannels = await query(channelsQuery, {
      startDate: filters.startDate,
      endDate: filters.endDate,
      customerType: filters.customerType,
      mediaType: dbMediaType,
    });

    // Query 4: Get media types breakdown
    const mediaTypesQuery = `
      SELECT 
        COALESCE(RTRIM(vs.MediaSource), 'Unknown') as name,
        COUNT(*) as value
      FROM VideoStatistics vs
      LEFT JOIN ClientOverview co ON RTRIM(vs.ClientId) = RTRIM(co.Id)
      LEFT JOIN Customer c ON RTRIM(co.CustomerId) = RTRIM(c.Id)
      WHERE ${whereClause}
      GROUP BY vs.MediaSource
      ORDER BY COUNT(*) DESC
    `;

    const mediaTypes = await query(mediaTypesQuery, {
      startDate: filters.startDate,
      endDate: filters.endDate,
      customerType: filters.customerType,
      mediaType: dbMediaType,
    });

    // Query 5: Get active users with customer and client information
    const usersWhereConditions: string[] = [
      'CAST(us.LastLogin AS DATE) >= @startDate',
      'CAST(us.LastLogin AS DATE) <= @endDate',
      'us.IsActive = 1'
    ];
    
    if (filters.customerType !== 'all') {
      usersWhereConditions.push(`RTRIM(c.Id) = @customerId`);
    }
    
    const usersWhereClause = `WHERE ${usersWhereConditions.join(' AND ')}`;

    const usersQuery = `
      SELECT
        us.Email,
        c.Name as CustomerName,
        co.Name as ClientName,
        us.LastLogin,
        CASE 
          WHEN us.IsActive = 1 THEN 'Enabled'
          WHEN us.IsActive = 0 THEN 'Disabled'
        END as IsActive
      FROM [dbo].[ClientUserRoles] cur
      INNER JOIN [dbo].[ClientOverview] co ON cur.ClientId = co.Id
      INNER JOIN [dbo].[Customer] c ON co.CustomerId = c.Id
      INNER JOIN [dbo].[UserStatistics] us ON cur.UserId = us.Id
      ${usersWhereClause}
      ORDER BY us.LastLogin DESC
    `;

    const activeUsers = await query(usersQuery, {
      startDate: filters.startDate,
      endDate: filters.endDate,
      customerId: filters.customerType,
    });

    // Calculate previous period for comparison
    const startDate = new Date(filters.startDate);
    const endDate = new Date(filters.endDate);
    const daysDiff = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    
    const prevStartDate = format(subDays(startDate, daysDiff), 'yyyy-MM-dd');
    const prevEndDate = format(subDays(startDate, 1), 'yyyy-MM-dd');

    // Query for previous period metrics
    const prevMetricsQuery = metricsQuery.replace(/@startDate/g, '@prevStartDate').replace(/@endDate/g, '@prevEndDate');
    const prevMetrics = await query(prevMetricsQuery, {
      prevStartDate,
      prevEndDate,
      customerType: filters.customerType,
      mediaType: dbMediaType,
    });

    // Calculate changes
    const currentMetrics = metrics[0] || { totalVideos: 0, totalHours: 0, totalShowreels: 0, totalAudio: 0, avgViews: 0 };
    const previousMetrics = prevMetrics[0] || { totalVideos: 0, totalHours: 0, totalShowreels: 0, totalAudio: 0, avgViews: 0 };
    const activeUsersCount = activeUsersResult[0]?.activeUsers || 0;

    const calculateChange = (current: number, previous: number) => {
      // If no previous data but we have current data, show as 100% increase
      if (previous === 0 && current > 0) return 100;
      // If no data in either period
      if (previous === 0 && current === 0) return 0;
      // If we had data before but none now
      if (previous > 0 && current === 0) return -100;
      // Normal calculation
      return Math.round(((current - previous) / previous) * 100);
    };

    // Verify data consistency
    const dailyVideoSum = dailyData.reduce((sum: number, row: any) => sum + (row.video || 0), 0);
    const dailyShowreelSum = dailyData.reduce((sum: number, row: any) => sum + (row.showreel || 0), 0);
    const dailyAudioSum = dailyData.reduce((sum: number, row: any) => sum + (row.audio || 0), 0);
    const dailyHoursSum = dailyData.reduce((sum: number, row: any) => sum + (row.hours || 0), 0);
    
    console.log('Data Consistency Check:', {
      metricsVideos: currentMetrics.totalVideos,
      dailyVideosSum: dailyVideoSum,
      metricsShowreels: currentMetrics.totalShowreels,
      dailyShowreelsSum: dailyShowreelSum,
      metricsAudio: currentMetrics.totalAudio,
      dailyAudioSum: dailyAudioSum,
      metricsHours: currentMetrics.totalHours,
      dailyHoursSum: Math.round(dailyHoursSum),
    });

    // Format response
    const response: DashboardData = {
      metrics: {
        totalVideos: {
          count: currentMetrics.totalVideos || 0,
          changePercent: calculateChange(currentMetrics.totalVideos || 0, previousMetrics.totalVideos || 0),
        },
        totalHours: {
          hours: Math.round((currentMetrics.totalHours || 0) * 100) / 100,
          changePercent: calculateChange(currentMetrics.totalHours || 0, previousMetrics.totalHours || 0),
        },
        totalShowreels: {
          count: currentMetrics.totalShowreels || 0,
          changePercent: calculateChange(currentMetrics.totalShowreels || 0, previousMetrics.totalShowreels || 0),
        },
        totalAudio: {
          count: currentMetrics.totalAudio || 0,
          changePercent: calculateChange(currentMetrics.totalAudio || 0, previousMetrics.totalAudio || 0),
        },
        activeUsers: {
          count: activeUsersCount,
          status: 'stable',
        },
        avgViewsPerMedia: {
          average: Math.round((currentMetrics.avgViews || 0) * 10) / 10,
          engagementPercent: 68, // Calculate based on your business logic
        },
      },
      mediaUploads: dailyData.map((row: any) => ({
        date: format(new Date(row.date), 'yyyy-MM-dd'),
        video: row.video || 0,
        showreel: row.showreel || 0,
        audio: row.audio || 0,
      })),
      mediaHours: dailyData.map((row: any) => ({
        date: format(new Date(row.date), 'yyyy-MM-dd'),
        hours: Math.round((row.hours || 0) * 100) / 100, // Round to 2 decimal places instead of 1
      })),
      mediaTypes: mediaTypes.map((row: any, index: number) => {
        // Map database 'Project' to UI-friendly 'Showreel'
        let displayName = row.name || 'Unknown';
        if (displayName === 'Project') {
          displayName = 'Showreel';
        }
        return {
          name: displayName,
          value: row.value || 0,
          color: ['#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899'][index % 4],
        };
      }),
      topChannels: topChannels.map((row: any) => ({
        name: row.name || 'Unknown',
        hours: Math.round((row.hours || 0) * 100) / 100,
      })),
      activeUsers: activeUsers.map((row: any, index: number) => ({
        id: `user-${index + 1}`,
        email: row.Email || 'Unknown',
        customerName: row.CustomerName || 'Unknown',
        clientName: row.ClientName || 'Unknown',
        lastLogin: row.LastLogin ? format(new Date(row.LastLogin), 'yyyy-MM-dd') : format(latestDate, 'yyyy-MM-dd'),
        isActive: row.IsActive || 'Disabled',
      })),
    };

    console.log('Dashboard DB API - Data fetched successfully');
    return NextResponse.json(response);

  } catch (error) {
    console.error('Error fetching dashboard data from DB:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch dashboard data', 
        details: error instanceof Error ? error.message : String(error),
        hint: 'Check database connection and credentials in .env.local'
      },
      { status: 500 }
    );
  }
}