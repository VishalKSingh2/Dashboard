const http = require('http');

http.get('http://localhost:3000/api/dashboard-db?customerType=all&mediaType=all&startDate=2025-06-01&endDate=2025-06-30', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const json = JSON.parse(data);
    console.log('Top Channels:');
    json.topChannels.forEach(ch => {
      console.log(`  ${ch.name}: ${ch.hours} hrs`);
    });
  });
});
