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

async function checkAllChannels() {
  try {
    const pool = await sql.connect(config);
    console.log('✓ Connected to database\n');

    const query = `
      SELECT 
        co.Name as name,
        SUM(CAST(vs.LengthInMilliseconds AS BIGINT)) / 3600000.0 as hours
      FROM VideoStatistics vs
      INNER JOIN ClientOverview co ON RTRIM(vs.ClientId) = RTRIM(co.Id)
      WHERE CAST(vs.CreatedDate AS DATE) >= '2025-06-21'
        AND CAST(vs.CreatedDate AS DATE) <= '2025-06-30'
      GROUP BY co.Name
      ORDER BY SUM(CAST(vs.LengthInMilliseconds AS BIGINT)) DESC
    `;

    const result = await pool.request().query(query);
    
    console.log('=== ALL Channels (June 21-30) ===');
    let totalHours = 0;
    let unroundedTotal = 0;
    result.recordset.forEach((row, index) => {
      const hours = Math.round(row.hours * 100) / 100;
      totalHours += hours;
      unroundedTotal += row.hours;
      console.log(`${index + 1}. ${row.name}: ${hours} hrs (unrounded: ${row.hours})`);
    });
    console.log(`\nRounded sum: ${totalHours.toFixed(2)} hrs`);
    console.log(`Unrounded sum: ${unroundedTotal} hrs`);
    console.log(`Unrounded then rounded: ${Math.round(unroundedTotal * 100) / 100} hrs`);
    console.log(`Number of channels: ${result.recordset.length}`);

    await pool.close();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkAllChannels();
