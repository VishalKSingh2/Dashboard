# Quick Test Script for Advanced Report System
# Run this in PowerShell after starting the dev server

Write-Host "================================" -ForegroundColor Cyan
Write-Host "Advanced Report System - Quick Test" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Check if server is running
Write-Host "1. Checking if dev server is running..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
    Write-Host "   ✓ Server is running!" -ForegroundColor Green
} catch {
    Write-Host "   ✗ Server is NOT running!" -ForegroundColor Red
    Write-Host "   Please run: npm run dev" -ForegroundColor Yellow
    exit
}

Write-Host ""

# Check directories
Write-Host "2. Checking directories..." -ForegroundColor Yellow
$reportsDir = "reports/jobs"
$publicReportsDir = "public/reports"

if (-not (Test-Path $reportsDir)) {
    Write-Host "   Creating $reportsDir..." -ForegroundColor Gray
    New-Item -ItemType Directory -Path $reportsDir -Force | Out-Null
}
Write-Host "   ✓ $reportsDir exists" -ForegroundColor Green

if (-not (Test-Path $publicReportsDir)) {
    Write-Host "   Creating $publicReportsDir..." -ForegroundColor Gray
    New-Item -ItemType Directory -Path $publicReportsDir -Force | Out-Null
}
Write-Host "   ✓ $publicReportsDir exists" -ForegroundColor Green

Write-Host ""

# Queue a test job
Write-Host "3. Queuing a test report job..." -ForegroundColor Yellow
$body = @{
    email = "test@example.com"
    startDate = "2025-01-01"
    endDate = "2025-01-07"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "http://localhost:3000/api/queue-report" -Method Post -Body $body -ContentType "application/json"
    Write-Host "   ✓ Job queued successfully!" -ForegroundColor Green
    Write-Host "   Job ID: $($response.jobId)" -ForegroundColor Gray
} catch {
    Write-Host "   ✗ Failed to queue job" -ForegroundColor Red
    Write-Host "   Error: $_" -ForegroundColor Red
    exit
}

Write-Host ""

# Check jobs.json
Write-Host "4. Checking jobs.json..." -ForegroundColor Yellow
$jobsFile = "reports/jobs/jobs.json"
if (Test-Path $jobsFile) {
    $jobs = Get-Content $jobsFile | ConvertFrom-Json
    Write-Host "   ✓ Found $($jobs.Count) job(s) in queue" -ForegroundColor Green
    
    foreach ($job in $jobs) {
        Write-Host "   - Status: $($job.status), Email: $($job.email)" -ForegroundColor Gray
    }
} else {
    Write-Host "   ✗ jobs.json not found" -ForegroundColor Red
}

Write-Host ""

# Process jobs
Write-Host "5. Triggering job processing..." -ForegroundColor Yellow
Write-Host "   (This may take a few minutes for large datasets)" -ForegroundColor Gray

try {
    $response = Invoke-RestMethod -Uri "http://localhost:3000/api/process-jobs" -Method Post
    Write-Host "   ✓ Job processing completed!" -ForegroundColor Green
    Write-Host "   Processed: $($response.processedCount) job(s)" -ForegroundColor Gray
} catch {
    Write-Host "   ✗ Job processing failed" -ForegroundColor Red
    Write-Host "   Error: $_" -ForegroundColor Red
}

Write-Host ""

# Check generated files
Write-Host "6. Checking generated reports..." -ForegroundColor Yellow
$reportFiles = Get-ChildItem -Path $publicReportsDir -Filter "*.xlsx" -ErrorAction SilentlyContinue

if ($reportFiles.Count -gt 0) {
    Write-Host "   ✓ Found $($reportFiles.Count) report file(s)" -ForegroundColor Green
    
    foreach ($file in $reportFiles) {
        $sizeKB = [math]::Round($file.Length / 1KB, 2)
        Write-Host "   - $($file.Name) ($sizeKB KB)" -ForegroundColor Gray
    }
    
    Write-Host ""
    Write-Host "   Download URL:" -ForegroundColor Yellow
    $latestFile = $reportFiles | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    Write-Host "   http://localhost:3000/reports/$($latestFile.Name)" -ForegroundColor Cyan
} else {
    Write-Host "   ✗ No report files found" -ForegroundColor Red
    Write-Host "   Check console logs for errors" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "================================" -ForegroundColor Cyan
Write-Host "Test Complete!" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "1. Open the dashboard: http://localhost:3000/dashboard" -ForegroundColor Gray
Write-Host "2. Click 'Advanced Report' button" -ForegroundColor Gray
Write-Host "3. Enter your email and submit" -ForegroundColor Gray
Write-Host "4. Check your email for download link (if SMTP configured)" -ForegroundColor Gray
Write-Host ""
