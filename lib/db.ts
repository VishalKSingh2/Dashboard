import sql from 'mssql';

// SQL Server configuration
const config: sql.config = {
  server: process.env.DB_SERVER || '',
  port: parseInt(process.env.DB_PORT || '1433'),
  database: process.env.DB_DATABASE || '',
  user: process.env.DB_USER || '',
  password: process.env.DB_PASSWORD || '',
  options: {
    encrypt: true, // Use encryption
    trustServerCertificate: true, // For local dev
    enableArithAbort: true,
    connectTimeout: 30000,
  },
  requestTimeout: 120000, // 120 seconds for large queries
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

// Connection pool
let pool: sql.ConnectionPool | null = null;

/**
 * Get database connection pool
 */
export async function getPool(): Promise<sql.ConnectionPool> {
  if (!pool || !pool.connected) {
    // Close existing pool if it exists but is not connected
    if (pool && !pool.connected) {
      try {
        await pool.close();
      } catch (e) {
        console.error('Error closing disconnected pool:', e);
      }
      pool = null;
    }
    
    console.log('Creating new database connection pool...');
    pool = await sql.connect(config);
    console.log('Database connected successfully');
  }
  return pool;
}

/**
 * Execute a SQL query
 */
export async function query<T = any>(
  queryText: string,
  params?: Record<string, any>,
  timeout?: number
): Promise<T[]> {
  try {
    const pool = await getPool();
    const request = pool.request();

    // Set request timeout (default 15000ms, can be overridden for large queries)
    if (timeout) {
      (request as any).timeout = timeout;
    }

    // Add parameters if provided
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        request.input(key, value);
      });
    }

    const result = await request.query(queryText);
    return result.recordset as T[];
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}

/**
 * Close database connection
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.close();
    pool = null;
  }
}

// Close pool on process exit
if (typeof process !== 'undefined') {
  process.on('SIGINT', async () => {
    await closePool();
    process.exit(0);
  });
}