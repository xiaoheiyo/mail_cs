import { query } from '../db/index.js'

export interface CachedEmail {
  id: string
  accountEmail: string
  from: string
  to: string
  subject: string
  body: string
  date: string
  seen: boolean
}

function cacheKey(addr: string, mailbox?: string): string {
  return mailbox ? `${addr}/${mailbox}` : addr
}

/** 查询该邮箱所有已缓存的邮件，按日期倒序 */
export async function getCachedEmails(emailAddr: string, mailbox?: string): Promise<CachedEmail[]> {
  const key = cacheKey(emailAddr, mailbox)
  const rows = await query<any[]>(
    `SELECT message_uid, from_addr, to_addr, subject, body, date, seen
     FROM cached_emails
     WHERE email_addr = ?
     ORDER BY date DESC`,
    [key],
  )

  return rows.map((r: any) => ({
    id: String(r.message_uid),
    accountEmail: emailAddr,
    from: r.from_addr,
    to: r.to_addr || '',
    subject: r.subject || '(无主题)',
    body: r.body || '',
    date: r.date ? new Date(r.date).toISOString() : new Date().toISOString(),
    seen: Boolean(r.seen),
  }))
}

/** 获取该邮箱已缓存的最高 UID，用于增量同步 */
export async function getMaxUid(emailAddr: string, mailbox?: string): Promise<number | null> {
  const key = cacheKey(emailAddr, mailbox)
  const rows = await query<any[]>(
    `SELECT MAX(message_uid) AS max_uid FROM cached_emails WHERE email_addr = ?`,
    [key],
  )
  return rows[0]?.max_uid ?? null
}

/** 批量写入缓存（重复 UID 自动忽略） */
export async function cacheEmails(emailAddr: string, emails: { uid: number; from: string; to: string; subject: string; body: string; date: Date; seen: boolean }[], mailbox?: string) {
  if (emails.length === 0) return
  const key = cacheKey(emailAddr, mailbox)

  const placeholders = emails.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(', ')
  const values: any[] = []
  for (const m of emails) {
    values.push(key, m.uid, m.from, m.to, m.subject, m.body, m.date, m.seen)
  }

  await query(
    `INSERT IGNORE INTO cached_emails
     (email_addr, message_uid, from_addr, to_addr, subject, body, date, seen)
     VALUES ${placeholders}`,
    values,
  )
}

/** 清除某邮箱的缓存 */
export async function clearCache(emailAddr: string, mailbox?: string) {
  const key = cacheKey(emailAddr, mailbox)
  await query(`DELETE FROM cached_emails WHERE email_addr = ?`, [key])
}

/** 清除全部缓存 */
export async function clearAllCache() {
  await query(`DELETE FROM cached_emails`)
}
