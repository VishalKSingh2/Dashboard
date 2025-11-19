import { format, startOfWeek, startOfMonth, addDays } from 'date-fns';
import { MediaUploadData, MediaHoursData, DailyData } from './types';

export type DisplayGranularity = 'daily' | 'weekly' | 'monthly';

/**
 * Determine the appropriate display granularity based on date range
 */
export function getDisplayGranularity(startDate: string, endDate: string): DisplayGranularity {
    const daysDiff = Math.floor(
        (new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)
    ) + 1;

    if (daysDiff <= 30) return 'daily';
    if (daysDiff <= 90) return 'weekly';
    return 'monthly';
}

/**
 * Aggregate daily media upload data based on granularity
 */
export function aggregateMediaUploads(
    dailyData: DailyData[],
    granularity: DisplayGranularity
): MediaUploadData[] {
    if (dailyData.length === 0) return [];

    if (granularity === 'daily') {
        // Return all daily data without sampling to ensure totals match
        return dailyData.map(day => ({
            date: day.date,
            video: day.video,
            showreel: day.showreel,
        }));
    }

    const grouped = new Map<string, { video: number; showreel: number; count: number; actualDate: string }>();
    const firstDate = dailyData[0].date;

    dailyData.forEach(day => {
        const date = new Date(day.date);
        let key: string;

        if (granularity === 'weekly') {
            const weekStart = startOfWeek(date, { weekStartsOn: 1 }); // Monday
            key = format(weekStart, 'yyyy-MM-dd');
        } else {
            const monthStart = startOfMonth(date);
            key = format(monthStart, 'yyyy-MM-dd');
        }

        const existing = grouped.get(key) || { video: 0, showreel: 0, count: 0, actualDate: day.date };
        grouped.set(key, {
            video: existing.video + day.video,
            showreel: existing.showreel + day.showreel,
            count: existing.count + 1,
            actualDate: existing.actualDate < day.date ? existing.actualDate : day.date, // Keep earliest date in range
        });
    });

    return Array.from(grouped.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([key, data]) => ({
            date: data.actualDate >= firstDate ? data.actualDate : firstDate, // Use actual date if within range
            video: data.video, // Already rounded in mockData, don't round again
            showreel: data.showreel, // Already rounded in mockData, don't round again
        }));
}

/**
 * Aggregate daily media hours data based on granularity
 */
export function aggregateMediaHours(
    dailyData: DailyData[],
    granularity: DisplayGranularity
): MediaHoursData[] {
    if (dailyData.length === 0) return [];

    if (granularity === 'daily') {
        // Return all daily data without sampling to ensure totals match
        return dailyData.map(day => ({
            date: day.date,
            hours: day.hours,
        }));
    }

    const grouped = new Map<string, { hours: number; count: number; actualDate: string }>();
    const firstDate = dailyData[0].date;

    dailyData.forEach(day => {
        const date = new Date(day.date);
        let key: string;

        if (granularity === 'weekly') {
            const weekStart = startOfWeek(date, { weekStartsOn: 1 });
            key = format(weekStart, 'yyyy-MM-dd');
        } else {
            const monthStart = startOfMonth(date);
            key = format(monthStart, 'yyyy-MM-dd');
        }

        const existing = grouped.get(key) || { hours: 0, count: 0, actualDate: day.date };
        grouped.set(key, {
            hours: existing.hours + day.hours,
            count: existing.count + 1,
            actualDate: existing.actualDate < day.date ? existing.actualDate : day.date, // Keep earliest date in range
        });
    });

    return Array.from(grouped.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([key, data]) => ({
            date: data.actualDate >= firstDate ? data.actualDate : firstDate, // Use actual date if within range
            hours: data.hours, // Already rounded in mockData, don't round again
        }));
}

/**
 * Format date label based on granularity
 * Always includes year for monthly view to avoid confusion
 */
export function formatDateLabel(dateStr: string, granularity: DisplayGranularity): string {
    const date = new Date(dateStr);

    switch (granularity) {
        case 'daily':
            return format(date, 'MMM d, yy'); // Jan 15, 24
        case 'weekly':
            return format(date, 'MMM d, yy'); // Jan 15, 24
        case 'monthly':
            return format(date, "MMM yy"); // Jan 24, Feb 25
        default:
            return dateStr;
    }
}
