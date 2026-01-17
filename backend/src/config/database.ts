/**
 * PostgreSQL database connection configuration
 * Uses connection pooling for better performance
 */

import { Pool, PoolConfig } from "pg";

/**
 * Parse DATABASE_URL and create pool configuration
 * Expected format: postgresql://user:password@host:port/database
 */
function parseDatabaseUrl(): PoolConfig {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  try {
    const url = new URL(databaseUrl);

    return {
      user: url.username,
      password: url.password,
      host: url.hostname,
      port: parseInt(url.port || "5432", 10),
      database: url.pathname.slice(1), // Remove leading slash
      ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
      max: parseInt(process.env.DB_POOL_MAX || "20", 10), // Maximum pool size
      idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT || "30000", 10),
      connectionTimeoutMillis: parseInt(process.env.DB_POOL_CONNECTION_TIMEOUT || "2000", 10),
    };
  } catch (error) {
    throw new Error(`Invalid DATABASE_URL format: ${error}`);
  }
}

/**
 * PostgreSQL connection pool
 * Singleton pattern to ensure single pool instance
 */
let pool: Pool | null = null;

/**
 * Get or create database connection pool
 * @returns PostgreSQL connection pool
 */
export function getPool(): Pool {
  if (!pool) {
    const config = parseDatabaseUrl();
    pool = new Pool(config);

    // Handle pool errors
    pool.on("error", (err) => {
      console.error("Unexpected error on idle database client", err);
    });
  }

  return pool;
}

/**
 * Test database connection
 * @returns Promise that resolves if connection is successful
 */
export async function testConnection(): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("SELECT NOW()");
    console.log("Database connection successful");
  } finally {
    client.release();
  }
}

/**
 * Close database connection pool
 * Should be called on application shutdown
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    console.log("Database connection pool closed");
  }
}
