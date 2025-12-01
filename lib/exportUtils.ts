import { DashboardData, DashboardFilters } from './types';
import { format, differenceInDays, parseISO } from 'date-fns';

/**
 * Helper function to calculate day of week
 */
function getDayOfWeek(dateStr: string): string {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[new Date(dateStr).getDay()];
}

/**
 * Helper function to get week number
 */
function getWeekNumber(dateStr: string): number {
    const date = new Date(dateStr);
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}

/**
 * Export dashboard data to Excel format with enhanced details
 */
export async function exportToExcel(data: DashboardData, filters: DashboardFilters) {
    try {
        // Dynamic import to avoid SSR issues
        const XLSX = await import('xlsx');
        const workbook = XLSX.utils.book_new();

        // Calculate additional metrics
        const startDate = parseISO(filters.startDate);
        const endDate = parseISO(filters.endDate);
        const totalDays = differenceInDays(endDate, startDate) + 1;
        const totalDataPoints = data.mediaUploads?.length || 0;
        const dataCompleteness = totalDays > 0 ? ((totalDataPoints / totalDays) * 100).toFixed(1) : '0';

        // Sheet 1: Export Info (Enhanced)
        const exportInfo = [
            ['Field Name', 'Value'],
            ['Report Title', 'Report Analytics Dashboard'],
            ['Export Date & Time', format(new Date(), 'dd-MM-yyyy HH:mm:ss')],
            ['Date Range Start', filters.startDate || 'N/A'],
            ['Date Range End', filters.endDate || 'N/A'],
            ['Total Days in Range', totalDays],
            ['Customer Filter', filters.customerType === 'all' ? 'All Customers' : filters.customerType],
            ['Media Type Filter', filters.mediaType === 'all' ? 'All Media Types' : filters.mediaType],
            ['Total Data Points', totalDataPoints],
            ['Data Completeness', `${dataCompleteness}%`],
            ['Dashboard Version', '1.0.0'],
        ];
        const ws1 = XLSX.utils.aoa_to_sheet(exportInfo);
        ws1['!cols'] = [{ wch: 25 }, { wch: 40 }];
        XLSX.utils.book_append_sheet(workbook, ws1, 'Export_Info');

        // Sheet 2: Summary Metrics (Enhanced)
        const calculatePreviousValue = (current: number, changePercent: number) => {
            if (changePercent === 0) return current;
            return Math.round(current / (1 + changePercent / 100));
        };

        const metrics = data.metrics || {};
        const metricsVideos = metrics.totalVideos || { count: 0, changePercent: 0 };
        const metricsHours = metrics.totalHours || { hours: 0, changePercent: 0 };
        const metricsShowreels = metrics.totalShowreels || { count: 0, changePercent: 0 };
        const metricsActiveUsers = metrics.activeUsers || { count: 0, status: 'stable' as const };
        const avgViewsPerMedia = metrics.avgViewsPerMedia || { average: 0, engagementPercent: 0 };

        const summaryData = [
            ['Metric Name', 'Current Value', 'Previous Value', 'Absolute Change', 'Change (%)', 'Trend', 'Comparison Period'],
            [
                'Total Videos Uploaded',
                metricsVideos.count || 0,
                calculatePreviousValue(metricsVideos.count || 0, metricsVideos.changePercent || 0),
                (metricsVideos.count || 0) - calculatePreviousValue(metricsVideos.count || 0, metricsVideos.changePercent || 0),
                `${metricsVideos.changePercent || 0}%`,
                (metricsVideos.changePercent || 0) > 0 ? 'Increasing' : (metricsVideos.changePercent || 0) < 0 ? 'Decreasing' : 'Stable',
                'vs previous period'
            ],
            [
                'Total Hours of Media',
                Math.round((metricsHours.hours || 0) * 100) / 100,
                calculatePreviousValue(metricsHours.hours || 0, metricsHours.changePercent || 0),
                Math.round(((metricsHours.hours || 0) - calculatePreviousValue(metricsHours.hours || 0, metricsHours.changePercent || 0)) * 100) / 100,
                `${metricsHours.changePercent || 0}%`,
                (metricsHours.changePercent || 0) > 0 ? 'Increasing' : (metricsHours.changePercent || 0) < 0 ? 'Decreasing' : 'Stable',
                'vs previous period'
            ],
            [
                'Total Showreels',
                metricsShowreels.count || 0,
                calculatePreviousValue(metricsShowreels.count || 0, metricsShowreels.changePercent || 0),
                (metricsShowreels.count || 0) - calculatePreviousValue(metricsShowreels.count || 0, metricsShowreels.changePercent || 0),
                `${metricsShowreels.changePercent || 0}%`,
                (metricsShowreels.changePercent || 0) > 0 ? 'Increasing' : (metricsShowreels.changePercent || 0) < 0 ? 'Decreasing' : 'Stable',
                'vs previous period'
            ],
            [
                'Active Users (30d)',
                metricsActiveUsers.count || 0,
                metricsActiveUsers.count || 0,
                0,
                '0%',
                'Stable',
                'vs previous period'
            ],
            [
                'Avg Views per Media',
                (avgViewsPerMedia.average || 0).toFixed(1),
                '-',
                '-',
                `${avgViewsPerMedia.engagementPercent || 0}%`,
                'Increasing',
                'Engagement Rate'
            ],
        ];
        const ws2 = XLSX.utils.aoa_to_sheet(summaryData);
        ws2['!cols'] = [{ wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 10 }, { wch: 20 }];
        XLSX.utils.book_append_sheet(workbook, ws2, 'Summary_Metrics');

        // Sheet 3: Daily Upload Data (Enhanced)
        const dailyHeaders = ['Date', 'Day of Week', 'Week #', 'Videos', 'Showreels', 'Total Uploads', 'Hours', 'Cumulative Videos', 'Cumulative Hours', 'Weekend'];
        let cumulativeVideos = 0;
        let cumulativeHours = 0;

        const dailyRows = (data.mediaUploads || []).map(item => {
            const hours = data.mediaHours?.find(h => h.date === item.date)?.hours || 0;
            cumulativeVideos += item.video || 0;
            cumulativeHours += hours;
            const dayOfWeek = getDayOfWeek(item.date);
            const isWeekend = dayOfWeek === 'Saturday' || dayOfWeek === 'Sunday';

            return [
                item.date,
                dayOfWeek,
                getWeekNumber(item.date),
                item.video || 0,
                item.showreel || 0,
                (item.video || 0) + (item.showreel || 0),
                Math.round(hours * 100) / 100,
                cumulativeVideos,
                Math.round(cumulativeHours * 10) / 10,
                isWeekend ? 'Yes' : 'No'
            ];
        });

        // Add totals row
        const totalVideos = (data.mediaUploads || []).reduce((sum, item) => sum + (item.video || 0), 0);
        const totalShowreels = (data.mediaUploads || []).reduce((sum, item) => sum + (item.showreel || 0), 0);
        const totalHours = (data.mediaHours || []).reduce((sum, item) => sum + (item.hours || 0), 0);

        dailyRows.push([
            'TOTAL',
            '',
            '',
            totalVideos,
            totalShowreels,
            totalVideos + totalShowreels,
            Math.round(totalHours * 10) / 10,
            '',
            '',
            ''
        ]);

        // Add averages row
        const uploadDaysCount = (data.mediaUploads || []).length || 1;
        const hoursDaysCount = (data.mediaHours || []).length || 1;
        dailyRows.push([
            'AVERAGE',
            '',
            '',
            Math.round(totalVideos / uploadDaysCount * 10) / 10,
            Math.round(totalShowreels / uploadDaysCount * 10) / 10,
            Math.round((totalVideos + totalShowreels) / uploadDaysCount * 10) / 10,
            Math.round(totalHours / hoursDaysCount * 10) / 10,
            '',
            '',
            ''
        ]);

        const ws3 = XLSX.utils.aoa_to_sheet([dailyHeaders, ...dailyRows]);
        ws3['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 15 }, { wch: 10 }, { wch: 18 }, { wch: 18 }, { wch: 10 }];
        XLSX.utils.book_append_sheet(workbook, ws3, 'Daily_Upload_Data');

        // Sheet 4: Active Users (Enhanced)
        const userHeaders = ['Rank', 'User Name', 'Role', 'Uploads', 'Last Active', 'Days Since Active', 'Total Views', 'Avg Views/Upload', 'Contribution %', 'Status'];

        const activeUsersList = data.activeUsers || [];
        const totalUploads = activeUsersList.reduce((sum, user) => sum + (user.uploads || 0), 0);
        const sortedUsers = [...activeUsersList].sort((a, b) => (b.uploads || 0) - (a.uploads || 0));

        const userRows = sortedUsers.map((user, index) => {
            const daysSinceActive = differenceInDays(new Date(), parseISO(user.lastActive));
            const avgViewsPerUpload = (user.uploads || 0) > 0 ? ((user.totalViews || 0) / (user.uploads || 1)).toFixed(1) : '0';
            const contribution = totalUploads > 0 ? (((user.uploads || 0) / totalUploads) * 100).toFixed(1) : '0';
            const status = daysSinceActive <= 7 ? 'Very Active' : daysSinceActive <= 14 ? 'Active' : 'Moderate';

            return [
                index + 1,
                user.user || 'Unknown',
                user.role || 'User',
                user.uploads || 0,
                user.lastActive || '',
                daysSinceActive,
                user.totalViews || 0,
                avgViewsPerUpload,
                `${contribution}%`,
                status
            ];
        });

        // Add totals row
        const totalViews = activeUsersList.reduce((sum: number, user) => sum + (user.totalViews || 0), 0);
        const usersCount = activeUsersList.length || 1;
        userRows.push([
            '',
            'TOTAL',
            '',
            totalUploads,
            '',
            '',
            totalViews,
            '',
            '100%',
            ''
        ]);

        // Add averages row
        userRows.push([
            '',
            'AVERAGE',
            '',
            Math.round(totalUploads / usersCount * 10) / 10,
            '',
            '',
            Math.round(totalViews / usersCount),
            totalUploads > 0 ? Math.round(totalViews / totalUploads * 10) / 10 : 0,
            '',
            ''
        ]);

        const ws4 = XLSX.utils.aoa_to_sheet([userHeaders, ...userRows]);
        ws4['!cols'] = [{ wch: 6 }, { wch: 18 }, { wch: 18 }, { wch: 10 }, { wch: 12 }, { wch: 16 }, { wch: 12 }, { wch: 16 }, { wch: 15 }, { wch: 12 }];
        XLSX.utils.book_append_sheet(workbook, ws4, 'Active_Users');

        // Sheet 5: Top Channels (Enhanced)
        const channelHeaders = ['Rank', 'Channel Name', 'Hours', 'Percentage', 'Videos (Est.)', 'Showreels (Est.)', 'Avg Hours/Upload'];
        const topChannels = data.topChannels || [];
        const totalChannelHours = topChannels.reduce((sum, ch) => sum + (ch.hours || 0), 0);

        const channelRows = topChannels.map((channel, index) => {
            const channelHours = channel.hours || 0;
            const percentage = totalChannelHours > 0 ? ((channelHours / totalChannelHours) * 100).toFixed(1) : '0';
            // Estimate videos and showreels based on hours (assuming 0.42 hours per video)
            const estimatedUploads = channelHours > 0 ? Math.round(channelHours / 0.42) : 0;
            const estimatedVideos = Math.round(estimatedUploads * 0.93); // 93% videos
            const estimatedShowreels = Math.round(estimatedUploads * 0.07); // 7% showreels
            const avgHoursPerUpload = estimatedUploads > 0 ? (channelHours / estimatedUploads).toFixed(2) : '0.00';

            return [
                index + 1,
                channel.name || 'Unknown',
                Math.round(channelHours * 100) / 100,
                `${percentage}%`,
                estimatedVideos,
                estimatedShowreels,
                avgHoursPerUpload
            ];
        });

        // Add totals row
        channelRows.push([
            '',
            'TOTAL',
            Math.round(totalChannelHours * 100) / 100,
            '100%',
            '',
            '',
            ''
        ]);

        const ws5 = XLSX.utils.aoa_to_sheet([channelHeaders, ...channelRows]);
        ws5['!cols'] = [{ wch: 6 }, { wch: 30 }, { wch: 10 }, { wch: 12 }, { wch: 15 }, { wch: 18 }, { wch: 16 }];
        XLSX.utils.book_append_sheet(workbook, ws5, 'Top_Channels');

        // Sheet 6: Media Type Breakdown (Enhanced)
        const mediaTypeHeaders = ['Rank', 'Media Type', 'Count', 'Percentage', 'Total Hours (Est.)', 'Avg Hours/Item', 'Total Views (Est.)', 'Avg Views/Item'];
        const mediaTypes = data.mediaTypes || [];
        const totalMediaCount = mediaTypes.reduce((sum, mt) => sum + (mt.value || 0), 0);
        const sortedMediaTypes = [...mediaTypes].sort((a, b) => (b.value || 0) - (a.value || 0));

        const mediaTypeRows = sortedMediaTypes.map((type, index) => {
            const typeValue = type.value || 0;
            const percentage = totalMediaCount > 0 ? ((typeValue / totalMediaCount) * 100).toFixed(1) : '0';
            // Estimate hours (0.42 hours per video, 0.61 per showreel)
            const avgHoursPerItem = type.name === 'Showreel' ? 0.61 : 0.42;
            const totalHoursEst = Math.round(typeValue * avgHoursPerItem * 10) / 10;
            // Estimate views (37 views per video, 92.5 per showreel)
            const avgViewsPerItem = type.name === 'Showreel' ? 92.5 : 37.0;
            const totalViewsEst = Math.round(typeValue * avgViewsPerItem);

            return [
                index + 1,
                type.name || 'Unknown',
                typeValue,
                `${percentage}%`,
                totalHoursEst,
                avgHoursPerItem.toFixed(2),
                totalViewsEst,
                avgViewsPerItem.toFixed(1)
            ];
        });

        // Add totals row
        const totalHoursEst = mediaTypeRows.reduce((sum, row) => sum + (typeof row[4] === 'number' ? row[4] : 0), 0);
        const totalViewsEst = mediaTypeRows.reduce((sum, row) => sum + (typeof row[6] === 'number' ? row[6] : 0), 0);

        mediaTypeRows.push([
            '',
            'TOTAL',
            totalMediaCount,
            '100%',
            Math.round(totalHoursEst * 10) / 10,
            '',
            totalViewsEst,
            ''
        ]);

        const ws6 = XLSX.utils.aoa_to_sheet([mediaTypeHeaders, ...mediaTypeRows]);
        ws6['!cols'] = [{ wch: 6 }, { wch: 15 }, { wch: 10 }, { wch: 12 }, { wch: 18 }, { wch: 15 }, { wch: 18 }, { wch: 15 }];
        XLSX.utils.book_append_sheet(workbook, ws6, 'Media_Types');

        // Generate filename - sanitize to remove invalid characters
        const sanitizedCustomer = filters.customerType.replace(/[^a-zA-Z0-9_-]/g, '_');
        const filename = `Report_${sanitizedCustomer}_${filters.startDate}_to_${filters.endDate}.xlsx`;

        // Write file
        XLSX.writeFile(workbook, filename);
    } catch (error) {
        console.error('Error exporting to Excel:', error);
        throw new Error('Failed to export Excel file. Please try again.');
    }
}

/**
 * Export dashboard data to CSV format (multiple files)
 */
export async function exportToCSV(data: DashboardData, filters: DashboardFilters) {
    try {
        const csvFiles: { name: string; content: string }[] = [];

        // Calculate additional metrics
        const startDate = parseISO(filters.startDate);
        const endDate = parseISO(filters.endDate);
        const totalDays = differenceInDays(endDate, startDate) + 1;
        const totalDataPoints = data.mediaUploads?.length || 0;
        const dataCompleteness = totalDays > 0 ? ((totalDataPoints / totalDays) * 100).toFixed(1) : '0';

    // File 1: Export Info (Enhanced)
    const exportInfo = [
        ['Field', 'Value'],
        ['Report_Title', 'Report Analytics Dashboard'],
        ['Export_DateTime', format(new Date(), 'dd-MM-yyyy HH:mm:ss')],
        ['Date_Range_Start', filters.startDate],
        ['Date_Range_End', filters.endDate],
        ['Total_Days', totalDays],
        ['Customer_Filter', filters.customerType],
        ['Media_Type_Filter', filters.mediaType],
        ['Total_Data_Points', totalDataPoints],
        ['Data_Completeness', `${dataCompleteness}%`],
        ['Dashboard_Version', '1.0.0'],
    ];
    csvFiles.push({
        name: 'export_info.csv',
        content: exportInfo.map(row => row.join(',')).join('\n')
    });

    // File 2: Summary Metrics (Enhanced)
    const calculatePreviousValue = (current: number, changePercent: number) => {
        if (changePercent === 0) return current;
        return Math.round(current / (1 + changePercent / 100));
    };

    const summaryData = [
        ['Metric_Name', 'Current_Value', 'Previous_Value', 'Absolute_Change', 'Change_Percent', 'Trend', 'Comparison_Period'],
        [
            'Total_Videos_Uploaded',
            data.metrics.totalVideos.count,
            calculatePreviousValue(data.metrics.totalVideos.count, data.metrics.totalVideos.changePercent),
            data.metrics.totalVideos.count - calculatePreviousValue(data.metrics.totalVideos.count, data.metrics.totalVideos.changePercent),
            data.metrics.totalVideos.changePercent,
            data.metrics.totalVideos.changePercent > 0 ? 'up' : data.metrics.totalVideos.changePercent < 0 ? 'down' : 'stable',
            'vs_previous_period'
        ],
        [
            'Total_Hours_of_Media',
            data.metrics.totalHours.hours,
            calculatePreviousValue(data.metrics.totalHours.hours, data.metrics.totalHours.changePercent),
            data.metrics.totalHours.hours - calculatePreviousValue(data.metrics.totalHours.hours, data.metrics.totalHours.changePercent),
            data.metrics.totalHours.changePercent,
            data.metrics.totalHours.changePercent > 0 ? 'up' : data.metrics.totalHours.changePercent < 0 ? 'down' : 'stable',
            'vs_previous_period'
        ],
        [
            'Total_Showreels',
            data.metrics.totalShowreels.count,
            calculatePreviousValue(data.metrics.totalShowreels.count, data.metrics.totalShowreels.changePercent),
            data.metrics.totalShowreels.count - calculatePreviousValue(data.metrics.totalShowreels.count, data.metrics.totalShowreels.changePercent),
            data.metrics.totalShowreels.changePercent,
            data.metrics.totalShowreels.changePercent > 0 ? 'up' : data.metrics.totalShowreels.changePercent < 0 ? 'down' : 'stable',
            'vs_previous_period'
        ],
        [
            'Active_Users_30d',
            data.metrics.activeUsers.count,
            data.metrics.activeUsers.count,
            0,
            0,
            'stable',
            'vs_previous_period'
        ],
        [
            'Avg_Views_per_Media',
            data.metrics.avgViewsPerMedia.average.toFixed(1),
            '-',
            '-',
            data.metrics.avgViewsPerMedia.engagementPercent,
            'up',
            'Engagement_Rate'
        ],
    ];
    csvFiles.push({
        name: 'summary_metrics.csv',
        content: summaryData.map(row => row.join(',')).join('\n')
    });

        // File 3: Daily Upload Data (Enhanced)
        let cumulativeVideos = 0;
        let cumulativeHours = 0;

        const dailyData = [
            ['Date', 'Day_of_Week', 'Week_Number', 'Videos', 'Showreels', 'Total_Uploads', 'Hours', 'Cumulative_Videos', 'Cumulative_Hours', 'Is_Weekend'],
            ...(data.mediaUploads || []).map(item => {
                const hours = data.mediaHours?.find(h => h.date === item.date)?.hours || 0;
                cumulativeVideos += item.video || 0;
                cumulativeHours += hours;
            const dayOfWeek = getDayOfWeek(item.date);
            const isWeekend = dayOfWeek === 'Saturday' || dayOfWeek === 'Sunday';

                return [
                    item.date,
                    dayOfWeek,
                    getWeekNumber(item.date),
                    item.video || 0,
                    item.showreel || 0,
                    (item.video || 0) + (item.showreel || 0),
                    Math.round(hours * 100) / 100,
                    cumulativeVideos,
                    Math.round(cumulativeHours * 10) / 10,
                    isWeekend ? 'Yes' : 'No'
                ];
            })
        ];
        csvFiles.push({
            name: 'daily_upload_data.csv',
            content: dailyData.map(row => row.join(',')).join('\n')
        });

        // File 4: Active Users (Enhanced)
        const activeUsers = data.activeUsers || [];
        const totalUploads = activeUsers.reduce((sum, user) => sum + (user.uploads || 0), 0);
        const sortedUsers = [...activeUsers].sort((a, b) => (b.uploads || 0) - (a.uploads || 0));

        const userData = [
            ['Rank', 'User_Name', 'Role', 'Uploads', 'Last_Active', 'Days_Since_Active', 'Total_Views', 'Avg_Views_per_Upload', 'Contribution_Percent', 'Status'],
            ...sortedUsers.map((user, index) => {
                const daysSinceActive = differenceInDays(new Date(), parseISO(user.lastActive));
                const avgViewsPerUpload = (user.uploads || 0) > 0 ? ((user.totalViews || 0) / (user.uploads || 1)).toFixed(1) : '0';
                const contribution = totalUploads > 0 ? (((user.uploads || 0) / totalUploads) * 100).toFixed(1) : '0';
                const status = daysSinceActive <= 7 ? 'Very_Active' : daysSinceActive <= 14 ? 'Active' : 'Moderate';

                return [
                    index + 1,
                    user.user || 'Unknown',
                    user.role || 'User',
                    user.uploads || 0,
                    user.lastActive || '',
                    daysSinceActive,
                    user.totalViews || 0,
                    avgViewsPerUpload,
                    contribution,
                    status
                ];
            })
        ];
        csvFiles.push({
            name: 'active_users.csv',
            content: userData.map(row => row.join(',')).join('\n')
        });

        // File 5: Top Channels (Enhanced)
        const topChannels = data.topChannels || [];
        const totalChannelHours = topChannels.reduce((sum, ch) => sum + (ch.hours || 0), 0);

        const channelData = [
            ['Rank', 'Channel_Name', 'Hours', 'Percentage', 'Videos_Est', 'Showreels_Est', 'Avg_Hours_per_Upload'],
            ...topChannels.map((channel, index) => {
                const channelHours = channel.hours || 0;
                const percentage = totalChannelHours > 0 ? ((channelHours / totalChannelHours) * 100).toFixed(1) : '0';
                const estimatedUploads = channelHours > 0 ? Math.round(channelHours / 0.42) : 0;
                const estimatedVideos = Math.round(estimatedUploads * 0.93);
                const estimatedShowreels = Math.round(estimatedUploads * 0.07);
                const avgHoursPerUpload = estimatedUploads > 0 ? (channelHours / estimatedUploads).toFixed(2) : '0.00';

                return [
                    index + 1,
                    channel.name || 'Unknown',
                    Math.round(channelHours * 100) / 100,
                    percentage,
                    estimatedVideos,
                    estimatedShowreels,
                    avgHoursPerUpload
                ];
            })
        ];
        csvFiles.push({
            name: 'top_channels.csv',
            content: channelData.map(row => row.join(',')).join('\n')
        });

        // File 6: Media Type Breakdown (Enhanced)
        const mediaTypes = data.mediaTypes || [];
        const totalMediaCount = mediaTypes.reduce((sum, mt) => sum + (mt.value || 0), 0);
        const sortedMediaTypes = [...mediaTypes].sort((a, b) => (b.value || 0) - (a.value || 0));

        const mediaTypeData = [
            ['Rank', 'Media_Type', 'Count', 'Percentage', 'Total_Hours_Est', 'Avg_Hours_per_Item', 'Total_Views_Est', 'Avg_Views_per_Item'],
            ...sortedMediaTypes.map((type, index) => {
                const typeValue = type.value || 0;
                const percentage = totalMediaCount > 0 ? ((typeValue / totalMediaCount) * 100).toFixed(1) : '0';
                const avgHoursPerItem = type.name === 'Showreel' ? 0.61 : 0.42;
                const totalHoursEst = Math.round(typeValue * avgHoursPerItem * 10) / 10;
                const avgViewsPerItem = type.name === 'Showreel' ? 92.5 : 37.0;
                const totalViewsEst = Math.round(typeValue * avgViewsPerItem);

                return [
                    index + 1,
                    type.name || 'Unknown',
                    typeValue,
                    percentage,
                    totalHoursEst,
                    avgHoursPerItem.toFixed(2),
                    totalViewsEst,
                    avgViewsPerItem.toFixed(1)
                ];
            })
        ];
        csvFiles.push({
            name: 'media_type_breakdown.csv',
            content: mediaTypeData.map(row => row.join(',')).join('\n')
    });

        // Create and download individual CSV files with a small delay between each
        csvFiles.forEach((file, index) => {
            setTimeout(() => {
                const blob = new Blob([file.content], { type: 'text/csv;charset=utf-8;' });
                const link = document.createElement('a');
                const url = URL.createObjectURL(blob);
                link.setAttribute('href', url);
                link.setAttribute('download', file.name);
                link.style.visibility = 'hidden';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            }, index * 300); // 300ms delay between downloads
        });
    } catch (error) {
        console.error('Error exporting to CSV:', error);
        throw new Error('Failed to export CSV files. Please try again.');
    }
}
