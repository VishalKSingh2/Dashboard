// Network connectivity test for colleague
console.log('🔍 Testing Network Connectivity to Database Server\n');

const dns = require('dns');
const net = require('net');

const SERVER = 'production.production.realtimereporting.livinglens.tv';
const PORT = 1433;

// Test 1: DNS Resolution
console.log('1️⃣ Testing DNS Resolution...');
dns.lookup(SERVER, (err, address) => {
    if (err) {
        console.log('   ❌ DNS FAILED:', err.message);
        console.log('   → Cannot resolve server name');
        console.log('   → Check internet connection or DNS settings\n');
        return;
    }
    console.log('   ✅ DNS resolved:', address);
    
    // Test 2: TCP Connection
    console.log('\n2️⃣ Testing TCP Connection to port', PORT, '...');
    
    const socket = new net.Socket();
    const timeout = 10000; // 10 seconds
    
    socket.setTimeout(timeout);
    
    socket.on('connect', () => {
        console.log('   ✅ CONNECTION SUCCESSFUL!');
        console.log('   → Port', PORT, 'is reachable');
        console.log('   → Your network can reach the database server\n');
        socket.destroy();
        
        console.log('✅ Network connectivity is OK!\n');
        console.log('If you still get ESOCKET error, check:');
        console.log('  1. Antivirus/Firewall blocking the connection');
        console.log('  2. Company proxy settings');
        console.log('  3. VPN requirement\n');
        process.exit(0);
    });
    
    socket.on('timeout', () => {
        console.log('   ❌ CONNECTION TIMEOUT');
        console.log('   → Server is not responding on port', PORT);
        console.log('   → This could mean:\n');
        console.log('   • Firewall is blocking port', PORT);
        console.log('   • You need to connect to VPN first');
        console.log('   • The server is down (unlikely)');
        console.log('   • Your company network blocks SQL connections\n');
        
        console.log('🔧 Solutions:');
        console.log('  1. Connect to company VPN if required');
        console.log('  2. Check Windows Firewall settings');
        console.log('  3. Disable antivirus temporarily to test');
        console.log('  4. Ask IT to allow outbound connections to port 1433\n');
        
        socket.destroy();
        process.exit(1);
    });
    
    socket.on('error', (err) => {
        console.log('   ❌ CONNECTION ERROR:', err.message);
        console.log('   → Code:', err.code);
        
        if (err.code === 'ECONNREFUSED') {
            console.log('   → Server actively refused the connection');
            console.log('   → Port might be closed or filtered\n');
        } else if (err.code === 'ETIMEDOUT') {
            console.log('   → Connection timed out');
            console.log('   → Firewall or network issue\n');
        } else if (err.code === 'ENETUNREACH') {
            console.log('   → Network is unreachable');
            console.log('   → Check internet connection\n');
        }
        
        console.log('🔧 Solutions:');
        console.log('  1. Verify you have internet access');
        console.log('  2. Connect to VPN if required');
        console.log('  3. Check firewall settings');
        console.log('  4. Try from a different network\n');
        
        process.exit(1);
    });
    
    console.log('   Attempting to connect to', SERVER + ':' + PORT);
    console.log('   Timeout:', timeout / 1000, 'seconds\n');
    
    socket.connect(PORT, address);
});
