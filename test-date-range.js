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

async function checkDateRange() {
  try {
    const pool = await sql.connect(config);
    console.log('✓ Connected to database\n');

    // Check overall date range
    console.log('=== Overall Date Range ===');
    const dateRangeQuery = `
      SELECT 
        MIN(CAST(CreatedDate AS DATE)) as minDate,
        MAX(CAST(CreatedDate AS DATE)) as maxDate,
        COUNT(*) as totalRecords
      FROM VideoStatistics
    `;
    const dateRange = await pool.request().query(dateRangeQuery);
    console.log(dateRange.recordset[0]);

    // Check data for Jan-Feb 2025
    console.log('\n=== Data for 2025-01-01 to 2025-02-28 ===');
    const janFebQuery = `
      SELECT 
        CAST(CreatedDate AS DATE) as date,
        COUNT(*) as count,
        RTRIM(MediaSource) as mediaSource
      FROM VideoStatistics
      WHERE CAST(CreatedDate AS DATE) >= '2025-01-01'
        AND CAST(CreatedDate AS DATE) <= '2025-02-28'
      GROUP BY CAST(CreatedDate AS DATE), MediaSource
      ORDER BY CAST(CreatedDate AS DATE)
    `;
    const janFeb = await pool.request().query(janFebQuery);
    console.log(`Found ${janFeb.recordset.length} records`);
    janFeb.recordset.forEach(row => {
      console.log(`  ${row.date.toISOString().split('T')[0]}: ${row.count} ${row.mediaSource} uploads`);
    });

    // Check records by month
    console.log('\n=== Records by Month (2024-2025) ===');
    const monthlyQuery = `
      SELECT 
        YEAR(CreatedDate) as year,
        MONTH(CreatedDate) as month,
        COUNT(*) as count
      FROM VideoStatistics
      WHERE YEAR(CreatedDate) IN (2024, 2025)
      GROUP BY YEAR(CreatedDate), MONTH(CreatedDate)
      ORDER BY YEAR(CreatedDate), MONTH(CreatedDate)
    `;
    const monthly = await pool.request().query(monthlyQuery);
    monthly.recordset.forEach(row => {
      console.log(`  ${row.year}-${String(row.month).padStart(2, '0')}: ${row.count} records`);
    });

    await pool.close();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkDateRange();
