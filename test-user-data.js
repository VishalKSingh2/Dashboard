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

async function testUserData() {
  try {
    const pool = await sql.connect(config);
    console.log('✓ Connected to database\n');

    console.log('=== Testing User Data from VideoStatistics ===\n');
    
    const userQuery = `
      SELECT TOP 20
        RTRIM(vs.UserId) as userId,
        COUNT(*) as uploads,
        SUM(CAST(COALESCE(vs.ViewCount, 0) AS FLOAT)) as totalViews,
        MAX(vs.CreatedDate) as lastActive
      FROM VideoStatistics vs
      WHERE vs.UserId IS NOT NULL 
      GROUP BY vs.UserId
      ORDER BY MAX(vs.CreatedDate) DESC
    `;

    const result = await pool.request().query(userQuery);
    console.log(`Found ${result.recordset.length} active users in last 30 days`);
    console.log('\nSample users:', JSON.stringify(result.recordset.slice(0, 3), null, 2));

    await pool.close();
    console.log('\n✓ Test complete');
    process.exit(0);
  } catch (error) {
    console.error('\n✗ Error:', error.message);
    process.exit(1);
  }
}

testUserData();
