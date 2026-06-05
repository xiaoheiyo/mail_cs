import { Router } from 'express'
import { getCurrentVersion, checkForUpdate, downloadUpdate, getDownloadProgress } from '../services/updateService.js'

const router = Router()

router.get('/version', (_req, res) => {
  res.json({ version: getCurrentVersion() })
})

router.post('/check-update', async (_req, res) => {
  const result = await checkForUpdate()
  res.json(result)
})

router.post('/update/download', async (_req, res) => {
  try {
    await downloadUpdate()
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message || '下载失败' })
  }
})

router.get('/update/progress', (_req, res) => {
  res.json(getDownloadProgress())
})

export default router
