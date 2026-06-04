import { useState, useEffect } from 'react'
import { checkAdminStatus, adminSetup, adminLogin } from '../api/mail'

interface Props {
  onLogin: () => void
}

export default function AdminLogin({ onLogin }: Props) {
  const [phase, setPhase] = useState<'loading' | 'setup' | 'login'>('loading')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    checkAdminStatus()
      .then(r => setPhase(r.configured ? 'login' : 'setup'))
      .catch(() => setPhase('login'))
  }, [])

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== password2) { setError('两次密码不一致'); return }
    setError(''); setBusy(true)
    try {
      await adminSetup(password)
      localStorage.setItem('admin_authenticated', 'true')
      onLogin()
    } catch (err: any) {
      setError(err.message || '设置失败')
    } finally { setBusy(false) }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(''); setBusy(true)
    try {
      await adminLogin(password)
      localStorage.setItem('admin_authenticated', 'true')
      onLogin()
    } catch (err: any) {
      setError(err.message || '登录失败')
    } finally { setBusy(false) }
  }

  if (phase === 'loading') return null

  return (
    <div className="setup-page">
      <div className="setup-backdrop" />
      <div className="setup-card">
        <div className="setup-card-header">
          <div className="setup-logo">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <h2>{phase === 'setup' ? '设置管理员密码' : '管理员登录'}</h2>
          <p>{phase === 'setup' ? '首次使用需要设置管理员密码' : '请输入管理员密码以继续'}</p>
        </div>

        <form onSubmit={phase === 'setup' ? handleSetup : handleLogin}>
          <div className="setup-card-body">
            <div className="field-group">
              <label>密码</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="输入密码" required />
            </div>
            {phase === 'setup' && (
              <div className="field-group">
                <label>确认密码</label>
                <input type="password" value={password2} onChange={e => setPassword2(e.target.value)} placeholder="再次输入密码" required />
              </div>
            )}
            {error && <div className="setup-error">{error}</div>}
          </div>

          <div className="setup-card-footer">
            <button type="submit" className="btn-primary setup-btn" disabled={busy}>
              {busy ? '处理中...' : (phase === 'setup' ? '设置密码' : '登录')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
