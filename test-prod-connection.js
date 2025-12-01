const sql = require('mssql');

const config = {
  server: 'production.production.realtimereporting.livinglens.tv',
  database: 'Realtime-Reporting',
  user: 'lensadmin',
  password: 'gRbB8up8R55I7Q8ae29n#OFZQSLQ*l',
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

async function testProduction() {
  try {
    console.log('🔄 Connecting to production database...');
    console.log('Server:', config.server);
    console.log('Database:', config.database);
    
    const pool = await sql.connect(config);
    console.log('✅ Connected successfully!\n');

    // Test all required tables
    const tables = ['VideoStatistics', 'ClientOverview', 'Customer', 'UserStatistics'];
    
    for (const table of tables) {
      const result = await pool.request().query(`SELECT COUNT(*) as count FROM ${table}`);
      console.log(`✓ ${table}: ${result.recordset[0].count.toLocaleString()} rows`);
    }

    // Test schema check
    console.log('\n📋 Checking VideoStatistics schema...');
    const columns = await pool.request().query(`
      SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'VideoStatistics'
      ORDER BY ORDINAL_POSITION
    `);
    
    console.log('Columns:');
    columns.recordset.forEach(col => {
      console.log(`  - ${col.COLUMN_NAME} (${col.DATA_TYPE}${col.CHARACTER_MAXIMUM_LENGTH ? `(${col.CHARACTER_MAXIMUM_LENGTH})` : ''})`);
    });

    await pool.close();
    console.log('\n✅ Production database is ready!');
    console.log('\n💡 Now restart your Next.js dev server to use the production database:');
    console.log('   1. Press Ctrl+C in the dev server terminal');
    console.log('   2. Run: npm run dev');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Production database connection failed!');
    console.error('Error:', error.message);
    console.error('\nPlease check:');
    console.error('  1. Server URL is correct');
    console.error('  2. Database credentials are valid');
    console.error('  3. Firewall allows connection to production server');
    process.exit(1);
  }
}

testProduction();
