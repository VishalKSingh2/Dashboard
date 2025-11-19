# Report Analytics Dashboard

A Next.js dashboard application providing visual insights for Account and Product Management teams.

## Features

- 📊 Interactive charts (line, bar, donut, horizontal bar)
- 🎯 Key performance metrics with trend indicators
- 🔍 Advanced filtering (customer type, media type, date range)
- 📱 Fully responsive design
- ⚡ Built with Next.js 14+ App Router
- 🎨 Styled with Tailwind CSS

## Tech Stack

- **Framework:** Next.js 14+ (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **Charts:** Recharts
- **Date Handling:** date-fns
- **Icons:** Lucide React

## Getting Started

First, install dependencies:

```bash
npm install
```

Then, run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the dashboard.

## Project Structure

```
app/
├── dashboard/          # Dashboard page and components
├── api/               # API routes
├── layout.tsx         # Root layout
└── page.tsx           # Home page

lib/
├── types.ts           # TypeScript interfaces
├── utils.ts           # Utility functions
└── mockData.ts        # Mock data generator

components/
└── ui/                # Reusable UI components
```
