import { useState } from 'react'
import type { Email } from '../types'

interface Props {
  email: Email | null
  onReply?: (email: Email) => void
  onForward?: (email: Email) => void
  onDelete?: (email: Email) => void
  onExport?: (email: Email) => void
}

export default function MailView({ email, onReply, onForward, onDelete, onExport }: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (!email) {
    return <div className="mail-view empty">选择一封邮件查看</div>
  }

  return (
    <div className="mail-view">
      <div className="mail-actions">
        <button className="btn-small" onClick={() => onReply?.(email)}>回复</button>
        <button className="btn-small" onClick={() => onForward?.(email)}>转发</button>
        <div className="delete-btn-group">
          {confirmDelete ? (
            <span className="attach-confirm">
              <button className="btn-small btn-danger-small" onClick={() => { onDelete?.(email); setConfirmDelete(false) }}>确认</button>
              <button className="btn-small" onClick={() => setConfirmDelete(false)}>取消</button>
            </span>
          ) : (
            <button className="btn-small btn-danger-small" onClick={() => setConfirmDelete(true)}>删除</button>
          )}
        </div>
        <button className="btn-small" onClick={() => onExport?.(email)}>导出</button>
      </div>
      <div className="mail-view-header">
        <h2>{email.subject || '(无主题)'}</h2>
      </div>
      <div className="mail-meta">
        <div className="mail-meta-row">
          <span className="mail-meta-label">发件人</span>
          <span className="mail-meta-value">{email.from}</span>
        </div>
        <div className="mail-meta-row">
          <span className="mail-meta-label">收件人</span>
          <span className="mail-meta-value">{email.to}</span>
        </div>
        <div className="mail-meta-row">
          <span className="mail-meta-label">时间</span>
          <span className="mail-meta-value">{new Date(email.date).toLocaleString('zh-CN')}</span>
        </div>
      </div>
      <div className="mail-body" dangerouslySetInnerHTML={{ __html: email.body }} />
    </div>
  )
}
