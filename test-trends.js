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

async function testTrends() {
  try {
    const pool = await sql.connect(config);
    console.log('✓ Connected to database\n');

    // Test for June 2025: June 1-30
    const currentStart = '2025-06-01';
    const currentEnd = '2025-06-30';
    
    // Previous period: May 2-31 (same number of days = 30)
    const prevStart = '2025-05-02';
    const prevEnd = '2025-05-31';

    console.log('=== Current Period (June 1-30, 2025) ===');
    const currentQuery = `
      SELECT 
        COUNT(DISTINCT CASE WHEN RTRIM(vs.MediaSource) != 'Project' THEN vs.Id END) as totalVideos,
        SUM(CAST(vs.LengthInMilliseconds AS BIGINT)) / 3600000.0 as totalHours,
        COUNT(DISTINCT CASE WHEN RTRIM(vs.MediaSource) = 'Project' THEN vs.Id END) as totalShowreels
      FROM VideoStatistics vs
      WHERE CAST(vs.CreatedDate AS DATE) >= '${currentStart}'
        AND CAST(vs.CreatedDate AS DATE) <= '${currentEnd}'
    `;
    const current = await pool.request().query(currentQuery);
    console.log(current.recordset[0]);

    console.log('\n=== Previous Period (May 2-31, 2025) ===');
    const prevQuery = `
      SELECT 
        COUNT(DISTINCT CASE WHEN RTRIM(vs.MediaSource) != 'Project' THEN vs.Id END) as totalVideos,
        SUM(CAST(vs.LengthInMilliseconds AS BIGINT)) / 3600000.0 as totalHours,
        COUNT(DISTINCT CASE WHEN RTRIM(vs.MediaSource) = 'Project' THEN vs.Id END) as totalShowreels
      FROM VideoStatistics vs
      WHERE CAST(vs.CreatedDate AS DATE) >= '${prevStart}'
        AND CAST(vs.CreatedDate AS DATE) <= '${prevEnd}'
    `;
    const prev = await pool.request().query(prevQuery);
    console.log(prev.recordset[0]);

    console.log('\n=== Trend Calculations ===');
    const curr = current.recordset[0];
    const prv = prev.recordset[0];
    
    const videoChange = prv.totalVideos === 0 ? 0 : Math.round(((curr.totalVideos - prv.totalVideos) / prv.totalVideos) * 100);
    const hoursChange = prv.totalHours === 0 || !prv.totalHours ? null : Math.round(((curr.totalHours - prv.totalHours) / prv.totalHours) * 100);
    const showreelChange = prv.totalShowreels === 0 ? 0 : Math.round(((curr.totalShowreels - prv.totalShowreels) / prv.totalShowreels) * 100);
    
    console.log(`Videos: ${curr.totalVideos} (current) vs ${prv.totalVideos} (prev) = ${videoChange}% change`);
    console.log(`Hours: ${curr.totalHours} (current) vs ${prv.totalHours} (prev) = ${hoursChange}% change`);
    console.log(`Showreels: ${curr.totalShowreels} (current) vs ${prv.totalShowreels} (prev) = ${showreelChange}% change`);

    await pool.close();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testTrends();
