import { Router } from 'express'
import { createHmac } from 'crypto'
import { getDbConfig, saveDbConfig } from '../services/configStore.js'

const router = Router()

function hashPassword(password: string, secretKey: string): string {
  return createHmac('sha256', secretKey).update(password).digest('hex')
}

// Check if admin password is configured
router.get('/admin/status', (_req, res) => {
  const cfg = getDbConfig()
  res.json({ configured: !!cfg?.adminPasswordHash })
})

// First-time setup of admin password
router.post('/admin/setup', (req, res) => {
  const { password } = req.body
  if (!password || password.length < 4) return res.status(400).send('密码至少4位')
  const cfg = getDbConfig()
  if (!cfg) return res.status(400).send('请先配置数据库')
  if (cfg.adminPasswordHash) return res.status(400).send('管理员密码已设置')
  cfg.adminPasswordHash = hashPassword(password, cfg.secretKey)
  saveDbConfig(cfg)
  res.json({ success: true })
})

// Verify admin password
router.post('/admin/login', (req, res) => {
  const { password } = req.body
  if (!password) return res.status(400).send('请输入密码')
  const cfg = getDbConfig()
  if (!cfg?.adminPasswordHash) return res.status(400).send('管理员密码未配置')
  if (hashPassword(password, cfg.secretKey) !== cfg.adminPasswordHash) {
    return res.status(403).send('密码错误')
  }
  res.json({ success: true })
})

// Change admin password
router.post('/admin/change', (req, res) => {
  const { oldPassword, newPassword } = req.body
  if (!oldPassword || !newPassword) return res.status(400).send('缺少必要字段')
  if (newPassword.length < 4) return res.status(400).send('新密码至少4位')
  const cfg = getDbConfig()
  if (!cfg?.adminPasswordHash) return res.status(400).send('管理员密码未配置')
  if (hashPassword(oldPassword, cfg.secretKey) !== cfg.adminPasswordHash) {
    return res.status(403).send('原密码错误')
  }
  cfg.adminPasswordHash = hashPassword(newPassword, cfg.secretKey)
  saveDbConfig(cfg)
  res.json({ success: true })
})

export default router
