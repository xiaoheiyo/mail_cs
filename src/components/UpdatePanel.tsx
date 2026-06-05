import { useState, useEffect, useRef } from 'react'
import { checkForUpdate, type CheckUpdateResult } from '../api/mail'

interface Props {
  onClose: () => void
}

export default function UpdatePanel({ onClose }: Props) {
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<CheckUpdateResult | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState({ total: 0, received: 0, done: false, error: '' })
  const [applying, setApplying] = useState(false)
  const [applyProgress, setApplyProgress] = useState({ step: '', done: false, error: '' })
  const [version, setVersion] = useState('')
  const timerRef = useRef<ReturnType<typeof setInterval>>()

  useEffect(() => {
    fetch('/api/version').then(r => r.json()).then(v => setVersion(v.version || '')).catch(() => {})
    handleCheck()
  }, [])

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  const handleCheck = async () => {
    setChecking(true)
    setResult(null)
    try {
      const r = await checkForUpdate()
      setResult(r)
    } catch {}
    setChecking(false)
  }

  const handleDownload = async () => {
    setDownloading(true)
    timerRef.current = setInterval(async () => {
      try {
        const p = await (await fetch('/api/update/progress')).json()
        setProgress(p)
        if (p.done || p.error) {
          clearInterval(timerRef.current)
          timerRef.current = undefined
        }
      } catch {}
    }, 300)
    try {
      const res = await fetch('/api/update/download', { method: 'POST' })
      if (timerRef.current) clearInterval(timerRef.current)
      if (res.ok) {
        const p = await (await fetch('/api/update/progress')).json()
        setProgress(p)
      } else {
        const err = await res.json()
        setProgress({ total: 0, received: 0, done: false, error: err.error || '下载失败' })
      }
    } catch (err: any) {
      if (timerRef.current) clearInterval(timerRef.current)
      setProgress({ total: 0, received: 0, done: false, error: err.message || '下载失败' })
    }
  }

  const handleApply = async () => {
    setApplying(true)
    setApplyProgress({ step: '正在准备...', done: false, error: '' })
    const applyTimer = setInterval(async () => {
      try {
        const p = await (await fetch('/api/update/apply-progress')).json()
        setApplyProgress(p)
        if (p.done || p.error) clearInterval(applyTimer)
      } catch {}
    }, 300)
    try {
      const res = await fetch('/api/update/apply', { method: 'POST' })
      clearInterval(applyTimer)
      if (res.ok) {
        const p = await (await fetch('/api/update/apply-progress')).json()
        setApplyProgress(p)
      } else {
        const err = await res.json()
        setApplyProgress({ step: '', done: false, error: err.error || '应用失败' })
      }
    } catch (err: any) {
      clearInterval(applyTimer)
      setApplyProgress({ step: '', done: false, error: err.message || '应用失败' })
    }
  }

  const indeterminate = progress.total === 0 && !progress.done && !progress.error
  const pct = progress.total > 0 ? Math.round((progress.received / progress.total) * 100) : 0

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal-panel modal-update" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>软件更新</h2>
          <button className="btn-tiny" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="update-row">
            <span className="update-label">当前版本</span>
            <span className="update-value" style={{ fontFamily: 'monospace' }}>{version || '...'}</span>
          </div>
          {result && (
            <div className="update-row">
              <span className="update-label">最新版本</span>
              <span className="update-value" style={{ fontFamily: 'monospace' }}>{result.latest}</span>
            </div>
          )}

          {result?.commits && result.commits.length > 0 && (
            <div className="update-commits" style={{ marginTop: 12 }}>
              <div className="update-label" style={{ marginBottom: 8 }}>更新摘要</div>
              {result.commits.slice(0, result.hasUpdate ? undefined : 1).map(c => (
                <div key={c.sha} className="update-commit-item">
                  <code className="commit-sha">{c.sha}</code>
                  <span className="commit-msg">{c.message}</span>
                </div>
              ))}
            </div>
          )}

          {result?.error && <p className="update-error">{result.error}</p>}

          {!result && checking && <p className="text-muted">检查中...</p>}

          {result?.hasUpdate && !downloading && (
            <button className="btn-primary" onClick={handleDownload} style={{ marginTop: 16 }}>
              下载更新
            </button>
          )}

          {downloading && (
            <div className="update-download-progress" style={{ marginTop: 16 }}>
              <div className={`progress-bar-wrap ${indeterminate ? 'indeterminate' : ''}`}>
                <div className="progress-bar-fill" style={{ width: indeterminate ? undefined : `${pct}%` }} />
              </div>
              <span className="progress-text">
                {progress.error ? progress.error : progress.done ? '下载完成' : indeterminate ? '下载中...' : `下载中 ${pct}%`}
              </span>
              {progress.done && !applying && (
                <button className="btn-primary" onClick={handleApply} style={{ marginTop: 12 }}>
                  应用更新
                </button>
              )}
            </div>
          )}

          {applying && (
            <div className="update-download-progress" style={{ marginTop: 16 }}>
              <div className={`progress-bar-wrap ${!applyProgress.done ? 'indeterminate' : ''}`}>
                <div className="progress-bar-fill" />
              </div>
              <span className="progress-text">
                {applyProgress.error ? applyProgress.error : applyProgress.done ? '更新完成！请重启服务' : applyProgress.step}
              </span>
            </div>
          )}

          {!result?.hasUpdate && result && !result.error && (
            <p className="text-muted" style={{ marginTop: 12 }}>已是最新版本</p>
          )}
        </div>
      </div>
    </div>
  )
}
