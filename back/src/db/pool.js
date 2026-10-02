import mysql from 'mysql2/promise';
import config from '../config/index.js';

let pool;

export async function connectDB() {
  pool = mysql.createPool(config.db);

  // DATETIME columns are written by MySQL itself (CURRENT_TIMESTAMP / NOW()) and read back
  // as UTC (config.db.timezone 'Z'). Pin every session to UTC so that holds even when the
  // MySQL server runs in local time (production: Europe/Madrid) — otherwise times show +1/+2 h.
  // The SET is queued on the connection before any query the app sends through it.
  pool.on('connection', (connection) => {
    connection.query("SET time_zone = '+00:00'");
  });

  const conn = await pool.getConnection();
  console.log('[db] MySQL connected');
  conn.release();

  return pool;
}

export function getPool() {
  if (!pool) throw new Error('DB pool not initialized. Call connectDB() first.');
  return pool;
}

/** Execute a query and return all rows. */
export async function query(sql, params = []) {
  // Use query() instead of execute() to avoid BigInt/prepared-statement type issues.
  // mysql2 still escapes values safely via its client-side escaping.
  const [rows] = await getPool().query(sql, params);
  return rows;
}

/** Execute a query and return the first row or null. */
export async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] ?? null;
}
