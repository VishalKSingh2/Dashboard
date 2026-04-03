# Report Analytics Dashboard — Quick Guide

A simple, human-friendly guide to understand how this project works, what each file does, and how everything connects.

---

## What Is This?

This is an **internal analytics dashboard + report generator** built for Account and Product Management teams. It does two things:

1. **Dashboard** — Shows interactive charts and metrics (uploads, hours, top channels, media types) with filters.
2. **Report Generator** — Lets you generate large Excel reports (millions of rows) that stream directly into a ZIP file, without crashing the server's memory.

### Tech Stack

| What          | Technology                          |
|---------------|-------------------------------------|
| Framework     | Next.js 16 (App Router), React 19  |
| Language      | TypeScript                          |
| Styling       | Tailwind CSS                        |
| Charts        | Recharts                            |
| Data Source    | SQL Server (where the real data lives) |
| Job Queue     | MongoDB (stores jobs + generated files) |
| File Storage  | MongoDB GridFS (stores generated ZIPs) |
| Excel Writer  | ExcelJS (streaming mode)            |
| Compression   | Archiver (ZIP)                      |

---

## How To Run

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build && npm start
```

You'll need a `.env.local` file with these:

```env
DB_SERVER=your-sql-server
DB_PORT=1433
DB_DATABASE=your-database
DB_USER=your-username
DB_PASSWORD=your-password
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB_NAME=report_dashboard
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

---

## Pages (What the User Sees)

### `/dashboard` — The Main Dashboard

This is where you land. It shows:
- **4 metric cards** at the top (total videos, total hours, audio files, avg views)
- **Line charts** showing uploads and hours over time
- **Donut chart** breaking down media types
- **Bar chart** showing top channels by hours

You can filter by **customer type**, **media type**, and **date range** using the controls at the top.

**Files to look at:**
- [app/dashboard/page.tsx](app/dashboard/page.tsx) — The main page that ties everything together
- [app/dashboard/components/DashboardHeader.tsx](app/dashboard/components/DashboardHeader.tsx) — The filter bar at the top
- [app/dashboard/components/MetricsGrid.tsx](app/dashboard/components/MetricsGrid.tsx) — The 4 KPI cards
- [app/dashboard/components/MetricCard.tsx](app/dashboard/components/MetricCard.tsx) — A single KPI card
- [components/ui/DynamicCharts.tsx](components/ui/DynamicCharts.tsx) — All the chart components (lazy-loaded)

### `/report-jobs` — Report Jobs Page

Shows the full history of all report generation jobs. Each job shows its status, progress, and a download link when done. Updates in **real-time** using Server-Sent Events (SSE).

**Files to look at:**
- [app/report-jobs/page.tsx](app/report-jobs/page.tsx) — The jobs page
- [components/ui/ReportJobsPanel.tsx](components/ui/ReportJobsPanel.tsx) — The panel that lists jobs and listens for live updates

### `/` — Home

Just redirects you to `/dashboard`.

---

## How the Dashboard Data Flows

Here's what happens when you open the dashboard:

```
You open /dashboard
  → Page loads with filters from the URL
  → Browser calls GET /api/dashboard-db with your filters
  → Server runs multiple SQL queries in parallel (metrics, daily data, top channels)
  → Results come back as JSON
  → Recharts renders the charts
  → Charts lazy-load as you scroll down (for performance)
```

**Files to look at:**
- [app/api/dashboard-db/route.ts](app/api/dashboard-db/route.ts) — The API that runs SQL queries and returns chart data
- [app/api/filters/route.ts](app/api/filters/route.ts) — The API that fetches dropdown options (customers, media types)

---

## How Report Generation Works (The Big One)

This is the most complex part. Here's the full flow in plain English:

### Step 1: You Click "Advanced Report"

A modal pops up where you pick which sheets you want (Videos, Transcriptions, Showreels, Redactions) and a date range.

**File:** [components/ui/AdvancedDownloadButton.tsx](components/ui/AdvancedDownloadButton.tsx)

### Step 2: Job Gets Queued

When you click "Generate", the browser sends a POST to `/api/queue-report`. This creates a new job in MongoDB with status `pending` and gives you back a `jobId`.

**Files:**
- [app/api/queue-report/route.ts](app/api/queue-report/route.ts) — Creates the job
- [lib/jobs/jobStore.ts](lib/jobs/jobStore.ts) — The code that talks to MongoDB to create/update/fetch jobs

### Step 3: Worker Picks Up the Job

Right after queuing, the server fires off a request to `/api/process-jobs`. This worker:
1. **Claims** the next pending job atomically (so two workers can't grab the same job)
2. Starts the streaming report pipeline

**File:** [app/api/process-jobs/route.ts](app/api/process-jobs/route.ts)

### Step 4: The Streaming Pipeline

This is where the magic happens. The report generator creates a **streaming pipeline** that looks like this:

```
SQL Server (rows stream out one by one)
  → Row Formatter (converts dates, maps columns)
  → ExcelJS (writes each row to an .xlsx worksheet)
  → Archiver (wraps worksheets into a .zip file)
  → GridFS (saves the .zip directly into MongoDB)
```

**Nothing is held in memory.** Rows flow through like water in a pipe. This is how it handles millions of rows without crashing.

If a single sheet exceeds 500,000 rows, it automatically splits into "Part 1", "Part 2", etc.

**Files:**
- [lib/reporting/reportGenerator.ts](lib/reporting/reportGenerator.ts) — Orchestrates the entire pipeline
- [lib/reporting/queryDefinitions.ts](lib/reporting/queryDefinitions.ts) — The SQL queries for each sheet type
- [lib/reporting/excelStreamWriter.ts](lib/reporting/excelStreamWriter.ts) — Streams rows into Excel files
- [lib/reporting/rowFormatters.ts](lib/reporting/rowFormatters.ts) — Converts raw SQL rows into clean Excel rows

### Step 5: Live Progress Updates

While the report generates, your browser has an SSE (Server-Sent Events) connection open to `/api/job-status/[jobId]`. Every 2 seconds, the server checks MongoDB for the latest progress and sends it to your browser. You see a progress bar, current sheet name, and row count updating in real-time.

**File:** [app/api/job-status/[jobId]/route.ts](app/api/job-status/[jobId]/route.ts)

### Step 6: Download

When the job finishes, the progress panel shows a download button. Clicking it hits `/api/download/[fileId]`, which streams the ZIP file from MongoDB GridFS to your browser.

**File:** [app/api/download/[fileId]/route.ts](app/api/download/[fileId]/route.ts)

---

## Database Connections

### SQL Server (Where the Data Lives)

All the real analytics data (videos, transcriptions, showreels, redactions, customers) lives in SQL Server. The app connects using a connection pool.

**Key settings:** Max 20 connections, 10-minute query timeout (for big reports), health checks, auto-reconnect.

**File:** [lib/db/sqlServer.ts](lib/db/sqlServer.ts)

### MongoDB (Job Queue + File Storage)

MongoDB does two things:
1. **Job queue** — Stores job records (status, progress, results)
2. **GridFS** — Stores the generated ZIP files (can handle files larger than 16MB)

**Files:**
- [lib/db/mongoClient.ts](lib/db/mongoClient.ts) — MongoDB connection manager
- [lib/db/gridfs.ts](lib/db/gridfs.ts) — Upload/download helpers for GridFS

### Query Cache

Dashboard queries are cached in memory for 60 seconds so repeated page loads don't hammer the database.

**File:** [lib/db/queryCache.ts](lib/db/queryCache.ts)

---

## Folder Structure Cheat Sheet

```
app/                          ← Next.js App Router (pages + API routes)
  dashboard/                  ← Dashboard page + its components
  report-jobs/                ← Report jobs page
  api/                        ← All backend API routes
    queue-report/             ← POST: create a new report job
    process-jobs/             ← POST: worker that processes pending jobs
    generate-report/          ← POST: sync report generation (alternative)
    job-status/[jobId]/       ← GET: SSE stream for live progress
    job-logs/                 ← GET: fetch job history
    download/[fileId]/        ← GET: download generated file
    dashboard-db/             ← GET: dashboard chart data
    filters/                  ← GET: filter dropdown options
    report-estimate/          ← POST: estimate row counts before generating

components/ui/                ← Shared UI components (buttons, modals, panels)

lib/                          ← Core business logic
  db/                         ← Database connections (SQL Server, MongoDB, GridFS)
  jobs/                       ← Job queue logic (create, claim, update, types)
  reporting/                  ← Report generation (streaming pipeline, queries, formatters)
  types/                      ← TypeScript type definitions
  utils/                      ← Helper functions (dates, formatting, compression)
```

---

## File-by-File Reference

| File | What It Does |
|------|-------------|
| `middleware.ts` | Adds caching and compression headers to API responses |
| `next.config.ts` | Next.js settings (React Compiler, optimized imports, security headers) |
| `SQL_QUERY.sql` | Sample SQL queries for debugging or reference |
| `app/page.tsx` | Home page — redirects to `/dashboard` |
| `app/layout.tsx` | Root layout — wraps everything with the navbar |
| `app/globals.css` | Global styles (Tailwind) |
| **Dashboard** | |
| `app/dashboard/page.tsx` | Main dashboard page — fetches data, renders charts |
| `app/dashboard/components/DashboardHeader.tsx` | Filter controls (customer, media type, date range) |
| `app/dashboard/components/MetricsGrid.tsx` | The 4 metric cards at the top |
| `app/dashboard/components/MetricCard.tsx` | A single metric card with icon and trend |
| `app/dashboard/components/MediaUploadsChart.tsx` | Uploads over time chart |
| `app/dashboard/components/MediaHoursChart.tsx` | Hours over time chart |
| `app/dashboard/components/MediaTypeChart.tsx` | Media type donut chart |
| `app/dashboard/components/TopChannelsChart.tsx` | Top channels bar chart |
| `app/dashboard/components/TimeRangeSelector.tsx` | Quick date range buttons |
| **Report Jobs** | |
| `app/report-jobs/page.tsx` | Full-page job history with real-time updates |
| `components/ui/ReportJobsPanel.tsx` | Lists all jobs, listens for SSE progress events |
| `components/ui/AdvancedDownloadButton.tsx` | "Advanced Report" modal — pick sheets, queue job |
| **API Routes** | |
| `app/api/dashboard-db/route.ts` | Returns dashboard metrics + chart data from SQL |
| `app/api/filters/route.ts` | Returns filter options (customers, media types) |
| `app/api/queue-report/route.ts` | Creates a new report job in MongoDB |
| `app/api/process-jobs/route.ts` | Worker: picks up and processes pending jobs |
| `app/api/generate-report/route.ts` | Synchronous report generation (non-queued) |
| `app/api/job-status/[jobId]/route.ts` | SSE endpoint — sends live job progress to browser |
| `app/api/job-logs/route.ts` | Returns job history or a specific job's details |
| `app/api/download/[fileId]/route.ts` | Streams a file from GridFS to the browser |
| `app/api/report-estimate/route.ts` | Estimates how many rows a report will have |
| **Database Layer** | |
| `lib/db/sqlServer.ts` | SQL Server connection pool with streaming support |
| `lib/db/mongoClient.ts` | MongoDB connection (singleton, auto-reconnect) |
| `lib/db/gridfs.ts` | GridFS helpers (upload/download large files) |
| `lib/db/queryCache.ts` | In-memory cache for SQL queries (60s TTL) |
| `lib/db/index.ts` | Exports all DB modules |
| **Job System** | |
| `lib/jobs/jobStore.ts` | CRUD for jobs in MongoDB (create, claim, update, fetch) |
| `lib/jobs/jobTypes.ts` | TypeScript types for jobs, statuses, phases, SSE events |
| `lib/jobs/index.ts` | Exports job modules |
| **Reporting Engine** | |
| `lib/reporting/reportGenerator.ts` | The brain — orchestrates SQL → Excel → ZIP → GridFS |
| `lib/reporting/queryDefinitions.ts` | SQL queries for each report sheet |
| `lib/reporting/excelStreamWriter.ts` | Streams rows into Excel with auto-split at 500K |
| `lib/reporting/rowFormatters.ts` | Maps raw SQL columns to clean Excel columns |
| `lib/reporting/index.ts` | Exports reporting modules |
| **Shared UI** | |
| `app/components/Navbar.tsx` | Top navigation bar |
| `components/ui/Button.tsx` | Reusable button component |
| `components/ui/Select.tsx` | Dropdown select component |
| `components/ui/SearchableSelect.tsx` | Searchable dropdown (for customer filter) |
| `components/ui/DatePicker.tsx` | Date picker component |
| `components/ui/LazyChart.tsx` | Lazy-loads charts when they scroll into view |
| `components/ui/ChartSkeleton.tsx` | Loading skeleton for charts |
| **Utilities** | |
| `lib/utils/dateUtils.ts` | Date formatting helpers |
| `lib/utils/formatting.ts` | Number/string formatting |
| `lib/utils/compression.ts` | Compression utilities |
| `lib/utils/dataAggregation.ts` | Data grouping/aggregation helpers |
| `lib/utils/recharts.ts` | Recharts helper utilities |
| `lib/types/dashboard.ts` | TypeScript types for dashboard data |

---

## Key Concepts in Simple Terms

### Streaming Pipeline
Instead of loading 1 million rows into memory, converting them to Excel, and then saving — we let each row **flow through** one step at a time. Like a factory conveyor belt: each station does its job on each item and passes it along. This keeps memory usage flat no matter how big the report is.

### MongoDB GridFS
Normal MongoDB documents can only be 16MB. GridFS is MongoDB's way of storing big files — it splits them into 255KB chunks. We use it to store generated ZIP files that can be hundreds of MBs.

### Server-Sent Events (SSE)
A one-way real-time connection from server to browser. The browser opens a connection and the server pushes updates whenever it wants. We use this to show live progress (progress %, current sheet, rows done) while a report generates.

### Atomic Job Claiming
When the worker looks for jobs to process, it uses MongoDB's `findOneAndUpdate` — this finds a pending job AND marks it as "processing" in one atomic operation. Even if two workers run at the same time, they can never grab the same job.

### Query Cache
Dashboard queries are cached for 60 seconds. If you refresh the page within a minute, the data comes from memory instead of hitting SQL Server again.

---

## Common Tasks

### "I want to add a new chart to the dashboard"
1. Add your SQL query in `app/api/dashboard-db/route.ts`
2. Create a chart component in `app/dashboard/components/`
3. Add it to `app/dashboard/page.tsx`

### "I want to add a new sheet to the report"
1. Add the SQL query in `lib/reporting/queryDefinitions.ts`
2. Add a row formatter in `lib/reporting/rowFormatters.ts`
3. Add the sheet type to `lib/jobs/jobTypes.ts`
4. Update the sheet selection UI in `components/ui/AdvancedDownloadButton.tsx`

### "I want to change a filter"
1. Update the SQL in `app/api/filters/route.ts` to fetch new options
2. Update `app/dashboard/components/DashboardHeader.tsx` to show the new filter
3. Update `app/api/dashboard-db/route.ts` to apply the filter to queries

### "I want to change how jobs are stored"
Look at `lib/jobs/jobStore.ts` — all MongoDB job operations live there.

### "Something is slow"
- Dashboard slow? Check `lib/db/queryCache.ts` (cache TTL) and the SQL queries in `app/api/dashboard-db/route.ts`
- Report slow? Check `lib/db/sqlServer.ts` (pool size, timeouts) and `lib/reporting/reportGenerator.ts`
- Charts slow to load? They're lazy-loaded via `components/ui/LazyChart.tsx`

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                      BROWSER                            │
│                                                         │
│  /dashboard          /report-jobs        Download       │
│  ┌──────────┐       ┌──────────┐       ┌──────────┐    │
│  │ Charts   │       │ Job List │       │ ZIP File │    │
│  │ Metrics  │       │ Progress │       │          │    │
│  │ Filters  │       │ SSE Live │       │          │    │
│  └────┬─────┘       └────┬─────┘       └────┬─────┘    │
└───────┼──────────────────┼──────────────────┼───────────┘
        │                  │                  │
   GET /api/          GET /api/          GET /api/
   dashboard-db       job-status/[id]    download/[id]
   GET /api/filters   POST /api/         
                      queue-report       
                      POST /api/         
                      process-jobs       
        │                  │                  │
┌───────┼──────────────────┼──────────────────┼───────────┐
│       ▼                  ▼                  ▼           │
│  ┌──────────┐       ┌──────────┐       ┌──────────┐    │
│  │ SQL      │       │ MongoDB  │       │ GridFS   │    │
│  │ Server   │       │ Jobs     │       │ Files    │    │
│  │ (Data)   │       │ (Queue)  │       │ (ZIPs)   │    │
│  └──────────┘       └──────────┘       └──────────┘    │
│                          SERVER                         │
└─────────────────────────────────────────────────────────┘
```

---

*Last updated: March 2026*
