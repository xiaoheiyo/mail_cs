import { useState, useEffect, useCallback } from 'react'
import type { MailConfig, EmailTemplate } from '../types'
import { sendEmail, fetchTemplates, fetchRecipients, saveRecipient } from '../api/mail'
import RichEditor from './RichEditor'

interface Props {
  accounts: MailConfig[]
  defaultAccount: MailConfig | null
  onClose: () => void
  onSent: () => void
  initTo?: string
  initSubject?: string
  initBody?: string
}

interface Attachment {
  filename: string
  content: string
  encoding: 'base64'
}

export default function ComposeMail({ accounts, defaultAccount, onClose, onSent, initTo, initSubject, initBody }: Props) {
  const [senderId, setSenderId] = useState(defaultAccount?.id ?? accounts[0]?.id ?? '')
  const [to, setTo] = useState(initTo ?? '')
  const [subject, setSubject] = useState(initSubject ?? '')
  const [body, setBody] = useState(initBody ?? '')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [showTemplates, setShowTemplates] = useState(false)
  const [recipients, setRecipients] = useState<any[]>([])
  const [showRecipients, setShowRecipients] = useState(false)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [showAttachments, setShowAttachments] = useState(false)

  useEffect(() => {
    fetchTemplates().then(setTemplates).catch(() => {})
    fetchRecipients().then(setRecipients).catch(() => {})
  }, [])

  const applyTemplate = useCallback((t: EmailTemplate) => {
    setSubject(t.subject)
    setBody(t.body)
    setShowTemplates(false)
  }, [])

  const sender = accounts.find(a => a.id === senderId)

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!sender) return
    setError('')
    setSending(true)
    try {
      const res = await sendEmail({
        accountId: senderId,
        to,
        subject,
        body,
        attachments: attachments.length > 0 ? attachments : undefined,
      } as any)
      if ((res as any).queued) {
        setError((res as any).message || '邮件已加入发送队列')
        setTimeout(() => { onSent(); onClose() }, 1500)
        return
      }
      // auto-save unknown recipients
      const parts = to.split(/[,;，；]/).map(s => s.trim()).filter(Boolean)
      const existing = new Set(recipients.map(r => r.email.toLowerCase()))
      for (const part of parts) {
        const match = part.match(/^(.*?)(?:\s*<([^>]+)>)?$/)
        const name = match?.[1]?.trim() || ''
        const email = match?.[2]?.trim() || part
        if (email.includes('@') && !existing.has(email.toLowerCase())) {
          saveRecipient({ name: name || email.split('@')[0], email }).catch(() => {})
        }
      }
      onSent()
      onClose()
    } catch (err: any) {
      setError(err.message || '发送失败')
    } finally {
      setSending(false)
    }
  }

  const handleAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    for (const file of Array.from(files)) {
      if (file.size > 500 * 1024 * 1024) {
        setError(`附件 "${file.name}" 超过 500MB 限制`)
        continue
      }
      const reader = new FileReader()
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1]
        setAttachments(prev => [...prev, { filename: file.name, content: base64, encoding: 'base64' }])
      }
      reader.readAsDataURL(file)
    }
    e.target.value = ''
  }

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index))
  }

  const formatFileSize = (base64: string) => {
    const bytes = (base64.length * 3) / 4
    if (bytes < 1024) return `${bytes.toFixed(0)} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="overlay">
      <div className="compose-panel">
        <div className="compose-header">
          <h2>写邮件</h2>
          <button className="btn-tiny" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSend}>
          <div className="field-group">
            <label>发件账户</label>
            <select value={senderId} onChange={e => setSenderId(e.target.value)}>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>{a.label} ({a.email})</option>
              ))}
            </select>
          </div>
          <div className="field-group">
            <label>收件人</label>
            <div className="subject-row">
              <input value={to} onChange={e => setTo(e.target.value)} placeholder="recipient@example.com" required />
              {recipients.length > 0 && (
                <div className="tmpl-dropdown-wrap">
                  <button type="button" className="btn-small" onClick={() => setShowRecipients(!showRecipients)}>通讯录</button>
                  {showRecipients && (
                    <div className="tmpl-dropdown">
                      {recipients.map(r => (
                        <div key={r.id} className="tmpl-dropdown-item" onClick={() => { setTo(r.email); setShowRecipients(false) }}>
                          <div className="tmpl-dd-name">{r.name}</div>
                          <div className="tmpl-dd-subject">{r.email}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="field-group">
            <label>主题</label>
            <div className="subject-row">
              <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="邮件主题" />
              {templates.length > 0 && (
                <div className="tmpl-dropdown-wrap">
                  <button type="button" className="btn-small" onClick={() => setShowTemplates(!showTemplates)}>模板</button>
                  {showTemplates && (
                    <div className="tmpl-dropdown">
                      {templates.map(t => (
                        <div key={t.id} className="tmpl-dropdown-item" onClick={() => applyTemplate(t)}>
                          <div className="tmpl-dd-name">{t.name}</div>
                          <div className="tmpl-dd-subject">{t.subject}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="field-group editor-field-group">
            <RichEditor value={body} onChange={setBody} />
          </div>
          <div className="compose-attachments">
            <label className="btn-small attach-btn">
              📎 附件
              <input type="file" multiple style={{ display: 'none' }} onChange={handleAttach} />
            </label>
            {attachments.length > 0 && (
              <div className="compose-attachment-list">
                {attachments.map((a, i) => (
                  <div key={i} className="compose-attachment-item">
                    <span className="attach-name">{a.filename}</span>
                    <span className="attach-size">({formatFileSize(a.content)})</span>
                    <button type="button" className="btn-tiny" onClick={() => removeAttachment(i)}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
          {error && <div className="error-msg">{error}</div>}
          <div className="compose-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>取消</button>
            <button type="submit" className="btn-primary" disabled={sending || !sender}>
              {sending ? '发送中...' : '发送'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
