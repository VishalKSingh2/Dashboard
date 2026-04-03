# Report Analytics Dashboard

A Next.js dashboard for Account and Product Management teams — provides visual insights via interactive charts and generates large-scale Excel reports streamed directly into MongoDB GridFS.

## Features

- Interactive charts (line, bar, donut, horizontal bar)
- Key performance metrics with trend indicators
- Advanced filtering (customer type, media type, date range)
- Async report generation with job queue and real-time progress (SSE)
- Streaming Excel/ZIP reports (DB → Excel → ZIP → GridFS, no full dataset in memory)
- Multi-sheet reports with automatic splitting at 500K rows
- Fully responsive UI

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS 4 |
| Charts | Recharts |
| SQL Database | SQL Server (mssql) |
| NoSQL / File Storage | MongoDB + GridFS |
| Excel Generation | ExcelJS (streaming) |
| Compression | Archiver (ZIP) |
| Icons | Lucide React |
| Date Handling | date-fns |

## Getting Started

### Prerequisites

- Node.js 18+
- SQL Server instance (report data source)
- MongoDB instance (job queue + file storage)

### Environment Variables

Create a `.env.local` file at the project root:

```env
# SQL Server
DB_SERVER=your-sql-server
DB_PORT=1433
DB_DATABASE=your-database
DB_USER=your-username
DB_PASSWORD=your-password

# MongoDB
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB_NAME=report_dashboard

# App
NEXT_PUBLIC_BASE_URL=http://localhost:3000

# Keycloak / NextAuth
KEYCLOAK_CLIENT_ID=
KEYCLOAK_CLIENT_SECRET= 
KEYCLOAK_ISSUER=
NEXTAUTH_SECRET=
NEXTAUTH_URL=
```

### Install & Run

```bash
# Install dependencies
npm install

# Development
npm run dev

# Production build
npm run build
npm start
```

Open [http://localhost:3000](http://localhost:3000) to view the dashboard.

## Project Structure

```
├── app/                            # Next.js App Router (pages + API routes)
│   ├── page.tsx                    # Home / redirect
│   ├── layout.tsx                  # Root layout
│   ├── globals.css                 # Global styles
│   │
│   ├── dashboard/                  # Dashboard page
│   │   ├── page.tsx                # Main dashboard view
│   │   └── components/             # Dashboard-specific components
│   │       ├── DashboardHeader.tsx
│   │       ├── MetricsGrid.tsx
│   │       ├── MediaUploadsChart.tsx
│   │       ├── MediaHoursChart.tsx
│   │       ├── MediaTypeChart.tsx
│   │       └── TopChannelsChart.tsx
│   │
│   ├── report-jobs/                # Full-page job history view
│   │   └── page.tsx
│   │
│   ├── components/                 # App-level shared components
│   │   └── Navbar.tsx
│   │
│   └── api/                        # API routes (thin controllers)
│       ├── dashboard-db/           # Dashboard data queries
│       ├── filters/                # Filter dropdown options
│       ├── report-estimate/        # Report row count estimates
│       ├── queue-report/           # Create a report job
│       ├── process-jobs/           # Worker: claim & generate reports
│       ├── job-status/[jobId]/     # SSE stream for job progress
│       ├── job-logs/               # List/fetch job records
│       ├── download/[fileId]/      # Stream file from GridFS
│       └── generate-report/        # Synchronous report generation
│
├── components/                     # Shared UI components
│   └── ui/
│       ├── AdvancedDownloadButton.tsx
│       ├── ReportJobsPanel.tsx     # Floating job status panel (SSE)
│       ├── SearchableSelect.tsx
│       ├── Button.tsx
│       ├── Select.tsx
│       ├── DatePicker.tsx
│       ├── DynamicCharts.tsx       # Code-split chart imports
│       ├── LazyChart.tsx           # Intersection Observer wrapper
│       └── ChartSkeleton.tsx
│
├── lib/                            # Backend logic (organized by domain)
│   ├── db/                         # Database connections & storage
│   │   ├── sqlServer.ts            # SQL Server connection pool + query/stream
│   │   ├── mongoClient.ts          # MongoDB singleton connection
│   │   ├── gridfs.ts               # GridFS upload/download/delete
│   │   ├── queryCache.ts           # In-memory query cache
│   │   └── index.ts                # Barrel export
│   │
│   ├── reporting/                  # Report generation pipeline
│   │   ├── queryDefinitions.ts     # SQL queries per sheet type
│   │   ├── rowFormatters.ts        # Row → Excel column mapping
│   │   ├── excelStreamWriter.ts    # Excel streaming + sheet splitting
│   │   ├── reportGenerator.ts      # Orchestrator (DB → Excel → ZIP → GridFS)
│   │   └── index.ts                # Barrel export
│   │
│   ├── jobs/                       # Job queue management
│   │   ├── jobStore.ts             # MongoDB CRUD for job documents
│   │   ├── jobTypes.ts             # Job interfaces & SSE event types
│   │   └── index.ts                # Barrel export
│   │
│   ├── types/                      # Shared TypeScript types
│   │   ├── dashboard.ts            # Dashboard data interfaces
│   │   └── index.ts                # Barrel export
│   │
│   ├── utils/                      # Pure utilities
│   │   ├── formatting.ts           # Number/date formatting, cn()
│   │   ├── compression.ts          # Gzip response compression
│   │   ├── dataAggregation.ts      # Chart data grouping (daily/weekly/monthly)
│   │   ├── dateUtils.ts            # Default date helpers
│   │   ├── recharts.ts             # Recharts re-exports for tree-shaking
│   │   └── index.ts                # Barrel export
│   │
│   └── hooks/                      # React hooks
│       └── useLazyLoad.ts          # Intersection Observer hook
│
├── middleware.ts                   # Next.js middleware
├── next.config.ts                  # Next.js configuration
├── tsconfig.json                   # TypeScript config
├── package.json
└── SQL_QUERY.sql                   # Reference SQL queries
```

## Architecture

### Report Generation Flow

```
Client                    API                     Worker                   Storage
  │                        │                        │                        │
  ├─ POST /queue-report ──►│                        │                        │
  │◄── { jobId } ─────────┤                        │                        │
  │                        │                        │                        │
  ├─ SSE /job-status/:id ─►│                        │                        │
  │                        ├─ POST /process-jobs ──►│                        │
  │                        │                        ├─ claim pending job     │
  │                        │                        ├─ SQL stream rows ─────►│
  │◄── progress events ───┤◄── update progress ────┤  → Excel → ZIP ───────►│ GridFS
  │                        │                        │                        │
  │◄── completed event ───┤◄── mark completed ─────┤                        │
  │                        │                        │                        │
  ├─ GET /download/:id ──►│────────────────────────────── stream file ──────►│
  │◄── ZIP file ──────────┤                        │                        │
```

### Import Conventions

All `lib/` subfolders use barrel exports (`index.ts`), so imports are clean:

```typescript
import { query, buildDownloadUrl } from '@/lib/db';
import { generateReportToGridFS } from '@/lib/reporting';
import { createJob, JobSSEEvent } from '@/lib/jobs';
import { DashboardData } from '@/lib/types';
import { cn, formatNumber } from '@/lib/utils';
```
