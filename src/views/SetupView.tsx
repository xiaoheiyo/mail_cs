import { useState } from 'react'

interface Props {
  onSetupComplete: () => void
}

export default function SetupView({ onSetupComplete }: Props) {
  const [host, setHost] = useState('localhost')
  const [port, setPort] = useState('3306')
  const [user, setUser] = useState('root')
  const [password, setPassword] = useState('')
  const [database, setDatabase] = useState('mail_client')
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setTesting(true)
    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host, port, user, password, database }),
      })
      if (!res.ok) throw new Error(await res.text())
      onSetupComplete()
    } catch (err: any) {
      setError(err.message || '配置失败')
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="setup-page">
      <div className="setup-backdrop" />
      <div className="setup-card">
        <div className="setup-card-header">
          <div className="setup-logo">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="M22 7l-10 7L2 7" />
            </svg>
          </div>
          <h2>初始化数据库</h2>
          <p>首次使用需要配置 MySQL 连接</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="setup-card-body">
            <div className="field-group">
              <label>主机地址</label>
              <input value={host} onChange={e => setHost(e.target.value)} placeholder="localhost" required />
            </div>

            <div className="field-row">
              <div className="field-group flex-1">
                <label>端口</label>
                <input value={port} onChange={e => setPort(e.target.value)} placeholder="3306" required />
              </div>
              <div className="field-group flex-1">
                <label>数据库名</label>
                <input value={database} onChange={e => setDatabase(e.target.value)} placeholder="mail_client" required />
              </div>
            </div>

            <div className="field-group">
              <label>用户名</label>
              <input value={user} onChange={e => setUser(e.target.value)} placeholder="root" required />
            </div>

            <div className="field-group">
              <label>密码</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="数据库密码" />
            </div>

            {error && <div className="setup-error">{error}</div>}
          </div>

          <div className="setup-card-footer">
            <button type="submit" className="btn-primary setup-btn" disabled={testing}>
              {testing ? '连接测试中...' : '保存配置'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
