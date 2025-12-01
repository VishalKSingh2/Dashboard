const sql = require('mssql');

const config = {
  server: 'production.production.realtimereporting.livinglens.tv',
  port: 1433,
  database: 'Realtime-Reporting',
  user: 'lensadmin',
  password: 'gRbB8up8R55I7Q8ae29n#OFZQSLQ*l',
  options: {
    encrypt: true,
    trustServerCertificate: true,
    enableArithAbort: true,
    connectTimeout: 30000,
  },
};

async function diagnoseDataMismatch() {
  try {
    console.log('🔍 Diagnosing data mismatch issue...\n');
    const pool = await sql.connect(config);

    const startDate = '2025-11-30';
    const endDate = '2025-12-01';

    // Check 1: Total metrics query (same as API)
    console.log('1️⃣ Running TOTAL METRICS query...');
    const metricsQuery = `
      SELECT 
        COUNT(DISTINCT CASE WHEN RTRIM(vs.MediaSource) = 'Video' THEN vs.Id END) as totalVideos,
        SUM(CAST(vs.LengthInMilliseconds AS BIGINT)) / 3600000.0 as totalHours,
        COUNT(DISTINCT CASE WHEN RTRIM(vs.MediaSource) = 'Project' THEN vs.Id END) as totalShowreels,
        COUNT(DISTINCT CASE WHEN RTRIM(vs.MediaSource) = 'Audio' THEN vs.Id END) as totalAudio,
        AVG(CAST(vs.ViewCount AS FLOAT)) as avgViews
      FROM VideoStatistics vs
      LEFT JOIN ClientOverview co ON RTRIM(vs.ClientId) = RTRIM(co.Id)
      LEFT JOIN Customer c ON RTRIM(co.CustomerId) = RTRIM(c.Id)
      WHERE CAST(vs.CreatedDate AS DATE) >= @startDate
        AND CAST(vs.CreatedDate AS DATE) <= @endDate
    `;

    const metrics = await pool.request()
      .input('startDate', sql.Date, startDate)
      .input('endDate', sql.Date, endDate)
      .query(metricsQuery);

    console.log('Total Metrics Result:');
    console.log('  Videos:', metrics.recordset[0].totalVideos);
    console.log('  Hours:', metrics.recordset[0].totalHours);
    console.log('  Showreels:', metrics.recordset[0].totalShowreels);
    console.log('  Audio:', metrics.recordset[0].totalAudio);

    // Check 2: Daily data query (same as API)
    console.log('\n2️⃣ Running DAILY DATA query...');
    const dailyDataQuery = `
      SELECT 
        CAST(vs.CreatedDate AS DATE) as date,
        COUNT(CASE WHEN RTRIM(vs.MediaSource) = 'Video' THEN 1 END) as video,
        COUNT(CASE WHEN RTRIM(vs.MediaSource) = 'Project' THEN 1 END) as showreel,
        COUNT(CASE WHEN RTRIM(vs.MediaSource) = 'Audio' THEN 1 END) as audio,
        SUM(CAST(vs.LengthInMilliseconds AS BIGINT)) / 3600000.0 as hours
      FROM VideoStatistics vs
      LEFT JOIN ClientOverview co ON RTRIM(vs.ClientId) = RTRIM(co.Id)
      LEFT JOIN Customer c ON RTRIM(co.CustomerId) = RTRIM(c.Id)
      WHERE CAST(vs.CreatedDate AS DATE) >= @startDate
        AND CAST(vs.CreatedDate AS DATE) <= @endDate
      GROUP BY CAST(vs.CreatedDate AS DATE)
      ORDER BY CAST(vs.CreatedDate AS DATE)
    `;

    const dailyData = await pool.request()
      .input('startDate', sql.Date, startDate)
      .input('endDate', sql.Date, endDate)
      .query(dailyDataQuery);

    console.log('Daily Data Results:');
    dailyData.recordset.forEach(row => {
      console.log(`  ${row.date.toISOString().split('T')[0]}: ${row.video} videos, ${row.showreel} showreels, ${row.audio} audio, ${row.hours} hours`);
    });

    // Calculate sums from daily data
    const dailyVideoSum = dailyData.recordset.reduce((sum, row) => sum + row.video, 0);
    const dailyShowreelSum = dailyData.recordset.reduce((sum, row) => sum + row.showreel, 0);
    const dailyAudioSum = dailyData.recordset.reduce((sum, row) => sum + row.audio, 0);
    const dailyHoursSum = dailyData.recordset.reduce((sum, row) => sum + row.hours, 0);

    console.log('\nDaily Data Sums:');
    console.log('  Videos:', dailyVideoSum);
    console.log('  Showreels:', dailyShowreelSum);
    console.log('  Audio:', dailyAudioSum);
    console.log('  Hours:', dailyHoursSum);

    // Check 3: Sample raw data
    console.log('\n3️⃣ Checking SAMPLE RAW DATA...');
    const sampleQuery = `
      SELECT TOP 10
        Id,
        CreatedDate,
        MediaSource,
        LengthInMilliseconds,
        CAST(LengthInMilliseconds AS BIGINT) / 3600000.0 as hours,
        Title
      FROM VideoStatistics
      WHERE CAST(CreatedDate AS DATE) >= @startDate
        AND CAST(CreatedDate AS DATE) <= @endDate
      ORDER BY CreatedDate
    `;

    const sample = await pool.request()
      .input('startDate', sql.Date, startDate)
      .input('endDate', sql.Date, endDate)
      .query(sampleQuery);

    console.log('Sample Records:');
    sample.recordset.forEach(row => {
      console.log(`  ${row.CreatedDate.toISOString().split('T')[0]} | ${row.MediaSource?.trim() || 'NULL'} | ${row.LengthInMilliseconds} ms | ${row.hours} hrs | ${row.Title?.substring(0, 30)}`);
    });

    // Check 4: Check for SPLUNK tables (advanced report)
    console.log('\n4️⃣ Checking SPLUNK TABLES...');
    const tablesQuery = `
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_TYPE = 'BASE TABLE' 
      AND (TABLE_NAME LIKE 'SPLUNK%' OR TABLE_NAME IN ('VideoStatistics', 'ProjectStatistics', 'RedactionRequestStatistics'))
      ORDER BY TABLE_NAME
    `;

    const tables = await pool.request().query(tablesQuery);
    console.log('Available Tables:');
    tables.recordset.forEach(t => console.log('  -', t.TABLE_NAME));

    // Check 5: Count in SPLUNK tables if they exist
    if (tables.recordset.some(t => t.TABLE_NAME === 'SPLUNK_VideoStatistics')) {
      console.log('\n5️⃣ Checking SPLUNK_VideoStatistics...');
      const splunkQuery = `
        SELECT COUNT(*) as count
        FROM SPLUNK_VideoStatistics
        WHERE Created >= @startDate AND Created < DATEADD(day, 1, @endDate)
      `;
      
      const splunkData = await pool.request()
        .input('startDate', sql.Date, startDate)
        .input('endDate', sql.Date, endDate)
        .query(splunkQuery);
      
      console.log('  SPLUNK_VideoStatistics count:', splunkData.recordset[0].count);
    } else {
      console.log('\n5️⃣ SPLUNK_VideoStatistics table does NOT exist');
    }

    // Check 6: Verify date filtering
    console.log('\n6️⃣ Checking DATE RANGE coverage...');
    const dateRangeQuery = `
      SELECT 
        MIN(CreatedDate) as minDate,
        MAX(CreatedDate) as maxDate,
        COUNT(*) as totalRecords
      FROM VideoStatistics
    `;
    
    const dateRange = await pool.request().query(dateRangeQuery);
    console.log('  Data Range:', dateRange.recordset[0].minDate, 'to', dateRange.recordset[0].maxDate);
    console.log('  Total Records in DB:', dateRange.recordset[0].totalRecords);

    await pool.close();
    console.log('\n✅ Diagnosis complete!');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error);
  }
}

diagnoseDataMismatch();
