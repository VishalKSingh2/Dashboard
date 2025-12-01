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

async function testFixedQuery() {
  try {
    console.log('🔍 Testing FIXED query (without DISTINCT in COUNT)...\n');
    const pool = await sql.connect(config);

    const startDate = '2025-11-30';
    const endDate = '2025-12-01';

    // OLD query (with DISTINCT - causes mismatch)
    console.log('1️⃣ OLD Query (with DISTINCT):');
    const oldQuery = `
      SELECT 
        COUNT(DISTINCT CASE WHEN RTRIM(vs.MediaSource) = 'Video' THEN vs.Id END) as totalVideos,
        SUM(CAST(vs.LengthInMilliseconds AS BIGINT)) / 3600000.0 as totalHours,
        COUNT(DISTINCT CASE WHEN RTRIM(vs.MediaSource) = 'Project' THEN vs.Id END) as totalShowreels,
        COUNT(DISTINCT CASE WHEN RTRIM(vs.MediaSource) = 'Audio' THEN vs.Id END) as totalAudio
      FROM VideoStatistics vs
      WHERE CAST(vs.CreatedDate AS DATE) >= @startDate
        AND CAST(vs.CreatedDate AS DATE) <= @endDate
    `;

    const oldResult = await pool.request()
      .input('startDate', sql.Date, startDate)
      .input('endDate', sql.Date, endDate)
      .query(oldQuery);

    console.log('  Videos:', oldResult.recordset[0].totalVideos);
    console.log('  Hours:', Math.round(oldResult.recordset[0].totalHours * 100) / 100);
    console.log('  Showreels:', oldResult.recordset[0].totalShowreels);
    console.log('  Audio:', oldResult.recordset[0].totalAudio);

    // NEW query (without DISTINCT - matches daily sum)
    console.log('\n2️⃣ NEW Query (without DISTINCT - FIXED):');
    const newQuery = `
      SELECT 
        COUNT(CASE WHEN RTRIM(vs.MediaSource) = 'Video' THEN vs.Id END) as totalVideos,
        SUM(CAST(vs.LengthInMilliseconds AS BIGINT)) / 3600000.0 as totalHours,
        COUNT(CASE WHEN RTRIM(vs.MediaSource) = 'Project' THEN vs.Id END) as totalShowreels,
        COUNT(CASE WHEN RTRIM(vs.MediaSource) = 'Audio' THEN vs.Id END) as totalAudio
      FROM VideoStatistics vs
      WHERE CAST(vs.CreatedDate AS DATE) >= @startDate
        AND CAST(vs.CreatedDate AS DATE) <= @endDate
    `;

    const newResult = await pool.request()
      .input('startDate', sql.Date, startDate)
      .input('endDate', sql.Date, endDate)
      .query(newQuery);

    console.log('  Videos:', newResult.recordset[0].totalVideos);
    console.log('  Hours:', Math.round(newResult.recordset[0].totalHours * 100) / 100);
    console.log('  Showreels:', newResult.recordset[0].totalShowreels);
    console.log('  Audio:', newResult.recordset[0].totalAudio);

    // Daily sum for comparison
    console.log('\n3️⃣ Daily Sum (for comparison):');
    const dailyQuery = `
      SELECT 
        SUM(CASE WHEN RTRIM(vs.MediaSource) = 'Video' THEN 1 END) as totalVideos,
        SUM(CAST(vs.LengthInMilliseconds AS BIGINT)) / 3600000.0 as totalHours,
        SUM(CASE WHEN RTRIM(vs.MediaSource) = 'Project' THEN 1 END) as totalShowreels,
        SUM(CASE WHEN RTRIM(vs.MediaSource) = 'Audio' THEN 1 END) as totalAudio
      FROM VideoStatistics vs
      WHERE CAST(vs.CreatedDate AS DATE) >= @startDate
        AND CAST(vs.CreatedDate AS DATE) <= @endDate
    `;

    const dailyResult = await pool.request()
      .input('startDate', sql.Date, startDate)
      .input('endDate', sql.Date, endDate)
      .query(dailyQuery);

    console.log('  Videos:', dailyResult.recordset[0].totalVideos);
    console.log('  Hours:', Math.round(dailyResult.recordset[0].totalHours * 100) / 100);
    console.log('  Showreels:', dailyResult.recordset[0].totalShowreels);
    console.log('  Audio:', dailyResult.recordset[0].totalAudio);

    console.log('\n✅ Results:');
    const newHours = Math.round(newResult.recordset[0].totalHours * 100) / 100;
    const dailyHours = Math.round(dailyResult.recordset[0].totalHours * 100) / 100;
    
    if (newHours === dailyHours) {
      console.log('✅ FIXED! New query matches daily sum perfectly.');
    } else {
      console.log('❌ Still mismatch:', newHours, 'vs', dailyHours);
    }

    await pool.close();
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
  }
}

testFixedQuery();
