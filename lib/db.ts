import sql from 'mssql';
import { queryCache } from './queryCache';

// SQL Server configuration - Optimized for better performance
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
    // Performance optimization settings
    packetSize: 32768, // Increase packet size for better throughput
    abortTransactionOnError: true,
    useUTC: false, // Use local timezone for better date handling
  },
  requestTimeout: 600000, // 10 minutes for very large report queries on unindexed DB
  pool: {
    max: 20, // Increased from 10 to handle more concurrent requests
    min: 2, // Keep 2 connections alive to reduce connection overhead
    idleTimeoutMillis: 60000, // Increased to 60s to reuse connections longer
  },
};

// Connection pool
let pool: sql.ConnectionPool | null = null;

/**
 * Get database connection pool with health check
 */
export async function getPool(): Promise<sql.ConnectionPool> {
  if (!pool || !pool.connected || !pool.healthy) {
    // Close existing pool if it exists but is not healthy
    if (pool) {
      try {
        console.log('Closing unhealthy connection pool...');
        await pool.close();
      } catch (e) {
        console.error('Error closing pool:', e);
      }
      pool = null;
    }
    
    console.log('Creating new database connection pool...');
    try {
      pool = await sql.connect(config);
      console.log('Database connected successfully');
      
      // Test connection with a simple query
      await pool.request().query('SELECT 1 AS test');
      console.log('Connection health check passed');
    } catch (error) {
      console.error('Failed to create database pool:', error);
      pool = null;
      throw error;
    }
  }
  return pool;
}

/**
 * Execute a SQL query with optional caching
 */
export async function query<T = any>(
  queryText: string,
  params?: Record<string, any>,
  options?: { timeout?: number; cache?: boolean; cacheTTL?: number }
): Promise<T[]> {
  const startTime = Date.now();
  const { timeout, cache = false, cacheTTL } = options || {};
  
  // Check cache if enabled
  if (cache) {
    const cached = queryCache.get<T[]>(queryText, params);
    if (cached) {
      console.log('Cache hit for query');
      return cached;
    }
  }
  
  let retries = 0;
  const MAX_RETRIES = 2;
  
  while (retries <= MAX_RETRIES) {
    try {
      const pool = await getPool();
      const request = pool.request();

      // Set request timeout (default 180000ms for large queries)
      const requestTimeout = timeout || 180000;
      (request as any).timeout = requestTimeout;

      // Add parameters if provided
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          request.input(key, value);
        });
      }

      const result = await request.query(queryText);
      const data = result.recordset as T[];
      
      // Cache the result if enabled
      if (cache) {
        queryCache.set(queryText, data, params, cacheTTL);
      }
      
      // Log slow queries (> 5 seconds)
      const duration = Date.now() - startTime;
      if (duration > 5000) {
        console.warn(`Slow query detected (${duration}ms):`, {
          query: queryText.substring(0, 100) + '...',
          params,
        });
      }
      
      return data;
    } catch (error: any) {
      retries++;
      console.error(`Database query error (attempt ${retries}/${MAX_RETRIES + 1}):`, error?.message || error);
      
      // Check if it's a connection error that we should retry
      const isConnectionError = error?.message?.includes('connection') || 
                                error?.message?.includes('timeout') ||
                                error?.code === 'ETIMEOUT' ||
                                error?.code === 'ECONNRESET';
      
      if (isConnectionError && retries <= MAX_RETRIES) {
        console.log('Connection error detected, recreating pool and retrying...');
        // Force pool recreation by setting the module-level pool to null
        const currentPool = pool;
        if (currentPool) {
          try {
            await currentPool.close();
          } catch (e) {
            // Ignore close errors
          }
        }
        pool = null;
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 2000 * retries));
        continue;
      }
      
      // If not a connection error or max retries reached, throw
      console.error('Query:', queryText.substring(0, 200));
      console.error('Params:', params);
      throw error;
    }
  }
  
  throw new Error('Query failed after all retries');
}

/**
 * Execute a SQL query (legacy signature for backward compatibility)
 */
export async function queryLegacy<T = any>(
  queryText: string,
  params?: Record<string, any>,
  timeout?: number
): Promise<T[]> {
  return query<T>(queryText, params, { timeout });
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