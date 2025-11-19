export interface DashboardMetrics {
  totalVideos: {
    count: number;
    changePercent: number;
  };
  totalHours: {
    hours: number;
    changePercent: number;
  };
  totalShowreels: {
    count: number;
    changePercent: number;
  };
  activeUsers: {
    count: number;
    status: 'stable' | 'increase' | 'decrease';
  };
  avgViewsPerMedia: {
    average: number;
    engagementPercent: number;
  };
}

export interface MediaUploadData {
  date: string; // ISO date string (YYYY-MM-DD)
  video: number;
  showreel: number;
}

export interface MediaHoursData {
  date: string; // ISO date string (YYYY-MM-DD)
  hours: number;
}

export interface DailyData {
  date: string;
  video: number;
  showreel: number;
  hours: number;
}

export interface MediaTypeData {
  name: string;
  value: number;
  color: string;
}

export interface ChannelData {
  name: string;
  hours: number;
}

export interface DashboardFilters {
  customerType: string;
  mediaType: string;
  startDate: string;
  endDate: string;
}

export interface ActiveUserData {
  id: string;
  user: string;
  role: string;
  uploads: number;
  lastActive: string; // ISO date string (YYYY-MM-DD)
  totalViews: number;
}

export interface DashboardData {
  metrics: DashboardMetrics;
  mediaUploads: MediaUploadData[];
  mediaHours: MediaHoursData[];
  mediaTypes: MediaTypeData[];
  topChannels: ChannelData[];
  activeUsers: ActiveUserData[];
}
