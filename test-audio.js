const http = require('http');

http.get('http://localhost:3000/api/dashboard-db?customerType=all&mediaType=all&startDate=2025-06-01&endDate=2025-06-30', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const json = JSON.parse(data);
    console.log('Media Uploads with Audio:');
    json.mediaUploads.filter(d => d.video > 0 || d.showreel > 0 || d.audio > 0).forEach(day => {
      console.log(`  ${day.date}: Video=${day.video}, Showreel=${day.showreel}, Audio=${day.audio}`);
    });
  });
});
