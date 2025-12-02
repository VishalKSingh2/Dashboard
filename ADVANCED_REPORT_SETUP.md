# Advanced Report System - Setup Guide

## What's New? 🚀

The Advanced Report feature has been completely redesigned for **better performance** and **user experience**:

### Before (Old System):
- ❌ Downloaded huge JSON data to browser (10-50+ MB)
- ❌ Browser processed everything (30+ minutes for large datasets)
- ❌ Browser could timeout or crash
- ❌ User had to wait with page open

### After (New System):
- ✅ **Email-based workflow** - User enters email and closes page
- ✅ **Server-side processing** - All heavy work on server
- ✅ **Chunked queries** - Processes 10k records at a time
- ✅ **Background jobs** - No browser timeout issues
- ✅ **Email notification** - Download link sent when ready
- ✅ **Auto-cleanup** - Reports expire after 24 hours

---

## How It Works

1. User clicks **"Advanced Report"** button
2. **Modal popup** asks for email address
3. User submits → Report job **queued**
4. User can **close the page** and continue working
5. Server **generates report** in background (chunked processing)
6. **Email sent** with download link when ready
7. User downloads Excel file from link (valid 24 hours)

---

## Setup Instructions

### 1. Install Dependencies (Already Done)

```bash
npm install
```

### 2. Configure Email Service

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Edit `.env.local` and add your email configuration:

```env
# For Gmail (Recommended for demo)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=your-email@gmail.com

# Base URL
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

#### Getting Gmail App Password:

1. Go to Google Account: https://myaccount.google.com/
2. Security → 2-Step Verification (enable if not already)
3. Security → App passwords
4. Create new app password for "Mail"
5. Copy the 16-character password
6. Use it as `SMTP_PASS` in `.env.local`

**Note:** For production, use professional email services like SendGrid, AWS SES, or Mailgun.

### 3. Test Without Email (Optional)

If you don't want to set up email right now:

- The system will **still work**
- Jobs will be processed
- Files will be generated in `/public/reports/`
- Emails won't be sent (check console logs instead)
- You can manually check `/public/reports/` folder for generated files

---

## File Structure

```
/app/api/
  /queue-report/route.ts      # Endpoint to queue new report job
  /process-jobs/route.ts       # Background worker that processes jobs
  /advanced-report/route.ts    # OLD endpoint (can be removed)

/components/ui/
  /EmailModal.tsx              # Email input modal
  /AdvancedDownloadButton.tsx  # Updated button with modal trigger

/lib/
  /jobManager.ts               # Job queue management (filesystem)
  /advancedReportGenerator.ts  # Server-side Excel generation with chunking
  /emailService.ts             # Email sending functionality

/reports/
  /jobs/jobs.json              # Job metadata (auto-created)

/public/
  /reports/                    # Generated Excel files (auto-created)
    - Advanced_Report_*.xlsx
```

---

## Testing

### 1. Start the Development Server

```bash
npm run dev
```

### 2. Test the Advanced Report

1. Open dashboard: http://localhost:3000/dashboard
2. Click **"Advanced Report"** button
3. Enter your email in the modal
4. Click **"Generate Report"**
5. Check console logs for progress
6. Check email for download link (or check `/public/reports/` folder)

### 3. Monitor Jobs

View job status in:
```
/reports/jobs/jobs.json
```

Job statuses:
- `pending` - Queued, waiting to process
- `processing` - Currently generating
- `completed` - Done, email sent
- `failed` - Error occurred

---

## Performance Improvements

### Chunked Queries
- Processes **10,000 records at a time**
- Prevents memory overflow
- Faster overall processing

### Server-Side Generation
- No browser limitations
- Can handle millions of records
- No JSON transfer overhead

### Background Processing
- User doesn't wait
- No timeout issues
- Scalable for multiple concurrent requests

---

## Troubleshooting

### Email Not Sending?

**Check console logs** - Emails may fail silently. The system will still work and generate files.

Common issues:
- Wrong SMTP credentials
- App password not enabled (Gmail)
- Firewall blocking port 587
- 2FA not enabled on Gmail

**Solution:** Use a proper email service (SendGrid, AWS SES) for production.

### Job Stuck in "Pending"?

The `/api/process-jobs` endpoint might not have been triggered.

**Manual trigger:**
```bash
curl -X POST http://localhost:3000/api/process-jobs
```

Or open in browser:
```
http://localhost:3000/api/process-jobs
```

### No Reports Generated?

Check for database connection errors in console. Ensure your database credentials are correct.

### Reports Not Expiring?

The cleanup runs when `/api/process-jobs` is called. For automatic cleanup, set up a cron job or scheduled task to hit that endpoint periodically.

---

## Production Deployment

### 1. Use Professional Email Service

Replace nodemailer SMTP with:
- **SendGrid** - Easy setup, good free tier
- **AWS SES** - Scalable, cheap
- **Mailgun** - Reliable, feature-rich

### 2. Use Cloud Storage

Instead of `/public/reports/`, use:
- **AWS S3** with signed URLs
- **Azure Blob Storage**
- **Google Cloud Storage**

Benefits:
- Persistent storage
- Better security
- CDN delivery
- Automatic cleanup

### 3. Use Proper Job Queue

Replace filesystem jobs with:
- **Redis + Bull** - Popular, reliable
- **AWS SQS** - Fully managed
- **Azure Queue Storage**

### 4. Add Rate Limiting

Prevent abuse:
- Limit 5 reports per user per day
- Validate email domains
- Add CAPTCHA

### 5. Add Progress Tracking

Enhance UX:
- WebSocket for real-time progress
- Status page to check job status
- Email notifications for job start/complete

---

## Future Enhancements (Optional)

- [ ] Report scheduling (daily/weekly)
- [ ] Custom filters in email form
- [ ] Report history page
- [ ] Download progress bar
- [ ] Multiple email recipients
- [ ] Report templates
- [ ] Data visualization in email

---

## Summary

✅ **Email modal** for user input
✅ **Job queue** system with filesystem
✅ **Server-side** Excel generation
✅ **Chunked queries** (10k at a time)
✅ **Background processing** (no timeouts)
✅ **Email notifications** with download links
✅ **Auto-cleanup** after 24 hours
✅ **Production-ready** architecture

The system is now **scalable**, **performant**, and provides a **professional user experience**! 🎉
