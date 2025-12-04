# Test Compression Feature

Write-Host "Testing Payload Compression..." -ForegroundColor Cyan
Write-Host ""

# Test 1: Dashboard API with compression
Write-Host "1. Testing Dashboard API (should compress ~156KB payload)..." -ForegroundColor Yellow

try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000/api/dashboard-db" -Method GET -Headers @{
        "Accept-Encoding" = "gzip, deflate"
    }
    
    $originalSize = $response.Headers["X-Original-Size"]
    $compressedSize = $response.Headers["X-Compressed-Size"]
    $compressionRatio = $response.Headers["X-Compression-Ratio"]
    $compression = $response.Headers["X-Compression"]
    
    if ($originalSize -and $compressedSize) {
        Write-Host "   ✓ Original Size: $originalSize bytes" -ForegroundColor Green
        Write-Host "   ✓ Compressed Size: $compressedSize bytes" -ForegroundColor Green
        Write-Host "   ✓ Compression Ratio: $compressionRatio%" -ForegroundColor Green
        Write-Host "   ✓ Savings: $([int]$originalSize - [int]$compressedSize) bytes" -ForegroundColor Green
    } elseif ($compression -eq "none") {
        Write-Host "   ℹ Payload too small to compress" -ForegroundColor Blue
        Write-Host "   ℹ Size: $($response.Headers["X-Uncompressed-Size"]) bytes" -ForegroundColor Blue
    } else {
        Write-Host "   ⚠ No compression applied" -ForegroundColor Yellow
    }
    
    Write-Host ""
} catch {
    Write-Host "   ✗ Error: $_" -ForegroundColor Red
    Write-Host "   Make sure the dev server is running (npm run dev)" -ForegroundColor Yellow
    Write-Host ""
}

# Test 2: Advanced Report API (larger payload)
Write-Host "2. Testing Advanced Report API (should compress large payload)..." -ForegroundColor Yellow

$body = @{
    startDate = "2025-06-01"
    endDate = "2025-06-27"
} | ConvertTo-Json

try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000/api/advanced-report" `
        -Method POST `
        -Body $body `
        -ContentType "application/json" `
        -Headers @{
            "Accept-Encoding" = "gzip, deflate"
        }
    
    $originalSize = $response.Headers["X-Original-Size"]
    $compressedSize = $response.Headers["X-Compressed-Size"]
    $compressionRatio = $response.Headers["X-Compression-Ratio"]
    
    if ($originalSize -and $compressedSize) {
        $originalKB = [math]::Round([int]$originalSize / 1024, 2)
        $compressedKB = [math]::Round([int]$compressedSize / 1024, 2)
        $savedKB = [math]::Round(($originalKB - $compressedKB), 2)
        
        Write-Host "   ✓ Original Size: $originalKB KB" -ForegroundColor Green
        Write-Host "   ✓ Compressed Size: $compressedKB KB" -ForegroundColor Green
        Write-Host "   ✓ Compression Ratio: $compressionRatio%" -ForegroundColor Green
        Write-Host "   ✓ Bandwidth Saved: $savedKB KB" -ForegroundColor Green
        
        # Calculate transfer time savings (assuming 5 Mbps connection)
        $originalTime = [math]::Round($originalKB / (5 * 128), 2) # 5 Mbps = 640 KB/s
        $compressedTime = [math]::Round($compressedKB / (5 * 128), 2)
        $timeSaved = [math]::Round($originalTime - $compressedTime, 2)
        
        Write-Host "   ✓ Transfer Time Saved: $timeSaved seconds (at 5 Mbps)" -ForegroundColor Green
    } else {
        Write-Host "   ⚠ No compression applied" -ForegroundColor Yellow
    }
    
    Write-Host ""
} catch {
    Write-Host "   ✗ Error: $_" -ForegroundColor Red
    Write-Host "   Make sure the dev server is running and database is accessible" -ForegroundColor Yellow
    Write-Host ""
}

# Test 3: Without compression support
Write-Host "3. Testing without compression support (client doesn't accept gzip)..." -ForegroundColor Yellow

try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000/api/dashboard-db" -Method GET
    
    $compression = $response.Headers["X-Compression"]
    
    if ($compression -eq "unsupported") {
        Write-Host "   ✓ Correctly detected no compression support" -ForegroundColor Green
    } else {
        Write-Host "   ℹ Response: $compression" -ForegroundColor Blue
    }
    
    Write-Host ""
} catch {
    Write-Host "   ✗ Error: $_" -ForegroundColor Red
    Write-Host ""
}

Write-Host "Compression Test Complete!" -ForegroundColor Cyan
Write-Host ""
Write-Host "Summary:" -ForegroundColor White
Write-Host "- Compression automatically reduces payload sizes by 70-90%" -ForegroundColor Gray
Write-Host "- Saves bandwidth and improves load times" -ForegroundColor Gray
Write-Host "- Works transparently for all clients that support gzip" -ForegroundColor Gray
Write-Host "- Check response headers for compression statistics" -ForegroundColor Gray
Write-Host ""
Write-Host "For more details, see COMPRESSION_GUIDE.md" -ForegroundColor Yellow
