import { Router } from 'express'
import { ImapFlow } from 'imapflow'
import { sendMail, verifySmtp } from '../services/smtpService.js'
import { enqueueSend, getQueueStats, getFailedQueue, retryFailedItem, deleteQueueItem } from '../services/sendQueueService.js'
import { fetchRecentEmails } from '../services/imapService.js'
import { getCachedEmails, getMaxUid, cacheEmails, clearCache } from '../services/cacheService.js'
import { getAccountConfig } from '../services/accountStore.js'
import { query } from '../db/index.js'

const router = Router()

// 邮件同步冷却: 同一账户+文件夹 30 秒内不重复连接 IMAP
const syncCooldown = new Map<string, number>()
const SYNC_INTERVAL = 30_000

function shouldSync(key: string): boolean {
  const last = syncCooldown.get(key)
  return !last || Date.now() - last > SYNC_INTERVAL
}

function markSynced(key: string) {
  syncCooldown.set(key, Date.now())
}

// 测试 SMTP 连接
router.post('/test', async (req, res) => {
  const { smtpHost, smtpPort, smtpSecure, email, password, accountId, id } = req.body
  const acctId = accountId || id

  try {
    let user = '', pass = '', host = '', port = 0, secure = false

    if (acctId) {
      const stored = await getAccountConfig(acctId)
      if (stored) {
        user = stored.email
        pass = stored.password
        host = stored.smtpHost
        port = stored.smtpPort
        secure = stored.smtpSecure
      }
    }
    // 表单提交的密码优先于已存储的密码（编辑场景用户可能改了密码）
    if (password) {
      pass = password
    }
    if (!user && email) {
      user = email
      host = smtpHost
      port = smtpPort
      secure = smtpSecure !== false
    }

    if (!pass) return res.status(400).send('密码为空')

    await verifySmtp({ host, port, secure, user, pass })
    res.json({ success: true })
  } catch (err: any) {
    const msg = (err.message || err).toLowerCase()
    if (msg.includes('econnrefused') || msg.includes('enotfound') || msg.includes('econnreset')) {
      res.status(400).send('连接失败，请检查服务器地址和端口')
    } else if (msg.includes('auth') || msg.includes('535') || msg.includes('login') || msg.includes('credentials') || msg.includes('password') || msg.includes('username') || msg.includes('authentication')) {
      res.status(400).send('账号或密码错误')
    } else {
      res.status(400).send('测试连接失败: ' + (err.message || err))
    }
  }
})

// 获取邮件列表（缓存 + 增量同步）
router.post('/mails', async (req, res) => {
  const { imapHost, imapPort, email, password, accountId, mailbox, force } = req.body

  try {
    let imapCfg: { host: string; port: number; secure: boolean; user: string; pass: string }
    let addr: string

    if (accountId) {
      const stored = await getAccountConfig(accountId)
      if (!stored) return res.status(404).send('账户不存在')
      imapCfg = { host: stored.imapHost, port: stored.imapPort, secure: stored.imapSecure, user: stored.email, pass: stored.password }
      addr = stored.email
    } else if (email && password) {
      imapCfg = { host: imapHost, port: imapPort, secure: imapPort === 993, user: email, pass: password }
      addr = email
    } else {
      return res.status(400).send('缺少账户信息')
    }

    if (!imapCfg.pass) {
      console.error('[MAILS] 密码为空，accountId:', accountId)
      return res.status(500).send('获取邮件失败: 账户密码为空')
    }

    const mailboxName = mailbox || 'INBOX'
    const syncKey = `${addr}/${mailboxName}`

    if (force || shouldSync(syncKey)) {
      const maxUid = await getMaxUid(addr, mailboxName)
      const newMails = await fetchRecentEmails(imapCfg, { sinceUid: maxUid ?? undefined, mailbox: mailboxName })

      if (newMails.length > 0) {
        await cacheEmails(
          addr,
          newMails.map(m => ({
            uid: Number(m.id),
            from: m.from,
            to: m.to,
            subject: m.subject,
            body: m.body,
            date: new Date(m.date),
            seen: m.seen,
          })),
          mailboxName,
        )
      }
      markSynced(syncKey)
    }

    const all = await getCachedEmails(addr, mailboxName)
    res.json(all)
  } catch (err: any) {
    console.error('[MAILS] 异常:', err)
    res.status(500).send('获取邮件失败: ' + (err.message || err))
  }
})

// 发送邮件（支持队列回退）
router.post('/send', async (req, res) => {
  const { config, accountId, to, subject, body, attachments, proxy, ignoreCert } = req.body

  try {
    let smtpCfg: any, acctId: string
    if (accountId) {
      const stored = await getAccountConfig(accountId)
      if (!stored) return res.status(404).send('账户不存在')
      smtpCfg = { host: stored.smtpHost, port: stored.smtpPort, secure: stored.smtpSecure, user: stored.email, pass: stored.password, proxy, ignoreCert }
      acctId = accountId
    } else if (config) {
      smtpCfg = { host: config.smtpHost, port: config.smtpPort, secure: config.smtpSecure !== false, user: config.email, pass: config.password, proxy: proxy || config.proxy, ignoreCert: ignoreCert ?? config.ignoreCert }
      acctId = config.id
    } else {
      return res.status(400).send('缺少账户信息')
    }

    await sendMail(smtpCfg, { from: smtpCfg.user, to, subject, body, attachments, dsn: { notify: ['failure', 'delay'] } })
    res.json({ success: true })
  } catch (err: any) {
    // 临时失败自动入队
    const msg = (err.message || err).toLowerCase()
    if (msg.includes('econnrefused') || msg.includes('enotfound') || msg.includes('timeout') || msg.includes('etimedout') || msg.includes('econnreset') || msg.includes('greeting')) {
      const acctId = accountId || config?.id
      if (acctId) {
        await enqueueSend(acctId, to, subject, body, attachments)
        return res.json({ queued: true, message: '服务器暂时不可用，邮件已加入发送队列，稍后自动重试' })
      }
    }
    res.status(500).send('发送失败: ' + (err.message || err))
  }
})

// 发送队列统计
router.get('/queue/stats', async (_req, res) => {
  try { res.json(await getQueueStats()) } catch (err: any) { res.status(500).send(err.message) }
})

// 发送队列失败列表
router.get('/queue/failed', async (_req, res) => {
  try { res.json(await getFailedQueue()) } catch (err: any) { res.status(500).send(err.message) }
})

// 重试失败项
router.post('/queue/retry/:id', async (req, res) => {
  try { await retryFailedItem(Number(req.params.id)); res.json({ success: true }) } catch (err: any) { res.status(500).send(err.message) }
})

// 删除队列项
router.delete('/queue/:id', async (req, res) => {
  try { await deleteQueueItem(Number(req.params.id)); res.json({ success: true }) } catch (err: any) { res.status(500).send(err.message) }
})

// 标记已读 / 未读
router.post('/mails/:id/read', async (req, res) => {
  const { accountId, mailbox, seen } = req.body
  const uid = parseInt(req.params.id)
  try {
    const stored = await getAccountConfig(accountId)
    if (!stored) return res.status(404).send('账户不存在')

    // Update MySQL cache
    const mailboxName = mailbox || 'INBOX'
    const emailAddr = stored.email
    const key = mailboxName ? `${emailAddr}/${mailboxName}` : emailAddr
    await query(
      'UPDATE cached_emails SET seen = ? WHERE email_addr = ? AND message_uid = ?',
      [seen ? 1 : 0, key, uid],
    )

    // Update IMAP \Seen flag (skip if password unavailable)
    if (stored.password) {
      const client = new ImapFlow({
        host: stored.imapHost,
        port: stored.imapPort,
        secure: stored.imapSecure,
        auth: { user: stored.email, pass: stored.password },
        tls: { rejectUnauthorized: false },
        logger: false,
      })
      await client.connect()
      const lock = await client.getMailboxLock(mailboxName)
      try {
        if (seen) {
          await client.messageFlagsAdd({ uid }, ['\\Seen'])
        } else {
          await client.messageFlagsRemove({ uid }, ['\\Seen'])
        }
      } finally {
        lock.release()
        await client.logout()
      }
    }

    res.json({ success: true })
  } catch (err: any) {
    res.status(500).send('操作失败: ' + (err.message || err))
  }
})

// 清除缓存（可选）
router.post('/cache/clear', async (req, res) => {
  const { email } = req.body
  try {
    await clearCache(email)
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).send('清除缓存失败: ' + (err.message || err))
  }
})

// 删除邮件（移至垃圾箱）
router.post('/mails/:uid/delete', async (req, res) => {
  const { accountId, mailbox } = req.body
  const uid = parseInt(req.params.uid)
  try {
    const stored = await getAccountConfig(accountId)
    if (!stored) return res.status(404).send('账户不存在')
    if (!stored.password) return res.status(400).send('密码为空')

    const client = new ImapFlow({
      host: stored.imapHost,
      port: stored.imapPort,
      secure: stored.imapSecure,
      auth: { user: stored.email, pass: stored.password },
      tls: { rejectUnauthorized: false },
      logger: false,
    })
    await client.connect()
    const lock = await client.getMailboxLock(mailbox || 'INBOX')
    try {
      await client.messageMove({ uid }, 'Trash')
    } finally {
      lock.release()
      await client.logout()
    }

    const mailboxName = mailbox || 'INBOX'
    const emailAddr = stored.email
    const key = `${emailAddr}/${mailboxName}`
    await query('DELETE FROM cached_emails WHERE email_addr = ? AND message_uid = ?', [key, uid])

    res.json({ success: true })
  } catch (err: any) {
    res.status(500).send('删除失败: ' + (err.message || err))
  }
})

export default router
