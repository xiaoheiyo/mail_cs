import { query } from '../db/index.js'
import { getAccountConfig } from './accountStore.js'
import { sendMail } from './smtpService.js'

interface QueueItem {
  id: number
  account_id: string
  to_addr: string
  subject: string
  body: string
  attachments: string | null
  status: string
  retry_count: number
  max_retries: number
  last_error: string | null
}

// 默认重试间隔（秒），每次翻倍：30s, 1m, 2m, 4m, 8m
const RETRY_DELAYS = [30, 60, 120, 240, 480]

/** 将邮件加入发送队列 */
export async function enqueueSend(accountId: string, to: string, subject: string, body: string, attachments?: any[]) {
  const nextRetry = new Date(Date.now() + RETRY_DELAYS[0] * 1000)
  await query(
    `INSERT INTO send_queue (account_id, to_addr, subject, body, attachments, next_retry_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [accountId, to, subject, body, attachments ? JSON.stringify(attachments) : null, nextRetry],
  )
}

/** 获取待发送的队列项 */
export async function getPendingQueue(): Promise<QueueItem[]> {
  return query<any[]>(
    `SELECT * FROM send_queue
     WHERE status = 'pending' AND next_retry_at <= NOW()
     ORDER BY created_at ASC LIMIT 10`,
  )
}

/** 处理队列中的一项 */
export async function processQueueItem(item: QueueItem): Promise<'sent' | 'retry'> {
  const stored = await getAccountConfig(item.account_id)
  if (!stored || !stored.password) {
    await failQueueItem(item.id, '账户配置无效')
    return 'retry'
  }

  const smtpCfg = {
    host: stored.smtpHost,
    port: stored.smtpPort,
    secure: stored.smtpSecure,
    user: stored.email,
    pass: stored.password,
  }

  let attachments: any[] | undefined
  if (item.attachments) {
    try { attachments = JSON.parse(item.attachments) } catch {}
  }

  try {
    await query('UPDATE send_queue SET status = ? WHERE id = ?', ['sending', item.id])
    await sendMail(smtpCfg, {
      from: stored.email,
      to: item.to_addr,
      subject: item.subject,
      body: item.body,
      attachments,
      dsn: { notify: ['failure', 'delay'] },
    })
    await query('DELETE FROM send_queue WHERE id = ?', [item.id])
    return 'sent'
  } catch (err: any) {
    const nextRetryIdx = item.retry_count + 1
    if (nextRetryIdx >= item.max_retries) {
      await failQueueItem(item.id, err.message || '发送失败')
      return 'retry'
    }
    const delay = RETRY_DELAYS[Math.min(nextRetryIdx, RETRY_DELAYS.length - 1)]
    const nextRetry = new Date(Date.now() + delay * 1000)
    await query(
      'UPDATE send_queue SET status = ?, retry_count = ?, last_error = ?, next_retry_at = ? WHERE id = ?',
      ['pending', nextRetryIdx, err.message || '发送失败', nextRetry, item.id],
    )
    return 'retry'
  }
}

async function failQueueItem(id: number, error: string) {
  await query(
    'UPDATE send_queue SET status = ?, last_error = ? WHERE id = ?',
    ['failed', error, id],
  )
}

/** 获取队列统计 */
export async function getQueueStats() {
  const rows = await query<any[]>('SELECT status, COUNT(*) as cnt FROM send_queue GROUP BY status')
  const stats: Record<string, number> = { pending: 0, sending: 0, failed: 0 }
  for (const r of rows) stats[r.status] = r.cnt
  return stats
}

/** 获取失败列表 */
export async function getFailedQueue() {
  return query<any[]>(
    'SELECT id, account_id, to_addr, subject, retry_count, last_error, created_at FROM send_queue WHERE status = ? ORDER BY updated_at DESC LIMIT 50',
    ['failed'],
  )
}

/** 清空/重试失败项 */
export async function retryFailedItem(id: number) {
  const delay = RETRY_DELAYS[0]
  await query(
    'UPDATE send_queue SET status = ?, retry_count = 0, last_error = NULL, next_retry_at = ? WHERE id = ?',
    ['pending', new Date(Date.now() + delay * 1000), id],
  )
}

/** 删除队列项 */
export async function deleteQueueItem(id: number) {
  await query('DELETE FROM send_queue WHERE id = ?', [id])
}

// 后台循环处理队列
let processorTimer: ReturnType<typeof setInterval> | null = null

export function startQueueProcessor(intervalMs = 15_000) {
  if (processorTimer) return
  processorTimer = setInterval(async () => {
    try {
      const items = await getPendingQueue()
      for (const item of items) {
        await processQueueItem(item)
      }
    } catch (err) {
      console.error('[QUEUE] 处理队列异常:', err)
    }
  }, intervalMs)
  console.log(`[QUEUE] 队列处理器已启动 (间隔 ${intervalMs}ms)`)
}

export function stopQueueProcessor() {
  if (processorTimer) { clearInterval(processorTimer); processorTimer = null }
}
