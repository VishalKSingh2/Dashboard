const sql = require('mssql');

// Test with exact production credentials
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
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

async function testConnection() {
  console.log('Testing production database connection...');
  console.log('Server:', config.server);
  console.log('Port:', config.port);
  console.log('Database:', config.database);
  console.log('User:', config.user);
  console.log('Password length:', config.password.length);
  
  try {
    const pool = await sql.connect(config);
    console.log('✅ LOGIN SUCCESSFUL!');
    
    const result = await pool.request().query('SELECT @@VERSION as version');
    console.log('✅ Query successful');
    console.log('SQL Server version:', result.recordset[0].version);
    
    await pool.close();
    console.log('\n✅ All tests passed! Connection is working.');
    console.log('\n💡 Next steps:');
    console.log('   1. Make sure your .env file has the correct credentials');
    console.log('   2. Restart your Next.js dev server (Ctrl+C, then npm run dev)');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ CONNECTION FAILED!');
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
    
    if (error.code === 'ELOGIN') {
      console.error('\n🔍 Login failed - possible causes:');
      console.error('   1. Incorrect username or password');
      console.error('   2. User account is locked or disabled');
      console.error('   3. SQL Server authentication not enabled');
      console.error('   4. Password contains special characters that need escaping');
    } else if (error.code === 'ETIMEOUT' || error.code === 'ESOCKET') {
      console.error('\n🔍 Connection timeout - possible causes:');
      console.error('   1. Server is not reachable');
      console.error('   2. Firewall blocking connection');
      console.error('   3. Wrong server address or port');
    }
    
    process.exit(1);
  }
}

testConnection();
