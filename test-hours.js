const http = require('http');

const url = 'http://localhost:3000/api/dashboard-db?customerType=all&mediaType=all&startDate=2025-06-01&endDate=2025-06-30';

http.get(url, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const json = JSON.parse(data);
    console.log('Total Hours (card):', json.metrics.totalHours.hours, 'hrs');
    console.log('\nDaily Hours Data:');
    let sum = 0;
    json.mediaHours.forEach(day => {
      if (day.hours > 0) {
        console.log(`  ${day.date}: ${day.hours} hrs`);
        sum += day.hours;
      }
    });
    console.log(`\nSum of daily hours: ${sum.toFixed(2)} hrs`);
    console.log(`Card shows: ${json.metrics.totalHours.hours} hrs`);
    console.log(`\nDifference: Card is using Math.round() which rounds 0.73 to 1`);
  });
}).on('error', (err) => console.error('Error:', err.message));
