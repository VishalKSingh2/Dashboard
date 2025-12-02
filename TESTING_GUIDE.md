# Advanced Report System - Quick Test Guide

## Quick Test (Without Email Setup)

You can test the entire system without configuring email first.

### Step 1: Start the Server

```bash
npm run dev
```

### Step 2: Test the Modal

1. Open: http://localhost:3000/dashboard
2. Click the **"Advanced Report"** button (purple button)
3. You should see the email modal popup
4. Enter any email (e.g., `test@example.com`)
5. Click **"Generate Report"**

### Step 3: Check Job Queue

The job should be queued. Check the file:

```
/reports/jobs/jobs.json
```

You should see something like:

```json
[
  {
    "id": "abc-123-def-456",
    "email": "test@example.com",
    "status": "pending",
    "startDate": "2025-01-01",
    "endDate": "2025-12-02",
    "createdAt": "2025-12-02T..."
  }
]
```

### Step 4: Manually Trigger Job Processing

Open in browser or use curl:

```bash
# Browser:
http://localhost:3000/api/process-jobs

# Or PowerShell:
Invoke-WebRequest -Method POST -Uri "http://localhost:3000/api/process-jobs"
```

### Step 5: Check Console Logs

You should see:

```
Found 1 pending jobs
Processing job abc-123-def-456 for test@example.com
Starting advanced report generation: {...}
Processing Videos...
Fetched 1000 videos (total: 1000)
...
Report generation complete: {...}
Job abc-123-def-456 completed successfully
Email would have been sent to: test@example.com
```

### Step 6: Check Generated File

Look in:

```
/public/reports/
```

You should see a file like:

```
Advanced_Report_20250101_to_20251202_1733158400000.xlsx
```

### Step 7: Download the File

Open in browser:

```
http://localhost:3000/reports/Advanced_Report_20250101_to_20251202_1733158400000.xlsx
```

The Excel file should download!

---

## Test With Email (Gmail)

### 1. Get Gmail App Password

1. Go to: https://myaccount.google.com/security
2. Enable 2-Step Verification
3. Go to: https://myaccount.google.com/apppasswords
4. Create password for "Mail"
5. Copy the 16-character password

### 2. Add to .env.local

Create `.env.local`:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-gmail@gmail.com
SMTP_PASS=your-16-char-app-password
SMTP_FROM=your-gmail@gmail.com
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

### 3. Restart Server

```bash
# Stop current server (Ctrl+C)
npm run dev
```

### 4. Test Again

Follow Steps 1-4 above, but this time:
- Use your **real email address** in the modal
- After processing, **check your inbox**
- You should receive an email with download link!

---

## Common Test Scenarios

### Scenario 1: Small Date Range (Fast)

- Start: 2025-01-01
- End: 2025-01-07
- Expected time: 5-30 seconds

### Scenario 2: Medium Date Range

- Start: 2025-01-01  
- End: 2025-03-31
- Expected time: 1-3 minutes

### Scenario 3: Large Date Range

- Start: 2025-01-01
- End: 2025-12-02
- Expected time: 2-10 minutes (depending on data)

---

## Monitoring

### Check Job Status

```bash
# PowerShell
Get-Content reports/jobs/jobs.json | ConvertFrom-Json | Format-List
```

### Check Generated Files

```bash
# PowerShell
Get-ChildItem public/reports/ | Format-Table Name, Length, LastWriteTime
```

### Watch Logs

The server console will show progress:
- Query execution
- Records fetched
- File generation
- Email sending

---

## Cleanup Test Data

### Delete All Jobs

```bash
# PowerShell
Remove-Item reports/jobs/jobs.json
```

### Delete All Reports

```bash
# PowerShell
Remove-Item public/reports/* -Force
```

---

## Troubleshooting Tests

### Job Not Processing?

**Manually trigger:**
```bash
Invoke-WebRequest -Method POST -Uri "http://localhost:3000/api/process-jobs"
```

### Email Not Received?

Check:
1. Spam folder
2. Console logs for errors
3. SMTP credentials in .env.local
4. Gmail App Password is correct

### File Not Generated?

Check:
1. Database connection (existing data endpoint should work)
2. Console for SQL errors
3. File permissions on /public/reports/

---

## Success Checklist

- [ ] Modal opens when clicking "Advanced Report"
- [ ] Email validation works
- [ ] Job appears in jobs.json with "pending" status
- [ ] Manual trigger processes job
- [ ] Status changes to "processing" then "completed"
- [ ] Excel file appears in /public/reports/
- [ ] File downloads successfully
- [ ] Email received (if configured)
- [ ] Download link in email works
- [ ] File contains all 4 sheets (Videos, Transcriptions, Showreels, Redaction)

---

## Next Steps

Once basic testing works:

1. ✅ Test with real date ranges from your data
2. ✅ Verify email formatting and links
3. ✅ Test multiple concurrent requests
4. ✅ Test error scenarios (invalid dates, etc.)
5. ✅ Set up automatic job processing (cron/scheduler)
6. ✅ Configure production email service
7. ✅ Deploy to production environment

---

Happy Testing! 🎉
