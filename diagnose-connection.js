const sql = require('mssql');

console.log('🔍 Database Connection Diagnostic Tool\n');
console.log('======================================\n');

// Step 1: Check environment variables
console.log('1️⃣ Checking Environment Variables:');
console.log('   DB_SERVER:', process.env.DB_SERVER || '❌ NOT SET');
console.log('   DB_PORT:', process.env.DB_PORT || '❌ NOT SET');
console.log('   DB_DATABASE:', process.env.DB_DATABASE || '❌ NOT SET');
console.log('   DB_USER:', process.env.DB_USER || '❌ NOT SET');
console.log('   DB_PASSWORD length:', process.env.DB_PASSWORD?.length || '❌ NOT SET');
console.log('   DB_PASSWORD (first 10 chars):', process.env.DB_PASSWORD?.substring(0, 10) || '❌ NOT SET');
console.log('   DB_PASSWORD (last 10 chars):', process.env.DB_PASSWORD?.substring(process.env.DB_PASSWORD.length - 10) || '❌ NOT SET');

if (!process.env.DB_PASSWORD) {
    console.log('\n❌ ERROR: Environment variables not loaded!');
    console.log('   Make sure you have a .env file in the project root.');
    console.log('   For Next.js, the .env file is automatically loaded.\n');
}

// Step 2: Try to load from .env file manually
console.log('\n2️⃣ Loading from .env file:');
try {
    require('dotenv').config();
    console.log('   ✅ dotenv loaded');
    console.log('   DB_PASSWORD length:', process.env.DB_PASSWORD?.length || 0);
} catch (e) {
    console.log('   ⚠️ dotenv not installed (this is OK for Next.js)');
}

// Step 3: Test database connection
console.log('\n3️⃣ Testing Database Connection:');

const config = {
    server: process.env.DB_SERVER || 'production.production.realtimereporting.livinglens.tv',
    port: parseInt(process.env.DB_PORT || '1433'),
    database: process.env.DB_DATABASE || 'Realtime-Reporting',
    user: process.env.DB_USER || 'lensadmin',
    password: process.env.DB_PASSWORD || '',
    options: {
        encrypt: true,
        trustServerCertificate: true,
        enableArithAbort: true,
        connectTimeout: 30000,
    },
};

console.log('   Connecting to:', config.server);
console.log('   Database:', config.database);
console.log('   User:', config.user);
console.log('   Password length:', config.password.length);

async function testConnection() {
    try {
        console.log('\n   Attempting connection...');
        const pool = await sql.connect(config);
        console.log('   ✅ CONNECTION SUCCESSFUL!');
        
        const result = await pool.request().query('SELECT @@VERSION as version');
        console.log('   ✅ Query successful');
        console.log('   SQL Server:', result.recordset[0].version.split('\n')[0]);
        
        await pool.close();
        console.log('\n✅ ALL TESTS PASSED!');
        console.log('   Your database connection is working correctly.\n');
        process.exit(0);
    } catch (error) {
        console.error('\n❌ CONNECTION FAILED!');
        console.error('   Error Code:', error.code);
        console.error('   Error Message:', error.message);
        
        console.log('\n🔧 Troubleshooting Steps:\n');
        
        if (error.code === 'ELOGIN') {
            console.log('   ❌ LOGIN ERROR - Wrong username or password');
            console.log('   Solutions:');
            console.log('   1. Check if password has special characters (#, $, etc.)');
            console.log('   2. Wrap password in DOUBLE QUOTES in .env file:');
            console.log('      DB_PASSWORD="your-password-here"');
            console.log('   3. Verify the password is correct');
            console.log('   4. Make sure no extra spaces around the password');
            console.log('   5. Check if # character in password is causing issues');
            console.log('\n   Current password length:', config.password.length);
            console.log('   Expected length for production password: 30');
            console.log('   First 10 chars:', config.password.substring(0, 10));
            console.log('   Last 10 chars:', config.password.substring(config.password.length - 10));
        } else if (error.code === 'ETIMEOUT' || error.code === 'ESOCKET') {
            console.log('   ❌ CONNECTION TIMEOUT - Cannot reach server');
            console.log('   Solutions:');
            console.log('   1. Check if the server URL is correct');
            console.log('   2. Verify firewall is not blocking the connection');
            console.log('   3. Check if VPN is required');
            console.log('   4. Try pinging the server:', config.server);
        } else if (error.code === 'ENOTFOUND') {
            console.log('   ❌ SERVER NOT FOUND - DNS resolution failed');
            console.log('   Solutions:');
            console.log('   1. Check if DB_SERVER is set correctly in .env');
            console.log('   2. Verify the server address:', config.server);
        } else {
            console.log('   ❌ UNKNOWN ERROR');
            console.log('   Check the error details above');
        }
        
        console.log('\n📝 Quick Fix Checklist:');
        console.log('   □ .env file exists in project root');
        console.log('   □ Password wrapped in double quotes: DB_PASSWORD="..."');
        console.log('   □ No extra spaces in .env file');
        console.log('   □ Server stopped and restarted after .env changes');
        console.log('   □ Using correct production/dev credentials\n');
        
        process.exit(1);
    }
}

testConnection();
