import { useState } from 'react'
import type { Email } from '../types'

interface Props {
  emails: Email[]
  selectedId: string | null
  onSelect: (id: string) => void
  onToggleRead: (id: string, seen: boolean) => void
  onBatchRead: (ids: string[], seen: boolean) => void
  onRefresh: () => void
  loading: boolean
}

function avatarColor(name: string): string {
  const colors = ['#1a73e8', '#e8710a', '#188038', '#c5221f', '#9334e6', '#185abc', '#f9ab00', '#34a853']
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

function initial(name: string): string {
  const clean = name.replace(/<[^>]+>/g, '').trim()
  return clean.charAt(0).toUpperCase() || '?'
}

function formatDate(d: string): string {
  const date = new Date(d)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  if (diff < 86400000 && date.getDate() === now.getDate()) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }
  if (diff < 604800000 && date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString('zh-CN', { weekday: 'short' })
  }
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

export default function MailList({ emails, selectedId, onSelect, onToggleRead, onBatchRead, onRefresh, loading }: Props) {
  const [checked, setChecked] = useState<Set<string>>(new Set())

  const toggleCheck = (key: string) => {
    setChecked(prev => {
      const n = new Set(prev)
      if (n.has(key)) n.delete(key); else n.add(key)
      return n
    })
  }

  const toggleAll = () => {
    if (checked.size === emails.length) {
      setChecked(new Set())
    } else {
      setChecked(new Set(emails.map(m => `${m.accountId}_${m.id}`)))
    }
  }

  const batchAction = (seen: boolean) => {
    if (checked.size === 0) return
    onBatchRead(Array.from(checked), seen)
    setChecked(new Set())
  }

  return (
    <div className="mail-list">
      <div className="mail-list-header">
        <label className="mail-check-all" onClick={e => e.stopPropagation()}>
          <input type="checkbox" checked={emails.length > 0 && checked.size === emails.length} onChange={toggleAll} />
        </label>
        <h3>收件箱 {emails.length > 0 && `(${emails.length})`}</h3>
        <button className="btn-small" onClick={onRefresh} disabled={loading}>
          {loading ? '刷新中...' : '刷新'}
        </button>
      </div>

      {checked.size > 0 && (
        <div className="mail-batch-bar">
          <span className="mail-batch-count">已选 {checked.size} 封</span>
          <button className="btn-tiny" onClick={() => batchAction(true)}>标为已读</button>
          <button className="btn-tiny" onClick={() => batchAction(false)}>标为未读</button>
          <button className="btn-tiny" onClick={() => setChecked(new Set())}>取消选择</button>
        </div>
      )}

      <div className="mail-items">
        {emails.length === 0 && !loading && <p className="empty-hint">暂无邮件</p>}
        {emails.map(m => {
          const key = `${m.accountId}_${m.id}`
          const fromName = m.from.replace(/<[^>]+>/g, '').trim() || m.from
          const subj = m.subject || '(无主题)'
          const bodyText = m.body.replace(/<[^>]+>/g, '').trim().slice(0, 80)
          return (
            <div
              key={key}
              className={`mail-item ${selectedId === key ? 'active' : ''} ${!m.seen ? 'unread' : ''}`}
              onClick={() => onSelect(key)}
            >
              <div className="mail-check-col" onClick={e => e.stopPropagation()}>
                <input type="checkbox" checked={checked.has(key)} onChange={() => toggleCheck(key)} />
              </div>
              <div className="mail-avatar-wrap" onClick={e => { e.stopPropagation(); onToggleRead(key, m.seen) }}>
                {!m.seen && <span className="mail-unread-dot" />}
                <div className="mail-avatar" style={{ background: avatarColor(fromName) }}>
                  <span style={{ color: '#fff' }}>{initial(fromName)}</span>
                </div>
              </div>
              <div className="mail-item-body">
                <div className="mail-item-top">
                  <span className="mail-item-from">{fromName}</span>
                  <span className="mail-item-date">{formatDate(m.date)}</span>
                </div>
                <div className="mail-item-subject">{subj}</div>
                <div className="mail-item-preview">{bodyText}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
