/**
 * ERP database client for executing parameterized SQL queries.
 *
 * Notes:
 * - Uses a lazy-initialized pg Pool.
 * - Connection is read-only by convention (replica), but we still keep queries parameterized.
 * - SSL is configured via CA cert in env `ERP_DB_CA_CERT` (string contents).
 */

import { Pool, QueryResult, QueryResultRow } from "pg";
import { InternalServerError } from "../utils/errors";

/** Typed query parameters supported by `pg`. */
type PgParams = ReadonlyArray<unknown>;

/** ERP database client for executing raw SQL queries. */
class ErpDatabaseClient {
  private pool: Pool | null = null;

  /**
   * Initialize the ERP connection pool (idempotent).
   * @throws Error when required env vars are missing
   */
  public async initialize(): Promise<void> {
    if (this.pool) return;

    const url = process.env.ERP_DATABASE_URL;
    const ca = process.env.ERP_DB_CA_CERT;

    if (!url || url.trim().length === 0) {
      throw new Error("ERP_DATABASE_URL is required but was not provided");
    }

    // Best-effort SSL config. If CA is not provided, fall back to non-SSL config.
    // (Some providers require SSL; in that case set ERP_DB_CA_CERT.)
    const ssl = ca && ca.trim().length > 0 ? { ca } : undefined;

    this.pool = new Pool({
      connectionString: url,
      ssl,
    });
  }

  /**
   * Execute a parameterized SQL query.
   *
   * IMPORTANT: Always use parameters instead of interpolating user input.
   *
   * @param sql - SQL string with $1, $2... placeholders
   * @param params - Parameter values
   */
  public async query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params: PgParams = []
  ): Promise<QueryResult<T>> {
    if (!this.pool) {
      throw new InternalServerError("ERP database pool is not initialized");
    }
    return this.pool.query<T>(sql, params as any[]);
  }

  /** Shutdown the ERP connection pool (idempotent). */
  public async shutdown(): Promise<void> {
    if (!this.pool) return;
    await this.pool.end();
    this.pool = null;
  }
}

export const erpDb = new ErpDatabaseClient();

