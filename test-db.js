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
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

async function testDatabase() {
  try {
    // Test connection
    console.log('Testing database connection...');
    const pool = await sql.connect(config);
    console.log('✓ Database connected successfully\n');

    // Check tables
    console.log('Checking required tables...');
    const tablesQuery = `
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_TYPE = 'BASE TABLE' 
      AND TABLE_NAME IN ('VideoStatistics', 'ClientOverview', 'Customer', 'UserStatistics')
      ORDER BY TABLE_NAME
    `;
    const tables = await pool.request().query(tablesQuery);
    
    if (tables.recordset.length > 0) {
      console.log('✓ Found tables:');
      tables.recordset.forEach(t => console.log('  -', t.TABLE_NAME));
    } else {
      console.log('✗ Required tables not found!');
    }

    // Check data counts
    console.log('\nChecking data in tables...');
    
    const videoStatsCount = await pool.request().query('SELECT COUNT(*) as count FROM VideoStatistics');
    console.log(`  - VideoStatistics: ${videoStatsCount.recordset[0].count} rows`);
    
    const clientCount = await pool.request().query('SELECT COUNT(*) as count FROM ClientOverview');
    console.log(`  - ClientOverview: ${clientCount.recordset[0].count} rows`);
    
    const customerCount = await pool.request().query('SELECT COUNT(*) as count FROM Customer');
    console.log(`  - Customer: ${customerCount.recordset[0].count} rows`);
    
    const userCount = await pool.request().query('SELECT COUNT(*) as count FROM UserStatistics');
    console.log(`  - UserStatistics: ${userCount.recordset[0].count} rows`);

    // Test sample query
    console.log('\nTesting sample query...');
    const sampleQuery = `
      SELECT TOP 5 
        vs.VideoId,
        vs.MediaSource,
        vs.CreatedDate,
        c.Name as CustomerName
      FROM VideoStatistics vs
      LEFT JOIN ClientOverview co ON vs.ClientId = co.Id
      LEFT JOIN Customer c ON co.CustomerId = c.Id
      ORDER BY vs.CreatedDate DESC
    `;
    const sample = await pool.request().query(sampleQuery);
    console.log('✓ Sample query successful');
    console.log('  Sample data:', JSON.stringify(sample.recordset[0], null, 2));

    await pool.close();
    console.log('\n✓ All database tests passed!');
    process.exit(0);
  } catch (error) {
    console.error('\n✗ Database test failed:', error.message);
    console.error('Details:', error);
    process.exit(1);
  }
}

testDatabase();
