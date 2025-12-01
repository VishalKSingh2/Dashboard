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

async function testAdvancedReportQueries() {
  try {
    console.log('🧪 Testing Advanced Report Queries...\n');
    const pool = await sql.connect(config);

    const startDate = '2025-11-30';
    const endDate = '2025-12-01';

    // Query 1: Videos
    console.log('1️⃣ Testing Videos Query...');
    const videosQuery = `
      SELECT COUNT(*) as count
      FROM VideoStatistics vs
      WHERE vs.CreatedDate >= @Start
        AND vs.CreatedDate < DATEADD(day, 1, @End)
    `;
    const videosCount = await pool.request()
      .input('Start', sql.Date, startDate)
      .input('End', sql.Date, endDate)
      .query(videosQuery);
    console.log('  Videos found:', videosCount.recordset[0].count);

    // Query 2: Transcriptions
    console.log('\n2️⃣ Testing Transcriptions Query...');
    const transcriptionsQuery = `
      SELECT COUNT(*) as count
      FROM TranscriptionRequestStatistics trs
      WHERE trs.RequestedDate >= @Start
        AND trs.RequestedDate < DATEADD(day, 1, @End)
    `;
    const transcriptionsCount = await pool.request()
      .input('Start', sql.Date, startDate)
      .input('End', sql.Date, endDate)
      .query(transcriptionsQuery);
    console.log('  Transcriptions found:', transcriptionsCount.recordset[0].count);

    // Sample transcription
    if (transcriptionsCount.recordset[0].count > 0) {
      const sampleTranscription = await pool.request()
        .input('Start', sql.Date, startDate)
        .input('End', sql.Date, endDate)
        .query(`
          SELECT TOP 1 *
          FROM TranscriptionRequestStatistics
          WHERE RequestedDate >= @Start
            AND RequestedDate < DATEADD(day, 1, @End)
        `);
      console.log('  Sample columns:', Object.keys(sampleTranscription.recordset[0]));
    }

    // Query 3: Showreels (ProjectStatistics)
    console.log('\n3️⃣ Testing Showreels Query (ProjectStatistics)...');
    const showreelsQuery = `
      SELECT COUNT(*) as count
      FROM ProjectStatistics ps
      WHERE ps.Modified >= @Start
        AND ps.Modified < DATEADD(day, 1, @End)
    `;
    const showreelsCount = await pool.request()
      .input('Start', sql.Date, startDate)
      .input('End', sql.Date, endDate)
      .query(showreelsQuery);
    console.log('  Showreels found:', showreelsCount.recordset[0].count);

    // Sample showreel
    if (showreelsCount.recordset[0].count > 0) {
      const sampleShowreel = await pool.request()
        .input('Start', sql.Date, startDate)
        .input('End', sql.Date, endDate)
        .query(`
          SELECT TOP 1
            ps.Id,
            ps.Title,
            ps.Modified,
            ps.ProjectStatusText,
            ps.PublishStatusText,
            ps.ProjectLengthInMilliseconds
          FROM ProjectStatistics ps
          WHERE ps.Modified >= @Start
            AND ps.Modified < DATEADD(day, 1, @End)
        `);
      console.log('  Sample:', sampleShowreel.recordset[0]);
    }

    // Query 4: Redaction Requests
    console.log('\n4️⃣ Testing Redaction Requests Query...');
    const redactionQuery = `
      SELECT COUNT(*) as count
      FROM RedactionRequestStatistics rrs
      WHERE rrs.CompletedDate >= @Start
        AND rrs.CompletedDate < DATEADD(day, 1, @End)
    `;
    const redactionCount = await pool.request()
      .input('Start', sql.Date, startDate)
      .input('End', sql.Date, endDate)
      .query(redactionQuery);
    console.log('  Redaction Requests found:', redactionCount.recordset[0].count);

    // Alternative check using CreatedDate for redactions
    console.log('\n5️⃣ Checking Redaction by CreatedDate...');
    const redactionAltQuery = `
      SELECT COUNT(*) as count
      FROM RedactionRequestStatistics rrs
      WHERE rrs.CreatedDate >= @Start
        AND rrs.CreatedDate < DATEADD(day, 1, @End)
    `;
    const redactionAltCount = await pool.request()
      .input('Start', sql.Date, startDate)
      .input('End', sql.Date, endDate)
      .query(redactionAltQuery);
    console.log('  Redaction Requests (by CreatedDate):', redactionAltCount.recordset[0].count);

    await pool.close();
    console.log('\n✅ Test complete!');
    console.log('\n📊 Summary:');
    console.log('  Videos:', videosCount.recordset[0].count);
    console.log('  Transcriptions:', transcriptionsCount.recordset[0].count);
    console.log('  Showreels:', showreelsCount.recordset[0].count);
    console.log('  Redaction Requests:', redactionCount.recordset[0].count);
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error);
  }
}

testAdvancedReportQueries();
