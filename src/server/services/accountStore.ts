import { query } from '../db/index.js'
import { encrypt, decrypt } from './crypto.js'

export interface StoredAccount {
  id: string
  label: string
  email: string
  password: string
  smtpHost: string
  smtpPort: number
  smtpSecure: boolean
  imapHost: string
  imapPort: number
  imapSecure: boolean
}

interface AccountRow {
  id: string
  label: string
  email: string
  password_enc: string
  smtp_host: string
  smtp_port: number
  smtp_secure: number
  imap_host: string
  imap_port: number
  imap_secure: number
}

export async function listAccounts(): Promise<StoredAccount[]> {
  const rows = await query<AccountRow[]>(
    'SELECT id, label, email, smtp_host, smtp_port, smtp_secure, imap_host, imap_port, imap_secure FROM email_accounts ORDER BY created_at ASC',
  )
  return rows.map(r => ({
    id: r.id,
    label: r.label,
    email: r.email,
    password: '',
    smtpHost: r.smtp_host,
    smtpPort: r.smtp_port,
    smtpSecure: r.smtp_secure !== 0,
    imapHost: r.imap_host,
    imapPort: r.imap_port,
    imapSecure: r.imap_secure !== 0,
  }))
}

export async function getAccountConfig(id: string): Promise<StoredAccount | null> {
  const rows = await query<AccountRow[]>(
    'SELECT * FROM email_accounts WHERE id = ?',
    [id],
  )
  if (!rows.length) return null
  const r = rows[0]
  let password = ''
  try { password = decrypt(r.password_enc) } catch { console.warn('[ACCOUNT] 密码解密失败, id:', r.id) }
  return {
    id: r.id,
    label: r.label,
    email: r.email,
    password,
    smtpHost: r.smtp_host,
    smtpPort: r.smtp_port,
    smtpSecure: r.smtp_secure !== 0,
    imapHost: r.imap_host,
    imapPort: r.imap_port,
    imapSecure: r.imap_secure !== 0,
  }
}

export async function saveAccount(config: StoredAccount) {
  const encPwd = encrypt(config.password)
  await query(
    `INSERT INTO email_accounts (id, label, email, password_enc, smtp_host, smtp_port, smtp_secure, imap_host, imap_port, imap_secure)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       label = VALUES(label),
       email = VALUES(email),
       password_enc = VALUES(password_enc),
       smtp_host = VALUES(smtp_host),
       smtp_port = VALUES(smtp_port),
       smtp_secure = VALUES(smtp_secure),
       imap_host = VALUES(imap_host),
       imap_port = VALUES(imap_port),
       imap_secure = VALUES(imap_secure)`,
    [config.id, config.label, config.email, encPwd,
     config.smtpHost, config.smtpPort, config.smtpSecure ? 1 : 0,
     config.imapHost, config.imapPort, config.imapSecure ? 1 : 0],
  )
}

export async function deleteAccount(id: string) {
  await query('DELETE FROM email_accounts WHERE id = ?', [id])
}
