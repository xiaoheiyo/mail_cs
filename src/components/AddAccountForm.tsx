import { useState, useCallback, useEffect } from 'react'
import type { MailConfig, SmtpPreset } from '../types'
import { testConnection, saveAccount, fetchPresets } from '../api/mail'
import { matchPreset } from '../utils/presets'

interface Props {
  onAdd: (config: MailConfig) => void
  onCancel: () => void
  editConfig?: MailConfig | null
}

let _idCounter = 0
function nextId() {
  _idCounter++
  return `acc_${Date.now()}_${_idCounter}`
}

export default function AddAccountForm({ onAdd, onCancel, editConfig }: Props) {
  const [presets, setPresets] = useState<SmtpPreset[]>([])
  const [config, setConfig] = useState<MailConfig>(() => editConfig ? { ...editConfig } : {
    id: '', label: '',
    smtpHost: '', smtpPort: 465, smtpSecure: true,
    imapHost: '', imapPort: 993, imapSecure: true,
    email: '', password: '',
  })
  const [selectedPreset, setSelectedPreset] = useState<string>('')
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { fetchPresets().then(setPresets).catch(() => {}) }, [])

  const applyPreset = useCallback((preset: SmtpPreset) => {
    setSelectedPreset(preset.label)
    setConfig(prev => ({
      ...prev,
      smtpHost: preset.smtpHost,
      smtpPort: preset.smtpPort,
      smtpSecure: preset.smtpSecure,
      imapHost: preset.imapHost,
      imapPort: preset.imapPort,
      imapSecure: preset.imapSecure,
    }))
  }, [])

  const handleChange = (field: keyof MailConfig, value: string | number | boolean) => {
    setConfig(prev => ({ ...prev, [field]: value }))
    if (field === 'email' && typeof value === 'string') {
      const matched = matchPreset(value, presets)
      if (matched) applyPreset(matched)
    }
  }

  const handlePresetSelect = (label: string) => {
    if (label === '') return
    const preset = presets.find(p => p.label === label)
    if (preset) applyPreset(preset)
  }

  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'fail'>('idle')

  const handleTest = async () => {
    setTestStatus('testing')
    setError('')
    try {
      const full: MailConfig = {
        ...config,
        id: editConfig ? config.id : nextId(),
        label: config.label || config.email.split('@')[0] || config.email,
      }
      await testConnection(full)
      setTestStatus('success')
    } catch (err: any) {
      setTestStatus('fail')
      setError(err.message || '测试失败')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setTesting(true)
    try {
      const full: MailConfig = {
        ...config,
        id: editConfig ? config.id : nextId(),
        label: config.label || config.email.split('@')[0] || config.email,
      }
      await testConnection(full)
      await saveAccount(full)
      onAdd(full)
    } catch (err: any) {
      setError(err.message || '操作失败')
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="overlay">
      <form className="modal-panel" onSubmit={handleSubmit}>
          <div className="modal-header">
          <h2>{editConfig ? '编辑邮箱账户' : '添加邮箱账户'}</h2>
          <button type="button" className="btn-tiny" onClick={onCancel}>✕</button>
        </div>

        <div className="field-group">
          <label>显示名称</label>
          <input value={config.label} onChange={e => handleChange('label', e.target.value)} placeholder="例如：工作邮箱" />
        </div>

        <div className="field-group">
          <label>邮箱地址</label>
          <input value={config.email} onChange={e => handleChange('email', e.target.value)} placeholder="user@example.com" required />
        </div>

        <div className="field-group">
          <label>密码 / 授权码</label>
          <input type="password" value={config.password} onChange={e => handleChange('password', e.target.value)} placeholder="邮箱密码或授权码" required />
        </div>

        <div className="field-group">
          <label>服务商预设</label>
          <select value={selectedPreset} onChange={e => handlePresetSelect(e.target.value)}>
            <option value="">-- 选择预设 --</option>
            {presets.map(p => (
              <option key={p.label} value={p.label}>{p.label}</option>
            ))}
          </select>
          <span className="field-hint">输入邮箱域名自动匹配，也可手动选择</span>
        </div>

        <fieldset>
          <legend>SMTP 配置（发信）</legend>
          <div className="field-row">
            <div className="field-group flex-1">
              <label>服务器</label>
              <input value={config.smtpHost} onChange={e => handleChange('smtpHost', e.target.value)} placeholder="smtp.example.com" required />
            </div>
            <div className="field-group" style={{ width: 100 }}>
              <label>端口</label>
              <input type="number" value={config.smtpPort} onChange={e => handleChange('smtpPort', Number(e.target.value))} required />
            </div>
          </div>
          <label className="field-checkbox">
            <input type="checkbox" checked={config.smtpSecure} onChange={e => handleChange('smtpSecure', e.target.checked)} />
            启用 SSL/TLS
          </label>
        </fieldset>

        <fieldset>
          <legend>IMAP 配置（收信）</legend>
          <div className="field-row">
            <div className="field-group flex-1">
              <label>服务器</label>
              <input value={config.imapHost} onChange={e => handleChange('imapHost', e.target.value)} placeholder="imap.example.com" required />
            </div>
            <div className="field-group" style={{ width: 100 }}>
              <label>端口</label>
              <input type="number" value={config.imapPort} onChange={e => handleChange('imapPort', Number(e.target.value))} required />
            </div>
          </div>
          <label className="field-checkbox">
            <input type="checkbox" checked={config.imapSecure} onChange={e => handleChange('imapSecure', e.target.checked)} />
            启用 SSL/TLS
          </label>
        </fieldset>

        {testStatus === 'success' && <div className="success-msg">测试成功</div>}
        {error && <div className="error-msg">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onCancel}>取消</button>
          <button type="button" className="btn-secondary" onClick={handleTest} disabled={testStatus === 'testing'}>
            {testStatus === 'testing' ? '测试中...' : '测试连接'}
          </button>
          <button type="submit" className="btn-primary" disabled={testing}>
            {testing ? '验证中...' : (editConfig ? '保存' : '添加账户')}
          </button>
        </div>
      </form>
    </div>
  )
}
