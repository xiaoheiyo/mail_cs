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
        }
      } catch {}
    }, 300)
    try {
      const res = await fetch('/api/update/download', { method: 'POST' })
      if (!res.ok) {
        const err = await res.json()
        setProgress(p => ({ ...p, error: err.error || '下载失败' }))
      }
      clearInterval(timerRef.current)
    } catch (err: any) {
      setProgress(p => ({ ...p, error: err.message || '下载失败' }))
      clearInterval(timerRef.current)
    }
  }

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
            <span className="update-value">{version || '...'}</span>
          </div>
          {result && (
            <div className="update-row">
              <span className="update-label">最新版本</span>
              <span className="update-value">{result.latest}</span>
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
              <div className="progress-bar-wrap">
                <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
              </div>
              <span className="progress-text">
                {progress.done ? '下载完成' : progress.error ? progress.error : `下载中 ${pct}%`}
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
