import mariadb from 'mariadb';
import { readdir, readFile } from 'node:fs/promises';
import { config } from './config.mjs';

export const pool = mariadb.createPool({
  host: config.db.host, port: config.db.port, user: config.db.user, password: config.db.password, database: config.db.database,
  ssl: config.db.ssl ? { rejectUnauthorized: false } : false,
  connectionLimit: 8, acquireTimeout: 15000, bigIntAsNumber: true, insertIdAsNumber: true, decimalAsNumber: true, charset: 'utf8mb4',
});

export const query = (sql, params) => pool.query(sql, params);
export const one = async (sql, params) => (await pool.query(sql, params))[0] ?? null;

export async function transaction(work) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await work(conn);
    await conn.commit();
    return result;
  } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); }
}

export async function resetDatabase() {
  if (!config.test) throw new Error('resetDatabase 는 테스트 모드에서만 실행합니다.');
  const conn = await pool.getConnection();
  try {
    await conn.query('SET FOREIGN_KEY_CHECKS=0');
    const tables = await conn.query('SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE()');
    for (const row of tables) await conn.query(`DROP TABLE \`${row.name}\``);
    await conn.query('SET FOREIGN_KEY_CHECKS=1');
  } finally { conn.release(); }
}

export async function migrate() {
  await query('CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(100) NOT NULL PRIMARY KEY, applied_at BIGINT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
  const done = new Set((await query('SELECT version FROM schema_migrations')).map(row => row.version));
  const dir = new URL('./migrations/', import.meta.url);
  const applied = [];
  for (const file of (await readdir(dir)).filter(name => name.endsWith('.sql')).sort()) {
    if (done.has(file)) continue;
    const sql = await readFile(new URL(file, dir), 'utf8');
    for (const statement of sql.split(/;\s*(?:\r?\n|$)/).map(part => part.trim()).filter(Boolean)) await query(statement);
    await query('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)', [file, Date.now()]);
    applied.push(file);
  }
  return applied;
}
