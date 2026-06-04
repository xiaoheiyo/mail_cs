import { Router } from 'express'
import { query } from '../db/index.js'

const router = Router()

router.get('/settings', async (_req, res) => {
  try {
    const rows = await query<any[]>('SELECT settings FROM user_settings WHERE id = 1')
    if (!rows.length) {
      return res.json({})
    }
    res.json(typeof rows[0].settings === 'string' ? JSON.parse(rows[0].settings) : rows[0].settings)
  } catch (err: any) {
    res.status(500).send('获取设置失败: ' + (err.message || err))
  }
})

router.put('/settings', async (req, res) => {
  try {
    const settings = JSON.stringify(req.body)
    await query(
      'INSERT INTO user_settings (id, settings) VALUES (1, ?) ON DUPLICATE KEY UPDATE settings = ?',
      [settings, settings],
    )
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).send('保存设置失败: ' + (err.message || err))
  }
})

export default router
