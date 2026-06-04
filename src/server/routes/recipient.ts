import { Router } from 'express'
import { query } from '../db/index.js'

const router = Router()

router.get('/recipients', async (_req, res) => {
  try {
    const rows = await query<any[]>('SELECT id, name, email FROM recipients ORDER BY name ASC')
    res.json(rows)
  } catch (err: any) {
    res.status(500).send('获取收件人失败: ' + (err.message || err))
  }
})

router.post('/recipients', async (req, res) => {
  const { name, email } = req.body
  if (!name || !email) return res.status(400).send('缺少必要字段')
  try {
    const result = await query('INSERT INTO recipients (name, email) VALUES (?, ?)', [name, email])
    res.json({ id: (result as any).insertId })
  } catch (err: any) {
    res.status(500).send('添加收件人失败: ' + (err.message || err))
  }
})

router.put('/recipients/:id', async (req, res) => {
  const { name, email } = req.body
  try {
    await query('UPDATE recipients SET name = ?, email = ? WHERE id = ?', [name, email, req.params.id])
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).send('更新收件人失败: ' + (err.message || err))
  }
})

router.delete('/recipients/:id', async (req, res) => {
  try {
    await query('DELETE FROM recipients WHERE id = ?', [req.params.id])
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).send('删除收件人失败: ' + (err.message || err))
  }
})

export default router
