# Testing Guide - Date-Wise Data Implementation

## Quick Test Scenarios

### 1. Test Daily Display (1-7 days)
**Steps:**
1. Open the dashboard
2. Set date range: Jan 1, 2025 - Jan 7, 2025
3. Click "Apply"

**Expected Results:**
- Charts show 7 individual days
- X-axis labels: "Jan 1", "Jan 2", "Jan 3", etc.
- Line chart shows dots on each data point
- Tooltips show full date (e.g., "Jan 1, 2025")
- Metrics show comparison with Dec 25-31, 2024

### 2. Test Daily Display with Many Points (8-30 days)
**Steps:**
1. Set date range: Jan 1, 2025 - Jan 30, 2025
2. Click "Apply"

**Expected Results:**
- Charts show 30 individual days
- X-axis labels may be sparse (smart spacing)
- Line chart hides dots (too many points)
- Bar chart shows individual daily bars
- Tooltips still show full dates
- Metrics compare with Dec 2-31, 2024

### 3. Test Weekly Aggregation (31-90 days)
**Steps:**
1. Set date range: Jan 1, 2025 - Mar 31, 2025
2. Click "Apply"

**Expected Results:**
- Charts show ~13 weekly buckets
- X-axis labels: "Jan 6", "Jan 13", "Jan 20", etc. (week starts)
- Data is aggregated by week
- Tooltips show week start date
- Metrics compare with Oct 3 - Dec 31, 2024 (previous 90 days)

### 4. Test Monthly Aggregation (91-365 days)
**Steps:**
1. Set date range: Jan 1, 2025 - Dec 31, 2025
2. Click "Apply"

**Expected Results:**
- Charts show 12 monthly buckets
- X-axis labels: "Jan", "Feb", "Mar", etc.
- Data is aggregated by month
- Tooltips show month start date
- Metrics compare with previous year (if available)

### 5. Test Filter Combinations

#### Test Customer Type Filter
**Steps:**
1. Set date range: Jan 1 - Jan 31, 2025
2. Select "Enterprise" from customer type
3. Click "Apply"

**Expected Results:**
- All values reduced by ~40% (0.6 multiplier)
- Charts update with filtered data
- Metrics recalculate

#### Test Media Type Filter
**Steps:**
1. Set date range: Jan 1 - Jan 31, 2025
2. Select "Video" from media type
3. Click "Apply"

**Expected Results:**
- Values adjusted by media type multiplier
- Video data emphasized
- Showreel data reduced

### 6. Test Period-Over-Period Comparison

**Steps:**
1. Set date range: Feb 1 - Feb 14, 2025 (14 days)
2. Click "Apply"
3. Note the metric values and % changes

**Expected Results:**
- Current period: Sum of Feb 1-14 daily data
- Previous period: Sum of Jan 18-31 daily data (previous 14 days)
- Change % calculated correctly
- Green arrows for increases, red for decreases

### 7. Test Edge Cases

#### Single Day
**Steps:**
1. Set start and end date to same day: Jan 15, 2025
2. Click "Apply"

**Expected Results:**
- Shows single data point
- Comparison with Jan 14, 2025
- Charts render without errors

#### Very Long Range
**Steps:**
1. Set date range: Jan 1 - Dec 31, 2025 (365 days)
2. Click "Apply"

**Expected Results:**
- Monthly aggregation
- 12 data points
- Smooth rendering
- Accurate totals

## Visual Checks

### Chart Appearance
- [ ] X-axis labels are readable (not overlapping)
- [ ] Y-axis scales appropriately to data
- [ ] Lines/bars are smooth and continuous
- [ ] Colors match design (blue for video, purple for showreel, cyan for hours)
- [ ] Tooltips appear on hover
- [ ] Legends are visible and correct

### Metric Cards
- [ ] Values are realistic and consistent with charts
- [ ] Percentage changes make sense
- [ ] Arrows/status indicators are correct
- [ ] Numbers are formatted properly (commas, decimals)

### Responsive Design
- [ ] Test on mobile (stack vertically)
- [ ] Test on tablet (2-column grid)
- [ ] Test on desktop (full layout)
- [ ] Charts resize properly

## Data Validation

### Check Data Consistency
1. Sum the chart values manually
2. Compare with metric card totals
3. They should match

### Check Realistic Patterns
- [ ] Weekends show lower values than weekdays
- [ ] Growth trend visible over the year
- [ ] Random variations present (not perfectly smooth)
- [ ] No negative values
- [ ] No unrealistic spikes

## Performance Checks

- [ ] Initial load < 2 seconds
- [ ] Filter application < 1 second
- [ ] Charts render smoothly
- [ ] No console errors
- [ ] No memory leaks (check DevTools)

## Common Issues to Watch For

1. **Date parsing errors**: Check browser console
2. **Timezone issues**: Dates should be in local timezone
3. **Aggregation bugs**: Weekly/monthly sums should be accurate
4. **Label overlap**: X-axis labels shouldn't overlap
5. **Missing data**: All date ranges should have data

## Manual Testing Checklist

- [ ] Daily view (1-7 days)
- [ ] Daily view (8-30 days)
- [ ] Weekly aggregation (31-90 days)
- [ ] Monthly aggregation (91-365 days)
- [ ] Customer type filters
- [ ] Media type filters
- [ ] Combined filters
- [ ] Period comparisons
- [ ] Edge cases (single day, full year)
- [ ] Responsive design
- [ ] Data consistency
- [ ] Performance

## Automated Testing (Future)

Consider adding:
- Unit tests for aggregation functions
- Integration tests for data generation
- E2E tests for user flows
- Visual regression tests for charts
