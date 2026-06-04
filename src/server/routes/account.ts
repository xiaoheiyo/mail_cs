import { Router } from 'express'
import { ImapFlow } from 'imapflow'
import { listAccounts, getAccountConfig, saveAccount, deleteAccount } from '../services/accountStore.js'
import { query } from '../db/index.js'

const router = Router()

router.get('/accounts', async (_req, res) => {
  try {
    const list = await listAccounts()
    res.json(list)
  } catch (err: any) {
    res.status(500).send('获取账户列表失败: ' + (err.message || err))
  }
})

router.get('/accounts/:id/config', async (req, res) => {
  try {
    const cfg = await getAccountConfig(req.params.id)
    if (!cfg) return res.status(404).send('账户不存在')
    res.json(cfg)
  } catch (err: any) {
    res.status(500).send('获取账户配置失败: ' + (err.message || err))
  }
})

router.post('/accounts', async (req, res) => {
  const { id, label, email, password, smtpHost, smtpPort, smtpSecure, imapHost, imapPort, imapSecure } = req.body
  if (!id || !email || !password) {
    return res.status(400).send('缺少必填字段')
  }
  try {
    await saveAccount({ id, label, email, password, smtpHost, smtpPort, smtpSecure: smtpSecure !== false, imapHost, imapPort, imapSecure: imapSecure !== false })
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).send('保存账户失败: ' + (err.message || err))
  }
})

router.delete('/accounts/:id', async (req, res) => {
  try {
    await deleteAccount(req.params.id)
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).send('删除账户失败: ' + (err.message || err))
  }
})

// ---- 文件夹管理 ----

/** 列出 IMAP 服务器上的所有文件夹 */
router.post('/accounts/:id/folders/list', async (req, res) => {
  try {
    const cfg = await getAccountConfig(req.params.id)
    if (!cfg) return res.status(404).send('账户不存在')
    if (!cfg.password) return res.status(500).send('账户密码为空')

    const client = new ImapFlow({
      host: cfg.imapHost,
      port: cfg.imapPort,
      secure: cfg.imapSecure,
      auth: { user: cfg.email, pass: cfg.password },
      tls: { rejectUnauthorized: false },
      logger: false,
    })

    await client.connect()
    const mailboxes = await client.list()
    await client.logout()

    res.json(mailboxes.map((mb: any) => ({
      name: mb.path,
      delim: mb.delimiter,
      flags: mb.flags,
      specialUse: mb.specialUse || '',
    })))
  } catch (err: any) {
    res.status(500).send('获取文件夹列表失败: ' + (err.message || err))
  }
})

/** 读取已保存的文件夹配置 */
router.get('/accounts/:id/folders', async (req, res) => {
  try {
    const rows = await query<any[]>(
      'SELECT folder_name, display_name, enabled, sort_order FROM account_folders WHERE account_id = ? ORDER BY sort_order ASC',
      [req.params.id],
    )
    res.json(rows)
  } catch (err: any) {
    res.status(500).send('读取文件夹配置失败: ' + (err.message || err))
  }
})

/** 保存文件夹配置 */
router.post('/accounts/:id/folders', async (req, res) => {
  const { folders } = req.body as { folders: { folder_name: string; display_name: string; enabled: boolean; sort_order: number }[] }
  const accountId = req.params.id
  try {
    await query('DELETE FROM account_folders WHERE account_id = ?', [accountId])
    for (const f of folders) {
      await query(
        'INSERT INTO account_folders (account_id, folder_name, display_name, enabled, sort_order) VALUES (?, ?, ?, ?, ?)',
        [accountId, f.folder_name, f.display_name, f.enabled ? 1 : 0, f.sort_order],
      )
    }
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).send('保存文件夹配置失败: ' + (err.message || err))
  }
})

export default router
