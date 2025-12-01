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

async function checkJune24Hours() {
  try {
    const pool = await sql.connect(config);
    console.log('✓ Connected to database\n');

    const query = `
      SELECT 
        CAST(CreatedDate AS DATE) as date,
        COUNT(*) as videoCount,
        SUM(CAST(LengthInMilliseconds AS BIGINT)) as totalMs,
        SUM(CAST(LengthInMilliseconds AS BIGINT)) / 3600000.0 as totalHours
      FROM VideoStatistics
      WHERE CAST(CreatedDate AS DATE) = '2025-06-24'
      GROUP BY CAST(CreatedDate AS DATE)
    `;

    const result = await pool.request().query(query);
    
    console.log('=== June 24, 2025 Data ===');
    if (result.recordset.length > 0) {
      const row = result.recordset[0];
      console.log('Videos:', row.videoCount);
      console.log('Total milliseconds:', row.totalMs);
      console.log('Total hours (unrounded):', row.totalHours);
      console.log('Total hours (2 decimals):', Math.round(row.totalHours * 100) / 100);
    } else {
      console.log('No data found for June 24, 2025');
    }

    await pool.close();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkJune24Hours();
