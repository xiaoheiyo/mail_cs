import { useState, useEffect } from 'react'
import type { EmailTemplate } from '../types'
import { fetchTemplates, saveTemplate, deleteTemplate } from '../api/mail'

interface Props {
  onClose: () => void
}

const empty: EmailTemplate = { id: '', name: '', subject: '', body: '' }

export default function TemplateManager({ onClose }: Props) {
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [editing, setEditing] = useState<EmailTemplate | null>(null)
  const [dirty, setDirty] = useState(false)

  const load = async () => {
    try {
      setTemplates(await fetchTemplates())
    } catch { /* ignore */ }
  }

  useEffect(() => { load() }, [])

  const handleSave = async () => {
    if (!editing) return
    await saveTemplate(editing)
    setDirty(false)
    await load()
    setEditing(null)
  }

  const handleDelete = async (id: string) => {
    await deleteTemplate(id)
    if (editing?.id === id) setEditing(null)
    await load()
  }

  const startNew = () => {
    setEditing({ ...empty, id: `tmpl_${Date.now()}` })
    setDirty(true)
  }

  return (
    <div className="overlay">
      <div className="modal-panel modal-wide">
        <div className="modal-header">
          <h2>邮件模板管理</h2>
          <button className="btn-tiny" onClick={onClose}>✕</button>
        </div>

        <div className="tmpl-body">
          <div className="tmpl-sidebar">
            <button className="btn-primary tmpl-add-btn" onClick={startNew}>+ 新建模板</button>
            <div className="tmpl-list">
              {templates.length === 0 && <p className="empty-hint">暂无模板</p>}
              {templates.map(t => (
                <div
                  key={t.id}
                  className={`tmpl-item ${editing?.id === t.id ? 'active' : ''}`}
                  onClick={() => { setEditing({ ...t }); setDirty(false) }}
                >
                  <div className="tmpl-item-name">{t.name}</div>
                  <div className="tmpl-item-preview">{t.subject || '(无主题)'}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="tmpl-editor">
            {editing ? (
              <>
                <div className="field-group">
                  <label>模板名称</label>
                  <input value={editing.name} onChange={e => { setEditing({ ...editing, name: e.target.value }); setDirty(true) }} placeholder="例如：客户问候模板" />
                </div>
                <div className="field-group">
                  <label>主题（支持 {'{{'}变量{'}}'} 占位符）</label>
                  <input value={editing.subject} onChange={e => { setEditing({ ...editing, subject: e.target.value }); setDirty(true) }} placeholder="您好 {{name}}，感谢您的来信" />
                </div>
                <div className="field-group">
                  <label>正文（支持 HTML 和 {'{{'}变量{'}}'} 占位符）</label>
                  <textarea className="tmpl-body-input" value={editing.body} onChange={e => { setEditing({ ...editing, body: e.target.value }); setDirty(true) }} rows={16} placeholder="<p>尊敬的 {{name}}：</p><p>{{content}}</p>" />
                </div>
                <div className="modal-actions">
                  <button className="btn-secondary" onClick={() => handleDelete(editing.id)}>删除</button>
                  <button className="btn-primary" onClick={handleSave} disabled={!dirty}>保存</button>
                </div>
              </>
            ) : (
              <div className="tmpl-editor-empty">选择左侧模板进行编辑，或点击「新建模板」</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
