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

async function inspectSchema() {
  try {
    const pool = await sql.connect(config);
    console.log('✓ Connected to database\n');

    const tables = ['VideoStatistics', 'ClientOverview', 'Customer', 'UserStatistics'];
    
    for (const table of tables) {
      console.log(`\n=== ${table} ===`);
      const query = `
        SELECT 
          COLUMN_NAME,
          DATA_TYPE,
          CHARACTER_MAXIMUM_LENGTH,
          IS_NULLABLE
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = '${table}'
        ORDER BY ORDINAL_POSITION
      `;
      
      const result = await pool.request().query(query);
      console.log('Columns:');
      result.recordset.forEach(col => {
        const length = col.CHARACTER_MAXIMUM_LENGTH ? `(${col.CHARACTER_MAXIMUM_LENGTH})` : '';
        const nullable = col.IS_NULLABLE === 'YES' ? 'NULL' : 'NOT NULL';
        console.log(`  - ${col.COLUMN_NAME}: ${col.DATA_TYPE}${length} ${nullable}`);
      });
    }

    await pool.close();
    console.log('\n✓ Schema inspection complete');
    process.exit(0);
  } catch (error) {
    console.error('\n✗ Error:', error.message);
    process.exit(1);
  }
}

inspectSchema();
