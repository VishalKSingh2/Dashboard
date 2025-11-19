# Date-Wise Data Implementation

## Overview
This document describes the implementation of date-wise (daily) data with adaptive display aggregation for the Report Analytics Dashboard.

## What Changed

### 1. Data Structure (lib/types.ts)
- Changed `MediaUploadData` from `month: string` to `date: string` (ISO format)
- Changed `MediaHoursData` from `month: string` to `date: string` (ISO format)
- Added `DailyData` interface for internal daily data structure

### 2. Data Aggregation Utility (lib/dataAggregation.ts) - NEW FILE
Created adaptive display logic that:
- Determines appropriate granularity based on date range:
  - **1-30 days**: Daily display
  - **31-90 days**: Weekly aggregation
  - **91-365 days**: Monthly aggregation
- Aggregates daily data into weekly/monthly buckets when needed
- Formats date labels appropriately for each granularity
- Maintains daily precision in the underlying data

### 3. Mock Data Generator (lib/mockData.ts)
Completely rewritten to:
- Generate 365 days of realistic daily data with:
  - Growth trends over the year
  - Weekend vs weekday variations
  - Random fluctuations for realism
- Filter data by selected date range
- Calculate period-over-period comparisons:
  - Current period: Sum of selected date range
  - Previous period: Equal-length period immediately before
  - Change %: Accurate comparison between periods
- Apply filter multipliers (customer type, media type)
- Aggregate data for display based on date range length

### 4. Chart Components Updated

#### MediaUploadsChart.tsx
- Now uses `date` field instead of `month`
- Dynamically formats x-axis labels based on data length
- Shows full date in tooltips
- Hides dots when there are many data points (>30)
- Dynamic Y-axis scaling based on actual data

#### MediaHoursChart.tsx
- Now uses `date` field instead of `month`
- Changed title from "Media Hours by Month" to "Media Hours by Date"
- Dynamically formats x-axis labels based on data length
- Shows full date in tooltips
- Dynamic Y-axis scaling based on actual data

## How It Works

### Data Flow

```
User selects date range (e.g., Jan 1 - Mar 31)
         ↓
generateMockData() called with filters
         ↓
Generate 365 days of daily data for 2025
         ↓
Filter to selected date range (Jan 1 - Mar 31 = 90 days)
         ↓
Calculate previous period (Oct 3 - Dec 31 = 90 days)
         ↓
Sum daily values for metrics and calculate % change
         ↓
Determine display granularity (90 days = weekly)
         ↓
Aggregate daily data into weekly buckets
         ↓
Return aggregated data to charts
         ↓
Charts display weekly bars/lines with daily precision in tooltips
```

### Example Scenarios

#### Scenario 1: 7-Day Range
- User selects: Jan 1 - Jan 7
- Display: 7 individual days (Mon, Tue, Wed, etc.)
- Comparison: Dec 25 - Dec 31 (previous 7 days)
- Chart: Shows all 7 days with dots on line chart

#### Scenario 2: 60-Day Range
- User selects: Jan 1 - Mar 1
- Display: 60 individual days (but labels may be sparse)
- Comparison: Nov 2 - Dec 31 (previous 60 days)
- Chart: Shows daily data, hides dots, smart label spacing

#### Scenario 3: 90-Day Range
- User selects: Jan 1 - Mar 31
- Display: ~13 weekly buckets
- Comparison: Oct 3 - Dec 31 (previous 90 days)
- Chart: Shows weekly aggregated bars/lines

#### Scenario 4: 365-Day Range
- User selects: Jan 1 - Dec 31
- Display: 12 monthly buckets
- Comparison: Previous year (if available)
- Chart: Shows monthly aggregated data

## Benefits

✅ **Precision**: Daily data always available for accurate calculations
✅ **Readability**: Charts automatically adapt to avoid clutter
✅ **Accurate Trends**: Period comparisons use equal-length periods
✅ **Realistic Data**: Weekday/weekend patterns, growth trends, randomness
✅ **Flexible**: Easy to adjust granularity thresholds
✅ **Performance**: Efficient aggregation only when needed

## Testing

To test different scenarios:

1. **Daily View**: Select a 1-7 day range
2. **Weekly View**: Select a 31-90 day range
3. **Monthly View**: Select a 91-365 day range
4. **Filters**: Try different customer types and media types
5. **Metrics**: Verify period-over-period changes are accurate

## Future Enhancements

- Add user preference for granularity override
- Implement caching for generated daily data
- Add more sophisticated patterns (holidays, seasonality)
- Support multiple years of data
- Add drill-down capability (click monthly → see weekly → see daily)
