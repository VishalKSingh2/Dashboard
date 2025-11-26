import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { DashboardData, DashboardFilters } from '@/lib/types';
import { format, subDays } from 'date-fns';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    const filters: DashboardFilters = {
      customerType: searchParams.get('customerType') || 'all',
      mediaType: searchParams.get('mediaType') || 'all',
      startDate: searchParams.get('startDate') || format(firstDayOfMonth, 'yyyy-MM-dd'),
      endDate: searchParams.get('endDate') || format(now, 'yyyy-MM-dd'),
    };

    console.log('Dashboard DB API - Filters:', filters);

    // Build WHERE clauses based on filters
    const whereConditions: string[] = [
      `CAST(vs.CreatedDate AS DATE) >= @startDate`,
      `CAST(vs.CreatedDate AS DATE) <= @endDate`
    ];

    if (filters.customerType !== 'all') {
      whereConditions.push(`RTRIM(c.Name) = @customerType`);
    }

    if (filters.mediaType !== 'all') {
      whereConditions.push(`RTRIM(vs.MediaSource) = @mediaType`);
    }

    const whereClause = whereConditions.join(' AND ');

    // Query 1: Get metrics
    const metricsQuery = `
      SELECT 
        COUNT(DISTINCT vs.Id) as totalVideos,
        SUM(CAST(vs.LengthInMilliseconds AS BIGINT)) / 3600000.0 as totalHours,
        COUNT(DISTINCT CASE WHEN vs.UploadSource = 'showreel' THEN vs.Id END) as totalShowreels,
        COUNT(DISTINCT us.Email) as activeUsers,
        AVG(CAST(vs.ViewCount AS FLOAT)) as avgViews
      FROM VideoStatistics vs
      LEFT JOIN ClientOverview co ON RTRIM(vs.ClientId) = RTRIM(co.Id)
      LEFT JOIN Customer c ON RTRIM(co.CustomerId) = RTRIM(c.Id)
      LEFT JOIN UserStatistics us ON us.LastLogin >= DATEADD(day, -30, GETDATE())
      WHERE ${whereClause}
    `;

    const metrics = await query(metricsQuery, {
      startDate: filters.startDate,
      endDate: filters.endDate,
      customerType: filters.customerType,
      mediaType: filters.mediaType,
    });

    // Query 2: Get daily upload data
    const dailyDataQuery = `
      SELECT 
        CAST(vs.CreatedDate AS DATE) as date,
        COUNT(CASE WHEN RTRIM(vs.UploadSource) != 'showreel' THEN 1 END) as video,
        COUNT(CASE WHEN RTRIM(vs.UploadSource) = 'showreel' THEN 1 END) as showreel,
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
      mediaType: filters.mediaType,
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
      mediaType: filters.mediaType,
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
      mediaType: filters.mediaType,
    });

    // Query 5: Get active users (simplified since ClientUser table may not exist)
    const usersQuery = `
      SELECT TOP 20
        us.Email as userEmail,
        COALESCE(us.CreationSource, 'User') as role,
        0 as uploads,
        us.LastLogin as lastActive,
        0 as totalViews
      FROM UserStatistics us
      WHERE us.IsActive = 1
      GROUP BY us.Email, us.CreationSource, us.LastLogin
      ORDER BY us.LastLogin DESC
    `;

    const activeUsers = await query(usersQuery, {
      customerType: filters.customerType,
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
      mediaType: filters.mediaType,
    });

    // Calculate changes
    const currentMetrics = metrics[0] || { totalVideos: 0, totalHours: 0, totalShowreels: 0, activeUsers: 0, avgViews: 0 };
    const previousMetrics = prevMetrics[0] || { totalVideos: 0, totalHours: 0, totalShowreels: 0, activeUsers: 0, avgViews: 0 };

    const calculateChange = (current: number, previous: number) => {
      if (previous === 0) return 0;
      return Math.round(((current - previous) / previous) * 100);
    };

    // Format response
    const response: DashboardData = {
      metrics: {
        totalVideos: {
          count: currentMetrics.totalVideos || 0,
          changePercent: calculateChange(currentMetrics.totalVideos, previousMetrics.totalVideos),
        },
        totalHours: {
          hours: Math.round(currentMetrics.totalHours || 0),
          changePercent: calculateChange(currentMetrics.totalHours, previousMetrics.totalHours),
        },
        totalShowreels: {
          count: currentMetrics.totalShowreels || 0,
          changePercent: calculateChange(currentMetrics.totalShowreels, previousMetrics.totalShowreels),
        },
        activeUsers: {
          count: currentMetrics.activeUsers || 0,
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
      })),
      mediaHours: dailyData.map((row: any) => ({
        date: format(new Date(row.date), 'yyyy-MM-dd'),
        hours: Math.round((row.hours || 0) * 10) / 10,
      })),
      mediaTypes: mediaTypes.map((row: any, index: number) => ({
        name: row.name || 'Unknown',
        value: row.value || 0,
        color: ['#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899'][index % 4],
      })),
      topChannels: topChannels.map((row: any) => ({
        name: row.name || 'Unknown',
        hours: Math.round((row.hours || 0) * 10) / 10,
      })),
      activeUsers: activeUsers.map((row: any, index: number) => ({
        id: `user-${index + 1}`,
        user: row.userEmail || 'Unknown',
        role: row.role || 'User',
        uploads: row.uploads || 0,
        lastActive: row.lastActive ? format(new Date(row.lastActive), 'yyyy-MM-dd') : format(now, 'yyyy-MM-dd'),
        totalViews: row.totalViews || 0,
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