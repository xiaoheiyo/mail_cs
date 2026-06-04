import mysql, { type Pool, type PoolConnection } from 'mysql2/promise'
import type { DbConfig } from '../services/configStore.js'

let pool: Pool | null = null

export function initPool(config: DbConfig) {
  if (pool) {
    pool.end().catch(() => {})
  }
  pool = mysql.createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    waitForConnections: true,
    connectionLimit: 10,
    charset: 'utf8mb4',
  })
}

export function getPool(): Pool {
  if (!pool) throw new Error('数据库未配置，请先完成初始化')
  return pool
}

export async function query<T = any>(sql: string, params?: any[]): Promise<T> {
  const conn = getPool()
  const [rows] = await conn.execute(sql, params)
  return rows as T
}

export async function getConnection(): Promise<PoolConnection> {
  return getPool().getConnection()
}
