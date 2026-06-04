import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs'
import { join } from 'path'
import { randomBytes } from 'crypto'
import { setSecretKey } from './crypto.js'

const DATA_DIR = join(process.cwd(), 'data')
const CONFIG_PATH = join(DATA_DIR, 'db-config.json')

export interface DbConfig {
  host: string
  port: number
  user: string
  password: string
  database: string
  secretKey: string
  adminPasswordHash?: string
}

export function getDbConfig(): DbConfig | null {
  try {
    if (!existsSync(CONFIG_PATH)) return null
    const raw = readFileSync(CONFIG_PATH, 'utf-8')
    const cfg = JSON.parse(raw) as DbConfig
    // 兼容旧配置：缺少 secretKey 时自动生成并回写
    if (!cfg.secretKey) {
      cfg.secretKey = generateSecretKey()
      saveDbConfig(cfg)
    }
    return cfg
  } catch {
    return null
  }
}

export function saveDbConfig(config: DbConfig) {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true })
  }
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8')
  setSecretKey(config.secretKey)
}

export function generateSecretKey(): string {
  return randomBytes(32).toString('hex')
}

export function deleteConfig() {
  if (existsSync(CONFIG_PATH)) unlinkSync(CONFIG_PATH)
}
