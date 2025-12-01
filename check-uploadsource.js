const sql = require('mssql');

const config = {
  server: 'development.development.realtimereporting.livinglens.tv',
  database: 'Realtime-Reporting',
  user: 'lensadmin',
  password: 'YD07dE-VBr_w0BUh%5He%u!7wut',
  options: {
    encrypt: true,
    trustServerCertificate: true,
  },
};

async function checkUploadSource() {
  try {
    const pool = await sql.connect(config);
    const result = await pool.request().query(`
      SELECT DISTINCT RTRIM(UploadSource) as UploadSource, COUNT(*) as count 
      FROM VideoStatistics 
      WHERE UploadSource IS NOT NULL 
      GROUP BY RTRIM(UploadSource)
      ORDER BY COUNT(*) DESC
    `);
    
    console.log('UploadSource values:');
    result.recordset.forEach(r => console.log(`  '${r.UploadSource}': ${r.count}`));
    
    await pool.close();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkUploadSource();
