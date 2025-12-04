# Production Build & Test Script
# This ensures JavaScript is properly minified

Write-Host "🔨 Building production version with minification..." -ForegroundColor Cyan
Write-Host ""

# Clean previous build
Write-Host "Cleaning previous build..." -ForegroundColor Yellow
if (Test-Path ".next") {
    Remove-Item -Recurse -Force .next
}

# Build with production optimizations
Write-Host ""
Write-Host "Building for production (this will minify all JavaScript)..." -ForegroundColor Yellow
npm run build

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ Build successful! JavaScript is now minified." -ForegroundColor Green
    Write-Host ""
    Write-Host "🚀 Starting production server..." -ForegroundColor Cyan
    Write-Host ""
    Write-Host "📊 To test performance:" -ForegroundColor Yellow
    Write-Host "   1. Open http://localhost:3000/dashboard" -ForegroundColor White
    Write-Host "   2. Open Chrome DevTools > Lighthouse" -ForegroundColor White
    Write-Host "   3. Run performance audit" -ForegroundColor White
    Write-Host "   4. You should see minified JavaScript (no more 176 KiB warning)" -ForegroundColor White
    Write-Host ""
    Write-Host "Expected improvements:" -ForegroundColor Green
    Write-Host "   - JavaScript files will be minified (176 KiB savings)" -ForegroundColor White
    Write-Host "   - Bundle sizes reduced by ~40%" -ForegroundColor White
    Write-Host "   - Faster load times" -ForegroundColor White
    Write-Host ""
    Write-Host "Press Ctrl+C to stop the server when done testing." -ForegroundColor Yellow
    Write-Host ""
    
    # Start production server
    npm run start
} else {
    Write-Host ""
    Write-Host "❌ Build failed. Please check the errors above." -ForegroundColor Red
    Write-Host ""
}
