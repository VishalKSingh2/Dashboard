const sql = require('mssql');

const config = {
  server: 'development.development.realtimereporting.livinglens.tv',
  database: 'Realtime-Reporting',
  user: 'lensadmin',
  password: 'YD07dE-VBr_w0BUh%5He%u!7wut',
  options: {
    encrypt: true,
    trustServerCertificate: true,
    enableArithAbort: true,
  },
};

async function testQueries() {
  try {
    const pool = await sql.connect(config);
    console.log('✓ Connected to database\n');

    // Test 1: Filters query
    console.log('=== Testing Filters Query ===');
    const customersQuery = `
      SELECT DISTINCT RTRIM(c.Name) as Name
      FROM Customer c
      INNER JOIN ClientOverview co ON RTRIM(c.Id) = RTRIM(co.CustomerId)
      WHERE c.Name IS NOT NULL
      ORDER BY RTRIM(c.Name)
    `;
    const customers = await pool.request().query(customersQuery);
    console.log(`✓ Found ${customers.recordset.length} customers`);
    console.log('  Sample customers:', customers.recordset.slice(0, 3).map(c => c.Name));

    const mediaTypesQuery = `
      SELECT DISTINCT RTRIM(MediaSource) as MediaSource
      FROM VideoStatistics
      WHERE MediaSource IS NOT NULL
      ORDER BY RTRIM(MediaSource)
    `;
    const mediaTypes = await pool.request().query(mediaTypesQuery);
    console.log(`✓ Found ${mediaTypes.recordset.length} media types`);
    console.log('  Media types:', mediaTypes.recordset.map(m => m.MediaSource));

    // Test 2: Metrics query
    console.log('\n=== Testing Metrics Query ===');
    const metricsQuery = `
      SELECT 
        COUNT(DISTINCT vs.Id) as totalVideos,
        SUM(CAST(vs.LengthInMilliseconds AS BIGINT)) / 3600000.0 as totalHours,
        COUNT(DISTINCT CASE WHEN RTRIM(vs.UploadSource) = 'showreel' THEN vs.Id END) as totalShowreels,
        AVG(CAST(vs.ViewCount AS FLOAT)) as avgViews
      FROM VideoStatistics vs
      LEFT JOIN ClientOverview co ON RTRIM(vs.ClientId) = RTRIM(co.Id)
      LEFT JOIN Customer c ON RTRIM(co.CustomerId) = RTRIM(c.Id)
      WHERE CAST(vs.CreatedDate AS DATE) >= '2024-01-01'
        AND CAST(vs.CreatedDate AS DATE) <= '2024-12-31'
    `;
    const metrics = await pool.request().query(metricsQuery);
    console.log('✓ Metrics query successful');
    console.log('  Results:', metrics.recordset[0]);

    // Test 3: Daily data query
    console.log('\n=== Testing Daily Data Query ===');
    const dailyQuery = `
      SELECT TOP 5
        CAST(vs.CreatedDate AS DATE) as date,
        COUNT(CASE WHEN RTRIM(vs.UploadSource) != 'showreel' THEN 1 END) as video,
        COUNT(CASE WHEN RTRIM(vs.UploadSource) = 'showreel' THEN 1 END) as showreel,
        SUM(CAST(vs.LengthInMilliseconds AS BIGINT)) / 3600000.0 as hours
      FROM VideoStatistics vs
      WHERE vs.CreatedDate IS NOT NULL
      GROUP BY CAST(vs.CreatedDate AS DATE)
      ORDER BY CAST(vs.CreatedDate AS DATE) DESC
    `;
    const daily = await pool.request().query(dailyQuery);
    console.log(`✓ Daily data query successful (${daily.recordset.length} rows)`);
    console.log('  Sample:', daily.recordset[0]);

    // Test 4: Top channels query
    console.log('\n=== Testing Top Channels Query ===');
    const channelsQuery = `
      SELECT TOP 5
        co.Name as name,
        SUM(CAST(vs.LengthInMilliseconds AS BIGINT)) / 3600000.0 as hours
      FROM VideoStatistics vs
      INNER JOIN ClientOverview co ON RTRIM(vs.ClientId) = RTRIM(co.Id)
      WHERE vs.CreatedDate IS NOT NULL
      GROUP BY co.Name
      ORDER BY SUM(CAST(vs.LengthInMilliseconds AS BIGINT)) DESC
    `;
    const channels = await pool.request().query(channelsQuery);
    console.log(`✓ Top channels query successful (${channels.recordset.length} rows)`);
    channels.recordset.forEach(c => console.log(`  - ${c.name}: ${c.hours.toFixed(2)} hours`));

    // Test 5: Media types query
    console.log('\n=== Testing Media Types Query ===');
    const mediaQuery = `
      SELECT 
        COALESCE(RTRIM(vs.MediaSource), 'Unknown') as name,
        COUNT(*) as value
      FROM VideoStatistics vs
      WHERE vs.CreatedDate IS NOT NULL
      GROUP BY vs.MediaSource
      ORDER BY COUNT(*) DESC
    `;
    const media = await pool.request().query(mediaQuery);
    console.log(`✓ Media types query successful (${media.recordset.length} rows)`);
    media.recordset.forEach(m => console.log(`  - ${m.name}: ${m.value}`));

    await pool.close();
    console.log('\n✅ All database queries passed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('Details:', error);
    process.exit(1);
  }
}

testQueries();
