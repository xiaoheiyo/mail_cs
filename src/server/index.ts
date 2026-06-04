import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import { existsSync } from 'fs'
import cors from 'cors'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
import mailRouter from './routes/mail.js'
import setupRouter from './routes/setup.js'
import accountRouter from './routes/account.js'
import templateRouter from './routes/template.js'
import settingsRouter from './routes/settings.js'
import presetRouter from './routes/preset.js'
import recipientRouter from './routes/recipient.js'
import adminRouter from './routes/admin.js'
import { getDbConfig } from './services/configStore.js'
import { setSecretKey } from './services/crypto.js'
import { initPool } from './db/index.js'
import { initDatabase } from './db/init.js'
import { clearAllCache } from './services/cacheService.js'
import { startQueueProcessor } from './services/sendQueueService.js'

const app = express()
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001

app.use(cors())
app.use(express.json({ limit: '700mb' }))

app.use('/api', setupRouter)
app.use('/api', mailRouter)
app.use('/api', accountRouter)
app.use('/api', templateRouter)
app.use('/api', settingsRouter)
app.use('/api', presetRouter)
app.use('/api', recipientRouter)
app.use('/api', adminRouter)

// Serve client build if available (production mode)
const clientDist = path.resolve(__dirname, '../public')
if (existsSync(clientDist)) {
  app.use(express.static(clientDist))
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'))
  })
}

async function start() {
  const dbConfig = getDbConfig()
  if (dbConfig) {
    setSecretKey(dbConfig.secretKey)
    initPool(dbConfig)
    try {
      await initDatabase()
      await clearAllCache()
      console.log('[DB] MySQL 已就绪')
    } catch (err) {
      console.warn('[WARN] MySQL 初始化失败:', (err as Error).message)
    }
    startQueueProcessor()
  } else {
    console.log('[SETUP] MySQL 未配置，请通过前端页面初始化')
  }

  app.listen(PORT, () => {
    console.log(`Mail server running at http://localhost:${PORT}`)
  })
}

start()
