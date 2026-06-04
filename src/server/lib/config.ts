import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'

export interface MailerConfig {
  host: string
  port: number
  secure?: boolean
  auth?: { user: string; pass: string }
  /** Ignore TLS certificate errors */
  ignoreCert?: boolean
  /** HTTP / SOCKS proxy URL, e.g. socks5://127.0.0.1:1080 */
  proxy?: string
  /** Connection timeout in ms (default 10000) */
  timeout?: number
}

const DEFAULTS = {
  secure: false,
  ignoreCert: false,
  timeout: 10000,
}

function loadEnv(): Partial<MailerConfig> {
  const cfg: Partial<MailerConfig> = {}
  if (process.env.SMTP_HOST) cfg.host = process.env.SMTP_HOST
  if (process.env.SMTP_PORT) cfg.port = parseInt(process.env.SMTP_PORT, 10)
  if (process.env.SMTP_SECURE) cfg.secure = process.env.SMTP_SECURE === 'true'
  if (process.env.SMTP_USER) cfg.auth = { ...cfg.auth, user: process.env.SMTP_USER } as any
  if (process.env.SMTP_PASS) cfg.auth = { ...cfg.auth, pass: process.env.SMTP_PASS } as any
  if (process.env.SMTP_PROXY) cfg.proxy = process.env.SMTP_PROXY
  if (process.env.SMTP_IGNORE_CERT) cfg.ignoreCert = process.env.SMTP_IGNORE_CERT === 'true'
  if (process.env.SMTP_TIMEOUT) cfg.timeout = parseInt(process.env.SMTP_TIMEOUT, 10)
  return cfg
}

function loadConfigFile(filePath?: string): Partial<MailerConfig> {
  const paths = filePath
    ? [filePath]
    : [
        resolve(process.cwd(), 'mailer.config.json'),
        resolve(process.cwd(), 'mailer.config.jsonc'),
        resolve(process.cwd(), '.mailerrc'),
      ]
  for (const p of paths) {
    if (existsSync(p)) {
      try {
        const raw = readFileSync(p, 'utf-8')
        return JSON.parse(raw)
      } catch { continue }
    }
  }
  return {}
}

export function resolveConfig(
  codeConfig: Partial<MailerConfig> = {},
  filePath?: string,
): MailerConfig {
  const fileConfig = loadConfigFile(filePath)
  const envConfig = loadEnv()
  const merged = { ...DEFAULTS, ...fileConfig, ...envConfig, ...codeConfig }
  return merged as MailerConfig
}
