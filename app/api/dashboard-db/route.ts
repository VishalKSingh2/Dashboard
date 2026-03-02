import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { DashboardData, DashboardFilters } from '@/lib/types';
import { format, subDays } from 'date-fns';
import { smartCompress } from '@/lib/compression';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    // Use a date range that has actual data (latest data is June 2025)
    const latestDate = new Date('2025-06-27');
    const defaultStart = new Date(latestDate);
    defaultStart.setDate(defaultStart.getDate() - 90); // Last 90 days
    
    // Support for data granularity: 'summary' (aggregated) or 'detailed' (full data)
    const granularity = searchParams.get('granularity') || 'summary';
    const maxDataPoints = granularity === 'summary' ? 30 : 365;
    
    const filters: DashboardFilters = {
      customerType: searchParams.get('customerType') || 'all',
      mediaType: searchParams.get('mediaType') || 'all',
      startDate: searchParams.get('startDate') || format(defaultStart, 'yyyy-MM-dd'),
      endDate: searchParams.get('endDate') || format(latestDate, 'yyyy-MM-dd'),
    };

    const parsedEndDate = filters.endDate ? new Date(filters.endDate) : latestDate;
    const parsedStartDate = filters.startDate ? new Date(filters.startDate) : defaultStart;
    const effectiveEndDate = !isNaN(parsedEndDate.getTime()) && parsedEndDate < latestDate ? parsedEndDate : latestDate;
    const effectiveStartDate = !isNaN(parsedStartDate.getTime()) ? parsedStartDate : defaultStart;

    console.log('Dashboard DB API - Filters:', filters);
    console.log('Dashboard DB API - Granularity:', granularity);

    // Map UI filter values to database values
    // 'Showreel' in UI maps to 'Project' in database
    const dbMediaType = filters.mediaType === 'Showreel' ? 'Project' : filters.mediaType;

    // Build WHERE clauses based on filters (Optimized - removed RTRIM)
    const whereConditions: string[] = [
      `vs.Created >= @startDate`,
      `vs.Created <= @endDate`
    ];

    if (filters.customerType !== 'all') {
      whereConditions.push(`vs.ParentName = @customerType`);
    }

    if (dbMediaType !== 'all') {
      whereConditions.push(`vs.MediaSource = @mediaType`);
    }

    const whereClause = whereConditions.join(' AND ');

    // Build WHERE clause for showreels (from SPLUNK_ProjectStatistics)
    const showreelWhereConditions: string[] = [
      `[sps].[Modified] >= @startDate`,
      `[sps].[Modified] <= @endDate`
    ];
    
    if (filters.customerType !== 'all') {
      showreelWhereConditions.push(`[sps].[ParentName] = @customerType`);
    }
    
    const showreelWhereClause = showreelWhereConditions.join(' AND ');

    // Query 1: Get metrics (Optimized with NOLOCK and index hints)
    const metricsQuery = `
      SELECT 
        COUNT(CASE WHEN vs.MediaSource = 'Video' THEN vs.VideoId END) as totalVideos,
        SUM(CAST(vs.LengthInMilliseconds AS BIGINT)) / 3600000.0 as totalHours,
        COUNT(CASE WHEN vs.MediaSource = 'Audio' THEN vs.VideoId END) as totalAudio,
        AVG(CAST(vs.ViewCount AS FLOAT)) as avgViews
      FROM SPLUNK_VideoStatistics vs WITH (NOLOCK, INDEX(0))
      WHERE ${whereClause}
    `;
    
    const showreelsQuery = `
      SELECT COUNT(*) as totalShowreels
      FROM [dbo].[ProjectStatistics] AS [ps] WITH (NOLOCK)
        JOIN [dbo].[ClientOverview] AS [co] WITH (NOLOCK) ON [co].[Id] = [ps].[ClientId]
        JOIN [dbo].[SPLUNK_ProjectStatistics] AS [sps] WITH (NOLOCK) ON [sps].[id] = [ps].[id]
        JOIN [dbo].[SPLUNK_LOOKUP_ProjectStatus] AS [slps] WITH (NOLOCK) ON [slps].[ProjectStatus] = [ps].[ProjectStatus]
      WHERE ${showreelWhereClause}
    `;

    const [metrics, showreelsResult] = await Promise.all([
      query(metricsQuery, {
        startDate: filters.startDate,
        endDate: filters.endDate,
        customerType: filters.customerType,
        mediaType: dbMediaType,
      }),
      query(showreelsQuery, {
        startDate: filters.startDate,
        endDate: filters.endDate,
        customerType: filters.customerType,
      })
    ]);

    // Query 2: Get daily upload data with smart aggregation
    const queryStartDate = new Date(filters.startDate);
    const queryEndDate = new Date(filters.endDate);
    const queryDaysDiff = Math.floor((queryEndDate.getTime() - queryStartDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    
    console.log('Dashboard DB API - Date Range:', queryDaysDiff, 'days');
    
    // Get daily data for all date ranges
    let groupByClause = 'CAST(vs.Created AS DATE)';
    let aggregationLevel = 'daily';
    
    console.log('Dashboard DB API - Aggregation Level:', aggregationLevel);
    
    const dailyDataQuery = `
      SELECT 
        ${groupByClause.replace('vs.CreatedDate', 'vs.Created')} as date,
        COUNT(CASE WHEN vs.MediaSource = 'Video' THEN 1 END) as video,
        COUNT(CASE WHEN vs.MediaSource = 'Audio' THEN 1 END) as audio,
        SUM(CAST(vs.LengthInMilliseconds AS BIGINT)) / 3600000.0 as hours
      FROM SPLUNK_VideoStatistics vs WITH (NOLOCK)
      WHERE ${whereClause}
      GROUP BY ${groupByClause}
      ORDER BY ${groupByClause}
    `;
    
    const dailyShowreelsQuery = `
      SELECT 
        CAST([sps].[Modified] AS DATE) as date,
        COUNT(*) as showreel
      FROM [dbo].[ProjectStatistics] AS [ps] WITH (NOLOCK)
        JOIN [dbo].[ClientOverview] AS [co] WITH (NOLOCK) ON [co].[Id] = [ps].[ClientId]
        JOIN [dbo].[SPLUNK_ProjectStatistics] AS [sps] WITH (NOLOCK) ON [sps].[id] = [ps].[id]
        JOIN [dbo].[SPLUNK_LOOKUP_ProjectStatus] AS [slps] WITH (NOLOCK) ON [slps].[ProjectStatus] = [ps].[ProjectStatus]
      WHERE ${showreelWhereClause}
      GROUP BY CAST([sps].[Modified] AS DATE)
      ORDER BY CAST([sps].[Modified] AS DATE)
    `;

    const [dailyData, dailyShowreels] = await Promise.all([
      query(dailyDataQuery, {
        startDate: filters.startDate,
        endDate: filters.endDate,
        customerType: filters.customerType,
        mediaType: dbMediaType,
      }),
      query(dailyShowreelsQuery, {
        startDate: filters.startDate,
        endDate: filters.endDate,
        customerType: filters.customerType,
      })
    ]);
    
    // Merge showreel data into dailyData
    const showreelMap = new Map(dailyShowreels.map((row: any) => [
      format(new Date(row.date), 'yyyy-MM-dd'),
      row.showreel || 0
    ]));
    
    dailyData.forEach((row: any) => {
      const dateKey = format(new Date(row.date), 'yyyy-MM-dd');
      row.showreel = showreelMap.get(dateKey) || 0;
    });

    // Query 3: Get top clients (channels) - Optimized
    const channelsQuery = `
      SELECT TOP 4
        vs.ClientName as name,
        SUM(CAST(vs.LengthInMilliseconds AS BIGINT)) / 3600000.0 as hours
      FROM SPLUNK_VideoStatistics vs WITH (NOLOCK)
      WHERE ${whereClause}
      GROUP BY vs.ClientName
      ORDER BY SUM(CAST(vs.LengthInMilliseconds AS BIGINT)) DESC
    `;

    const topChannels = await query(channelsQuery, {
      startDate: filters.startDate,
      endDate: filters.endDate,
      customerType: filters.customerType,
      mediaType: dbMediaType,
    });

    // Query 4: Get media types breakdown - Optimized
    const mediaTypesQuery = `
      SELECT 
        COALESCE(vs.MediaSource, 'Unknown') as name,
        COUNT(*) as value
      FROM SPLUNK_VideoStatistics vs WITH (NOLOCK)
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
    
    // Add showreels to media types (from SPLUNK_ProjectStatistics)
    if (showreelsResult[0]?.totalShowreels > 0) {
      mediaTypes.push({
        name: 'Project',
        value: showreelsResult[0].totalShowreels
      });
    }

    // Calculate previous period for comparison
    const startDate = new Date(filters.startDate);
    const endDate = new Date(filters.endDate);
    const daysDiff = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    
    const prevStartDate = format(subDays(startDate, daysDiff), 'yyyy-MM-dd');
    const prevEndDate = format(subDays(startDate, 1), 'yyyy-MM-dd');

    // Query for previous period metrics
    const prevMetricsQuery = metricsQuery.replace(/@startDate/g, '@prevStartDate').replace(/@endDate/g, '@prevEndDate');
    const prevShowreelsQuery = showreelsQuery.replace(/@startDate/g, '@prevStartDate').replace(/@endDate/g, '@prevEndDate');
    
    const [prevMetrics, prevShowreels] = await Promise.all([
      query(prevMetricsQuery, {
        prevStartDate,
        prevEndDate,
        customerType: filters.customerType,
        mediaType: dbMediaType,
      }),
      query(prevShowreelsQuery, {
        prevStartDate,
        prevEndDate,
        customerType: filters.customerType,
      })
    ]);

    // Calculate changes
    const currentMetrics = {
      totalVideos: metrics[0]?.totalVideos || 0,
      totalHours: metrics[0]?.totalHours || 0,
      totalShowreels: showreelsResult[0]?.totalShowreels || 0,
      totalAudio: metrics[0]?.totalAudio || 0,
      avgViews: metrics[0]?.avgViews || 0
    };
    const previousMetrics = {
      totalVideos: prevMetrics[0]?.totalVideos || 0,
      totalHours: prevMetrics[0]?.totalHours || 0,
      totalShowreels: prevShowreels[0]?.totalShowreels || 0,
      totalAudio: prevMetrics[0]?.totalAudio || 0,
      avgViews: prevMetrics[0]?.avgViews || 0
    };

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
    const response: DashboardData & { granularity: string } = {
      granularity: aggregationLevel,
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
        avgViewsPerMedia: {
          average: Math.round((currentMetrics.avgViews || 0) * 10) / 10,
          engagementPercent: 68, // Calculate based on your business logic
        },
      },
      mediaUploads: dailyData.map((row: any) => {
        try {
          const date = row.date ? new Date(row.date) : new Date();
          return {
            date: isNaN(date.getTime()) ? format(new Date(), 'yyyy-MM-dd') : format(date, 'yyyy-MM-dd'),
            video: row.video || 0,
            showreel: row.showreel || 0,
            audio: row.audio || 0,
          };
        } catch {
          return {
            date: format(new Date(), 'yyyy-MM-dd'),
            video: row.video || 0,
            showreel: row.showreel || 0,
            audio: row.audio || 0,
          };
        }
      }),
      mediaHours: dailyData.map((row: any) => {
        try {
          const date = row.date ? new Date(row.date) : new Date();
          return {
            date: isNaN(date.getTime()) ? format(new Date(), 'yyyy-MM-dd') : format(date, 'yyyy-MM-dd'),
            hours: Math.round((row.hours || 0) * 100) / 100,
          };
        } catch {
          return {
            date: format(new Date(), 'yyyy-MM-dd'),
            hours: Math.round((row.hours || 0) * 100) / 100,
          };
        }
      }),
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
    };

    console.log('Dashboard DB API - Data fetched successfully');
    
    // Compress response if supported by client and payload is large
    const acceptEncoding = request.headers.get('accept-encoding');
    return smartCompress(response, acceptEncoding);

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