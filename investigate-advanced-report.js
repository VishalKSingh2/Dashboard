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

async function investigateAdvancedReport() {
  try {
    console.log('🔍 Investigating Advanced Report data availability...\n');
    const pool = await sql.connect(config);

    const startDate = '2025-11-30';
    const endDate = '2025-12-01';

    // Check 1: Videos data
    console.log('1️⃣ Checking Videos data (VideoStatistics)...');
    const videosQuery = `
      SELECT TOP 5
        vs.Id AS VideoId,
        vs.CreatedDate AS Created,
        c.Name AS ParentName,
        co.Name AS ClientName,
        vs.Title,
        vs.MediaSource,
        vs.ViewCount,
        CAST(vs.LengthInMilliseconds AS MONEY) / 60000 AS LengthInMinutes
      FROM VideoStatistics vs
      LEFT JOIN ClientOverview co ON RTRIM(vs.ClientId) = RTRIM(co.Id)
      LEFT JOIN Customer c ON RTRIM(co.CustomerId) = RTRIM(c.Id)
      WHERE vs.CreatedDate >= @Start
        AND vs.CreatedDate < DATEADD(day, 1, @End)
      ORDER BY vs.CreatedDate
    `;

    const videos = await pool.request()
      .input('Start', sql.Date, startDate)
      .input('End', sql.Date, endDate)
      .query(videosQuery);

    console.log(`  Found ${videos.recordset.length} videos`);
    if (videos.recordset.length > 0) {
      console.log('  Sample:', {
        VideoId: videos.recordset[0].VideoId,
        Created: videos.recordset[0].Created,
        ParentName: videos.recordset[0].ParentName,
        ClientName: videos.recordset[0].ClientName,
        MediaSource: videos.recordset[0].MediaSource?.trim(),
        ViewCount: videos.recordset[0].ViewCount,
        LengthInMinutes: videos.recordset[0].LengthInMinutes
      });
    }

    // Check 2: Check all records count
    console.log('\n2️⃣ Checking TOTAL count in date range...');
    const countQuery = `
      SELECT COUNT(*) as total
      FROM VideoStatistics
      WHERE CreatedDate >= @Start
        AND CreatedDate < DATEADD(day, 1, @End)
    `;

    const count = await pool.request()
      .input('Start', sql.Date, startDate)
      .input('End', sql.Date, endDate)
      .query(countQuery);

    console.log(`  Total records: ${count.recordset[0].total}`);

    // Check 3: View count statistics
    console.log('\n3️⃣ Checking ViewCount statistics...');
    const viewCountQuery = `
      SELECT 
        COUNT(*) as totalRecords,
        COUNT(CASE WHEN ViewCount IS NULL THEN 1 END) as nullViewCounts,
        COUNT(CASE WHEN ViewCount = 0 THEN 1 END) as zeroViewCounts,
        COUNT(CASE WHEN ViewCount > 0 THEN 1 END) as positiveViewCounts,
        AVG(CAST(ViewCount AS FLOAT)) as avgViewCount,
        MAX(ViewCount) as maxViewCount
      FROM VideoStatistics
      WHERE CreatedDate >= @Start
        AND CreatedDate < DATEADD(day, 1, @End)
    `;

    const viewStats = await pool.request()
      .input('Start', sql.Date, startDate)
      .input('End', sql.Date, endDate)
      .query(viewCountQuery);

    console.log('  Total Records:', viewStats.recordset[0].totalRecords);
    console.log('  NULL ViewCounts:', viewStats.recordset[0].nullViewCounts);
    console.log('  Zero ViewCounts:', viewStats.recordset[0].zeroViewCounts);
    console.log('  Positive ViewCounts:', viewStats.recordset[0].positiveViewCounts);
    console.log('  Average ViewCount:', viewStats.recordset[0].avgViewCount);
    console.log('  Max ViewCount:', viewStats.recordset[0].maxViewCount);

    // Check 4: Check for transcription-related tables
    console.log('\n4️⃣ Checking for Transcription tables...');
    const transcriptionTablesQuery = `
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_TYPE = 'BASE TABLE' 
      AND TABLE_NAME LIKE '%Transcription%'
      ORDER BY TABLE_NAME
    `;

    const transcriptionTables = await pool.request().query(transcriptionTablesQuery);
    console.log(`  Found ${transcriptionTables.recordset.length} transcription-related tables:`);
    transcriptionTables.recordset.forEach(t => console.log('    -', t.TABLE_NAME));

    // Check 5: Check ProjectStatistics table structure
    console.log('\n5️⃣ Checking ProjectStatistics table...');
    const projectColumnsQuery = `
      SELECT COLUMN_NAME, DATA_TYPE 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'ProjectStatistics'
      ORDER BY ORDINAL_POSITION
    `;

    const projectColumns = await pool.request().query(projectColumnsQuery);
    console.log('  Columns in ProjectStatistics:');
    projectColumns.recordset.forEach(col => console.log(`    - ${col.COLUMN_NAME} (${col.DATA_TYPE})`));

    // Check 6: Check if there's data in ProjectStatistics
    console.log('\n6️⃣ Checking ProjectStatistics data...');
    const projectDataQuery = `
      SELECT COUNT(*) as count
      FROM ProjectStatistics
    `;

    const projectData = await pool.request().query(projectDataQuery);
    console.log(`  Total records in ProjectStatistics: ${projectData.recordset[0].count}`);

    // Check 7: Sample from ProjectStatistics
    if (projectData.recordset[0].count > 0) {
      console.log('\n7️⃣ Sample ProjectStatistics records...');
      const projectSampleQuery = `
        SELECT TOP 5 *
        FROM ProjectStatistics
        ORDER BY Id DESC
      `;

      const projectSample = await pool.request().query(projectSampleQuery);
      console.log('  Sample record columns:', Object.keys(projectSample.recordset[0]));
    }

    // Check 8: Check RedactionRequestStatistics
    console.log('\n8️⃣ Checking RedactionRequestStatistics...');
    const redactionCountQuery = `
      SELECT COUNT(*) as count
      FROM RedactionRequestStatistics
    `;

    const redactionCount = await pool.request().query(redactionCountQuery);
    console.log(`  Total records in RedactionRequestStatistics: ${redactionCount.recordset[0].count}`);

    await pool.close();
    console.log('\n✅ Investigation complete!');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error);
  }
}

investigateAdvancedReport();
