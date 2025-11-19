import { addDays, format } from 'date-fns';
import { DashboardData, DashboardFilters, DailyData, ChannelData } from './types';
import { aggregateMediaUploads, aggregateMediaHours, getDisplayGranularity } from './dataAggregation';

function seededRandom(seed: number): number{
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

/**
 * Generate daily data for the entire year with realistic patterns
 */
function generateDailyData(year: number): DailyData[] {
  const data: DailyData[] = [];
  const startDate = new Date(year, 0, 1);

  for (let i = 0; i < 365; i++) {
    const currentDate = addDays(startDate, i);
    const dateStr = format(currentDate, 'yyyy-MM-dd');
    const dayOfWeek = currentDate.getDay();
    const monthProgress = i / 365;

    // Base values with growth trend
    const baseVideo = 35 + monthProgress * 25; // Grows from 35 to 60 over the year
    const baseShowreel = 3 + monthProgress * 4; // Grows from 3 to 7 over the year
    const baseHours = 18 + monthProgress * 12; // Grows from 18 to 30

    // Weekend reduction (Saturday=6, Sunday=0)
    const weekendFactor = dayOfWeek === 0 || dayOfWeek === 6 ? 0.6 : 1.0;

    // Add some randomness for realism
    const seed = year * 1000 + i;
    const randomFactor = 0.85 + seededRandom(seed) * 0.3;
    
    // Showreels have more variation - some days have spikes
    const showreelSpike = Math.random() > 0.85 ? 1.5 : 1.0; // 15% chance of 50% more showreels

    data.push({
      date: dateStr,
      video: Math.round(baseVideo * weekendFactor * randomFactor),
      showreel: Math.round(baseShowreel * weekendFactor * randomFactor * showreelSpike),
      hours: Math.round(baseHours * weekendFactor * randomFactor * 10) / 10,
    });
  }

  return data;
}

/**
 * Filter daily data by date range
 */
function filterDataByDateRange(data: DailyData[], startDate: string, endDate: string): DailyData[] {
  return data.filter(day => day.date >= startDate && day.date <= endDate);
}

/**
 * Calculate percentage change between two periods
 */
function calculateChange(current: number, previous: number): number {
  if (previous === 0) return 0;
  return Math.round(((current - previous) / previous) * 100);
}

/**
 * Get status from trend
 */
function getStatusFromTrend(changePercent: number): 'stable' | 'increase' | 'decrease' {
  if (changePercent > 3) return 'increase';
  if (changePercent < -3) return 'decrease';
  return 'stable';
}

/**
 * Get filter multiplier based on selected filters
 */
function getFilterMultiplier(filters: DashboardFilters): number {
  let multiplier = 1;

  if (filters.customerType !== 'all') {
    multiplier *= 0.6;
  }

  if (filters.mediaType !== 'all') {
    multiplier *= 0.7;
  }

  return multiplier;
}

/**
 * Get media type multiplier
 */
function getMediaTypeMultiplier(mediaType: string): number {
  switch (mediaType) {
    case 'Video':
      return 1.1;
    case 'Showreel':
      return 0.3;
    case 'Tutorial':
      return 0.6;
    case 'Demo':
      return 0.4;
    default:
      return 1;
  }
}

/**
 * Generate mock dashboard data based on filters
 */
export function generateMockData(filters: DashboardFilters): DashboardData {
  const filterMultiplier = getFilterMultiplier(filters);
  const mediaTypeMultiplier = getMediaTypeMultiplier(filters.mediaType);

  // Generate daily data for all years in the date range
  const startYear = new Date(filters.startDate).getFullYear();
  const endYear = new Date(filters.endDate).getFullYear();
  let allDailyData: DailyData[] = [];
  
  for (let year = startYear; year <= endYear; year++) {
    allDailyData = allDailyData.concat(generateDailyData(year));
  }

  // Filter to current period
  const currentPeriodData = filterDataByDateRange(allDailyData, filters.startDate, filters.endDate);

  // Calculate previous period dates
  const start = new Date(filters.startDate);
  const end = new Date(filters.endDate);
  const daysDiff = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  const prevEnd = new Date(start);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - daysDiff + 1);

  // Get previous period data if available in our generated data
  let previousPeriodData: DailyData[] = [];
  const prevStartYear = prevStart.getFullYear();
  const prevEndYear = prevEnd.getFullYear();
  
  // Check if previous period is within our generated data range
  if (prevStartYear >= startYear || prevEndYear >= startYear) {
    previousPeriodData = filterDataByDateRange(
      allDailyData,
      format(prevStart, 'yyyy-MM-dd'),
      format(prevEnd, 'yyyy-MM-dd')
    );
  }

  // Calculate totals for current period
  const currentVideos = currentPeriodData.reduce(
    (sum: number, day: DailyData) => sum + Math.round(day.video * filterMultiplier * mediaTypeMultiplier),
    0
  );
  const currentShowreels = currentPeriodData.reduce(
    (sum: number, day: DailyData) => sum + Math.round(day.showreel * filterMultiplier * mediaTypeMultiplier),
    0
  );
  const currentHours = currentPeriodData.reduce(
    (sum: number, day: DailyData) => sum + Math.round(day.hours * filterMultiplier * mediaTypeMultiplier * 10) / 10,
    0
  );

  // Calculate totals for previous period (use current period as fallback if no previous data)
  const prevVideos = previousPeriodData.length > 0
    ? previousPeriodData.reduce(
      (sum: number, day: DailyData) => sum + Math.round(day.video * filterMultiplier * mediaTypeMultiplier),
      0
    )
    : currentVideos;
  const prevShowreels = previousPeriodData.length > 0
    ? previousPeriodData.reduce(
      (sum: number, day: DailyData) => sum + Math.round(day.showreel * filterMultiplier * mediaTypeMultiplier),
      0
    )
    : currentShowreels;
  const prevHours = previousPeriodData.length > 0
    ? previousPeriodData.reduce(
      (sum: number, day: DailyData) => sum + Math.round(day.hours * filterMultiplier * mediaTypeMultiplier * 10) / 10,
      0
    )
    : currentHours;

  // Calculate metrics with period-over-period comparison
  const videoChange = calculateChange(currentVideos, prevVideos);
  const showreelChange = calculateChange(currentShowreels, prevShowreels);
  const hoursChange = calculateChange(currentHours, prevHours);

  // Active users calculation (proportional to period length, ensure positive values)
  const baseActiveUsers = 1250;
  const activeUsers = Math.max(0, Math.round(baseActiveUsers * filterMultiplier * (daysDiff / 30)));
  const prevActiveUsers = previousPeriodData.length > 0
    ? Math.max(0, Math.round(baseActiveUsers * filterMultiplier * (daysDiff / 30) * 0.92))
    : activeUsers;
  const activeUsersChange = calculateChange(activeUsers, prevActiveUsers);

  // Calculate average views per media based on total media and active users
  const totalMedia = currentVideos + currentShowreels;
  const avgViews = totalMedia > 0 ? Math.round((activeUsers * 3.2 * (daysDiff / 30)) / totalMedia * 1000) / 1000 : 0;

  // Calculate engagement based on activity level (higher for longer periods and more content)
  const baseEngagement = 65;
  const engagementBoost = Math.min(15, (daysDiff / 30) * 2); // Up to +15% for longer periods
  const contentEngagement = Math.min(10, (totalMedia / 100) * 2); // Up to +10% for more content
  const engagementPercent = Math.max(0, Math.round(baseEngagement + engagementBoost + contentEngagement));

  const metrics = {
    totalVideos: {
      count: currentVideos,
      changePercent: videoChange,
    },
    totalHours: {
      hours: Math.round(currentHours),
      changePercent: hoursChange,
    },
    totalShowreels: {
      count: currentShowreels,
      changePercent: showreelChange,
    },
    activeUsers: {
      count: activeUsers,
      status: getStatusFromTrend(activeUsersChange),
    },
    avgViewsPerMedia: {
      average: avgViews,
      engagementPercent: engagementPercent,
    },
  };

  // Apply filters to daily data for charts
  const filteredDailyData = currentPeriodData.map(day => ({
    date: day.date,
    video: Math.round(day.video * filterMultiplier * mediaTypeMultiplier),
    showreel: Math.round(day.showreel * filterMultiplier * mediaTypeMultiplier),
    hours: Math.round(day.hours * filterMultiplier * mediaTypeMultiplier * 10) / 10,
  }));

  // Determine display granularity and aggregate data
  const granularity = getDisplayGranularity(filters.startDate, filters.endDate);
  const mediaUploads = aggregateMediaUploads(filteredDailyData, granularity);
  const mediaHours = aggregateMediaHours(filteredDailyData, granularity);

  // Media types breakdown
  const mediaTypes = [
    { name: 'Video', value: currentVideos, color: '#3b82f6' },
    { name: 'Showreel', value: currentShowreels, color: '#f59e0b' },
    { name: 'Tutorial', value: Math.round(currentVideos * 0.15), color: '#8b5cf6' },
    { name: 'Demo', value: Math.round(currentVideos * 0.10), color: '#ec4899' },
  ];

  // Top channels based on customer selection
  const totalHours = Math.round(currentHours);
  const topChannels = generateTopChannels(filters.customerType, totalHours);

  // Generate active users data
  const activeUsersData = generateActiveUsersData(filters.endDate, activeUsers);

  return {
    metrics,
    mediaUploads,
    mediaHours,
    mediaTypes,
    topChannels,
    activeUsers: activeUsersData,
  };
}

/**
 * Generate active users data with realistic patterns
 */
function generateActiveUsersData(endDate: string, totalActiveUsers: number): any[] {
  const users = [
    { name: 'Ayesha Khan', role: 'Manager' },
    { name: 'Rohit Mehra', role: 'Editor' },
    { name: 'Leena Gupta', role: 'Producer' },
    { name: 'Arjun Patel', role: 'Content Creator' },
    { name: 'Priya Sharma', role: 'Designer' },
    { name: 'Vikram Singh', role: 'Editor' },
    { name: 'Neha Reddy', role: 'Manager' },
    { name: 'Karan Malhotra', role: 'Producer' },
    { name: 'Simran Kaur', role: 'Content Creator' },
    { name: 'Aditya Verma', role: 'Editor' },
    { name: 'Pooja Nair', role: 'Designer' },
    { name: 'Rahul Joshi', role: 'Manager' },
    { name: 'Anjali Desai', role: 'Producer' },
    { name: 'Sanjay Kumar', role: 'Content Creator' },
    { name: 'Divya Iyer', role: 'Editor' },
    { name: 'Manish Agarwal', role: 'Designer' },
    { name: 'Kavita Rao', role: 'Manager' },
    { name: 'Deepak Chopra', role: 'Producer' },
    { name: 'Ritu Bansal', role: 'Content Creator' },
    { name: 'Amit Saxena', role: 'Editor' },
  ];

  const end = new Date(endDate);
  
  return users.map((user, index) => {
    // Generate varied activity levels
    const seed = index * 100 + totalActiveUsers;
    const activityLevel = 0.3 + seededRandom(seed) * 0.7;
    const uploads = Math.round(activityLevel * (5 + Math.random() * 20)); // 2-25 uploads
    const totalViews = Math.round(uploads * (10 + Math.random() * 90)); // 10-100 views per upload
    
    // Generate last active date (within last 30 days)
    const daysAgo = Math.floor(Math.random() * 30);
    const lastActive = new Date(end);
    lastActive.setDate(lastActive.getDate() - daysAgo);
    
    return {
      id: `user-${index + 1}`,
      user: user.name,
      role: user.role,
      uploads,
      lastActive: format(lastActive, 'yyyy-MM-dd'),
      totalViews,
    };
  });
}

/**
 * Generate top channels based on customer selection
 */
function generateTopChannels(customerType: string, totalHours: number): ChannelData[] {
  const channelsByCustomer: Record<string, Array<{ name: string; percentage: number }>> = {
    'Airbnb': [
      { name: 'Airbnb Marketing', percentage: 0.30 },
      { name: 'Airbnb Host Training', percentage: 0.25 },
      { name: 'Airbnb Product Demos', percentage: 0.20 },
      { name: 'Airbnb Customer Support', percentage: 0.15 },
      { name: 'Airbnb Onboarding', percentage: 0.10 },
    ],
    'Ford Motor Company': [
      { name: 'Ford Product Showcase', percentage: 0.35 },
      { name: 'Ford Dealer Training', percentage: 0.25 },
      { name: 'Ford Marketing Campaigns', percentage: 0.20 },
      { name: 'Ford Safety Videos', percentage: 0.12 },
      { name: 'Ford Internal Comms', percentage: 0.08 },
    ],
    'Groww': [
      { name: 'Groww Investor Education', percentage: 0.32 },
      { name: 'Groww Product Tutorials', percentage: 0.28 },
      { name: 'Groww Marketing', percentage: 0.22 },
      { name: 'Groww Webinars', percentage: 0.12 },
      { name: 'Groww Customer Success', percentage: 0.06 },
    ],
  };

  // If specific customer selected, return their channels
  if (customerType !== 'all' && channelsByCustomer[customerType]) {
    return channelsByCustomer[customerType]
      .slice(0, 4) // Top 4 channels
      .map((channel: { name: string; percentage: number }) => ({
        name: channel.name,
        hours: Math.round(totalHours * channel.percentage),
      }));
  }

  // If "all" selected, aggregate top channels across all customers
  const allChannels = [
    { name: 'Airbnb Marketing', percentage: 0.18 },
    { name: 'Ford Product Showcase', percentage: 0.16 },
    { name: 'Groww Investor Education', percentage: 0.15 },
    { name: 'Airbnb Host Training', percentage: 0.14 },
    { name: 'Ford Dealer Training', percentage: 0.12 },
    { name: 'Groww Product Tutorials', percentage: 0.11 },
    { name: 'Ford Marketing Campaigns', percentage: 0.08 },
    { name: 'Airbnb Product Demos', percentage: 0.06 },
  ];

  return allChannels
    .slice(0, 4) // Top 4 channels overall
    .map(channel => ({
      name: channel.name,
      hours: Math.round(totalHours * channel.percentage),
    }));
}

export function getCustomerTypes(): string[] {
  return ['all', 'Airbnb', 'Ford Motor Company', 'Groww'];
}

export function getMediaTypes(): string[] {
  return ['all', 'Video', 'Showreel', 'Tutorial', 'Demo'];
}
