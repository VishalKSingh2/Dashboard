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

async function getTotalVideos() {
  try {
    console.log('📊 Querying total videos from Nov 1, 2024 to Dec 1, 2025...\n');
    const pool = await sql.connect(config);

    const startDate = '2024-11-01';
    const endDate = '2025-12-01';

    // Count all videos in date range
    const query = `
      SELECT 
        COUNT(*) as totalVideos,
        COUNT(CASE WHEN RTRIM(MediaSource) = 'Video' THEN 1 END) as videosOnly,
        COUNT(CASE WHEN RTRIM(MediaSource) = 'Audio' THEN 1 END) as audioOnly,
        COUNT(CASE WHEN RTRIM(MediaSource) = 'Project' THEN 1 END) as projectsShowreels,
        MIN(CreatedDate) as firstRecord,
        MAX(CreatedDate) as lastRecord
      FROM VideoStatistics
      WHERE CreatedDate >= @startDate
        AND CreatedDate < DATEADD(day, 1, @endDate)
    `;

    const result = await pool.request()
      .input('startDate', sql.Date, startDate)
      .input('endDate', sql.Date, endDate)
      .query(query);

    const data = result.recordset[0];

    console.log('✅ Results:');
    console.log('   Date Range: Nov 1, 2024 - Dec 1, 2025');
    console.log('   ═══════════════════════════════════════');
    console.log('   Total Records:', data.totalVideos.toLocaleString());
    console.log('   Videos:', data.videosOnly.toLocaleString());
    console.log('   Audio:', data.audioOnly.toLocaleString());
    console.log('   Showreels/Projects:', data.projectsShowreels.toLocaleString());
    console.log('   ═══════════════════════════════════════');
    console.log('   First Record:', data.firstRecord);
    console.log('   Last Record:', data.lastRecord);
    console.log('');

    await pool.close();
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

getTotalVideos();
