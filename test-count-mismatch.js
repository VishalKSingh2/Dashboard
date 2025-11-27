const http = require('http');

http.get('http://localhost:3000/api/dashboard-db?customerType=all&mediaType=all&startDate=2025-06-20&endDate=2025-06-27', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const json = JSON.parse(data);
    
    console.log('=== CARD METRIC ===');
    console.log('Total Videos:', json.metrics.totalVideos.count);
    console.log('Total Showreels:', json.metrics.totalShowreels.count);
    console.log('Total Audio:', json.metrics.totalAudio.count);
    
    console.log('\n=== CHART DATA (mediaUploads) ===');
    let videoSum = 0;
    let showreelSum = 0;
    let audioSum = 0;
    
    json.mediaUploads.forEach(d => {
      console.log(`${d.date}: Video=${d.video}, Showreel=${d.showreel}, Audio=${d.audio}`);
      videoSum += d.video;
      showreelSum += d.showreel;
      audioSum += d.audio;
    });
    
    console.log('\n=== CHART TOTALS ===');
    console.log('Video Sum:', videoSum);
    console.log('Showreel Sum:', showreelSum);
    console.log('Audio Sum:', audioSum);
    
    console.log('\n=== MATCH? ===');
    console.log('Videos Match:', json.metrics.totalVideos.count === videoSum ? '✓ YES' : '✗ NO');
    console.log('Showreels Match:', json.metrics.totalShowreels.count === showreelSum ? '✓ YES' : '✗ NO');
    console.log('Audio Match:', json.metrics.totalAudio.count === audioSum ? '✓ YES' : '✗ NO');
  });
});
