import { Router } from 'express'
import { listTemplates, saveTemplate, deleteTemplate, nextTemplateId } from '../services/templateStore.js'

const router = Router()

router.get('/templates', async (_req, res) => {
  try {
    const list = await listTemplates()
    res.json(list)
  } catch (err: any) {
    res.status(500).send('获取模板列表失败: ' + (err.message || err))
  }
})

router.post('/templates', async (req, res) => {
  const { id, name, subject, body } = req.body
  try {
    await saveTemplate({
      id: id || nextTemplateId(),
      name: name || '未命名模板',
      subject: subject || '',
      body: body || '',
    })
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).send('保存模板失败: ' + (err.message || err))
  }
})

router.delete('/templates/:id', async (req, res) => {
  try {
    await deleteTemplate(req.params.id)
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).send('删除模板失败: ' + (err.message || err))
  }
})

export default router
