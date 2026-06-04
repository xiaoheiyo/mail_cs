import { Router } from 'express'
import { query } from '../db/index.js'

const router = Router()

router.get('/presets', async (_req, res) => {
  try {
    const rows = await query<any[]>('SELECT * FROM smtp_presets ORDER BY sort_order ASC')
    res.json(rows.map(r => ({
      id: r.id,
      label: r.label,
      domain: r.domain,
      smtpHost: r.smtp_host,
      smtpPort: r.smtp_port,
      smtpSecure: r.smtp_secure !== 0,
      imapHost: r.imap_host,
      imapPort: r.imap_port,
      imapSecure: r.imap_secure !== 0,
    })))
  } catch (err: any) {
    res.status(500).send('获取预设失败: ' + (err.message || err))
  }
})

router.post('/presets', async (req, res) => {
  const { label, domain, smtpHost, smtpPort, smtpSecure, imapHost, imapPort, imapSecure } = req.body
  if (!label) return res.status(400).send('缺少名称')
  try {
    const result = await query<any>(
      'INSERT INTO smtp_presets (label, domain, smtp_host, smtp_port, smtp_secure, imap_host, imap_port, imap_secure) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [label, domain || '', smtpHost, smtpPort, smtpSecure !== false ? 1 : 0, imapHost, imapPort, imapSecure !== false ? 1 : 0],
    )
    res.json({ success: true, id: result.insertId })
  } catch (err: any) {
    res.status(500).send('保存预设失败: ' + (err.message || err))
  }
})

router.put('/presets/:id', async (req, res) => {
  const { label, domain, smtpHost, smtpPort, smtpSecure, imapHost, imapPort, imapSecure } = req.body
  try {
    await query(
      'UPDATE smtp_presets SET label=?, domain=?, smtp_host=?, smtp_port=?, smtp_secure=?, imap_host=?, imap_port=?, imap_secure=? WHERE id=?',
      [label, domain || '', smtpHost, smtpPort, smtpSecure !== false ? 1 : 0, imapHost, imapPort, imapSecure !== false ? 1 : 0, req.params.id],
    )
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).send('更新预设失败: ' + (err.message || err))
  }
})

router.delete('/presets/:id', async (req, res) => {
  try {
    await query('DELETE FROM smtp_presets WHERE id=?', [req.params.id])
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).send('删除预设失败: ' + (err.message || err))
  }
})

export default router
