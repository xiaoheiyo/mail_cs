import { Router } from 'express'
import { getCurrentVersion, checkForUpdate } from '../services/updateService.js'

const router = Router()

router.get('/version', (_req, res) => {
  res.json({ version: getCurrentVersion() })
})

router.post('/check-update', async (_req, res) => {
  const result = await checkForUpdate()
  res.json(result)
})

export default router
