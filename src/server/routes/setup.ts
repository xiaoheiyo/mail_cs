import { Router } from 'express'
import mysql from 'mysql2/promise'
import { saveDbConfig, getDbConfig, generateSecretKey } from '../services/configStore.js'
import { setSecretKey } from '../services/crypto.js'
import { initPool } from '../db/index.js'
import { initDatabase } from '../db/init.js'

const router = Router()

router.get('/health', (_req, res) => {
  const config = getDbConfig()
  res.json({ configured: !!config })
})

router.post('/setup', async (req, res) => {
  const { host, port, user, password, database } = req.body
  const secretKey = generateSecretKey()
  const cfg = { host, port: Number(port), user, password, database, secretKey }

  try {
    const conn = await mysql.createConnection({
      host: cfg.host,
      port: cfg.port,
      user: cfg.user,
      password: cfg.password,
    })
    await conn.execute(
      `CREATE DATABASE IF NOT EXISTS \`${cfg.database}\` DEFAULT CHARSET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    )
    await conn.end()
  } catch (err: any) {
    return res.status(400).send('MySQL 连接失败: ' + (err.message || err))
  }

  saveDbConfig(cfg)
  setSecretKey(secretKey)
  initPool(cfg)

  try {
    await initDatabase()
  } catch (err: any) {
    return res.status(500).send('建表失败: ' + (err.message || err))
  }

  res.json({ success: true })
})

export default router
