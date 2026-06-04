import { useState, useEffect } from 'react'
import type { UserSettings } from '../types'
import { fetchQueueStats } from '../api/mail'

interface Props {
  settings: UserSettings
  onSettings: () => void
}

export default function NavBar({ settings, onSettings }: Props) {
  const [queuePending, setQueuePending] = useState(0)

  useEffect(() => {
    const poll = () => {
      fetchQueueStats().then(s => {
        setQueuePending((s.pending || 0) + (s.sending || 0))
      }).catch(() => {})
    }
    poll()
    const t = setInterval(poll, 30000)
    return () => clearInterval(t)
  }, [])

  return (
    <nav className="navbar">
      <div className="navbar-left">
        <span className="navbar-title">{settings.appTitle}</span>
        <div className="navbar-links">
          {settings.customLinks.map(link => (
            <a key={link.id} className="navbar-link" href={link.url} target="_blank" rel="noopener noreferrer" title={link.title}>
              {link.icon && <span>{link.icon}</span>}
              <span>{link.title}</span>
            </a>
          ))}
        </div>
      </div>
      <div className="navbar-right">
        {queuePending > 0 && <span className="queue-badge" title="待发送邮件">队列 {queuePending}</span>}
        <button className="navbar-btn" onClick={onSettings}>设置</button>
      </div>
    </nav>
  )
}
