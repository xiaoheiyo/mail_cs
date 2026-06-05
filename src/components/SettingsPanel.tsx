import { useState, useEffect, useCallback } from 'react'
import type { MailConfig, FolderConfig, UserSettings } from '../types'
import { fetchAccounts, saveAccount, deleteAccount, testConnection, fetchPresets, savePreset, deletePreset, fetchRecipients, saveRecipient, deleteRecipient } from '../api/mail'
import { fetchImapFolders, fetchFolderConfig, saveFolderConfig, saveSettings } from '../api/mail'
import AddAccountForm from './AddAccountForm'
import UpdatePanel from './UpdatePanel'

interface Props {
  initialSettings: UserSettings
  onClose: () => void
  onSettingsChange: (s: UserSettings) => void
}

type Tab = 'accounts' | 'folders' | 'presets' | 'recipients' | 'settings' | 'about'

interface AccountWithFolders {
  config: MailConfig
  folders: FolderConfig[]
  imapFolders: { name: string; specialUse: string }[]
}

export default function SettingsPanel({ initialSettings, onClose, onSettingsChange }: Props) {
  const [tab, setTab] = useState<Tab>('accounts')
  const [recipients, setRecipients] = useState<any[]>([])
  const [recipientForm, setRecipientForm] = useState<any | null>(null)
  const [presets, setPresets] = useState<any[]>([])
  const [presetForm, setPresetForm] = useState<any | null>(null)
  const [accounts, setAccounts] = useState<MailConfig[]>([])
  const [showAddForm, setShowAddForm] = useState(false)
  const [editAccount, setEditAccount] = useState<MailConfig | null>(null)
  const [acctFolders, setAcctFolders] = useState<Record<string, AccountWithFolders>>({})
  const [expandedAcct, setExpandedAcct] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [testStatus, setTestStatus] = useState<Record<string, 'testing' | 'success' | 'fail'>>({})
  const [settings, setSettings] = useState<UserSettings>(initialSettings)
  const [saveMsg, setSaveMsg] = useState('')

  const loadAccounts = useCallback(async () => {
    try {
      setAccounts(await fetchAccounts())
    } catch {}
  }, [])

  useEffect(() => { loadAccounts() }, [loadAccounts])

  const loadPresets = useCallback(async () => {
    try { setPresets(await fetchPresets()) } catch {}
  }, [])

  useEffect(() => { loadPresets() }, [loadPresets])

  const loadRecipients = useCallback(async () => {
    try { setRecipients(await fetchRecipients()) } catch {}
  }, [])
  useEffect(() => { loadRecipients() }, [loadRecipients])

  const handleAdd = (cfg: MailConfig) => {
    setAccounts(prev => [...prev, cfg])
    setShowAddForm(false)
  }

  const handleRemove = async (id: string) => {
    try {
      await deleteAccount(id)
      setAccounts(prev => prev.filter(a => a.id !== id))
    } catch {}
  }

  const [testError, setTestError] = useState('')

  const handleTest = async (cfg: MailConfig) => {
    setTestStatus(prev => ({ ...prev, [cfg.id]: 'testing' }))
    setTestError('')
    try {
      await testConnection(cfg)
      setTestStatus(prev => ({ ...prev, [cfg.id]: 'success' }))
    } catch (err: any) {
      setTestStatus(prev => ({ ...prev, [cfg.id]: 'fail' }))
      setTestError(err.message || '测试失败')
    }
  }

  const expandAccount = async (acct: MailConfig) => {
    if (expandedAcct === acct.id) {
      setExpandedAcct(null)
      return
    }
    setExpandedAcct(acct.id)
    if (!acctFolders[acct.id]) {
      try {
        const [imapFolders, folders] = await Promise.all([
          fetchImapFolders(acct.id),
          fetchFolderConfig(acct.id),
        ])
        setAcctFolders(prev => ({
          ...prev,
          [acct.id]: { config: acct, imapFolders, folders },
        }))
      } catch {}
    }
  }

  const toggleFolder = (acctId: string, folderName: string) => {
    setAcctFolders(prev => {
      const acct = prev[acctId]
      if (!acct) return prev
      return {
        ...prev,
        [acctId]: {
          ...acct,
          folders: acct.folders.map(f =>
            f.folder_name === folderName ? { ...f, enabled: !f.enabled } : f,
          ),
        },
      }
    })
  }

  const updateDisplayName = (acctId: string, folderName: string, name: string) => {
    setAcctFolders(prev => {
      const acct = prev[acctId]
      if (!acct) return prev
      return {
        ...prev,
        [acctId]: {
          ...acct,
          folders: acct.folders.map(f =>
            f.folder_name === folderName ? { ...f, display_name: name } : f,
          ),
        },
      }
    })
  }

  const addFolderRow = (acctId: string, imapName: string) => {
    const guessed = guessDisplayName(imapName)
    setAcctFolders(prev => {
      const acct = prev[acctId]
      if (!acct) return prev
      if (acct.folders.some(f => f.folder_name === imapName)) return prev
      return {
        ...prev,
        [acctId]: {
          ...acct,
          folders: [...acct.folders, { folder_name: imapName, display_name: guessed, enabled: true, sort_order: acct.folders.length }],
        },
      }
    })
  }

  const saveCurrentFolders = async (acctId: string) => {
    setSaving(true)
    try {
      const acct = acctFolders[acctId]
      if (!acct) return
      await saveFolderConfig(acctId, acct.folders)
    } catch {}
    setSaving(false)
  }

  const saveUserSettings = async () => {
    try {
      await saveSettings(settings)
      onSettingsChange(settings)
      setSaveMsg('保存成功')
      setTimeout(() => setSaveMsg(''), 2000)
    } catch { setSaveMsg('保存失败') }
  }

  return (
    <div className="overlay">
      <div className="modal-panel modal-wide modal-settings">
        <div className="modal-header">
          <h2>设置</h2>
          <button className="btn-tiny" onClick={onClose}>✕</button>
        </div>

        <div className="settings-tabs">
          <button className={`settings-tab ${tab === 'accounts' ? 'active' : ''}`} onClick={() => setTab('accounts')}>账户管理</button>
          <button className={`settings-tab ${tab === 'folders' ? 'active' : ''}`} onClick={() => setTab('folders')}>邮箱文件夹</button>
          <button className={`settings-tab ${tab === 'presets' ? 'active' : ''}`} onClick={() => setTab('presets')}>服务商预设</button>
          <button className={`settings-tab ${tab === 'recipients' ? 'active' : ''}`} onClick={() => setTab('recipients')}>收件人管理</button>
          <button className={`settings-tab ${tab === 'settings' ? 'active' : ''}`} onClick={() => setTab('settings')}>用户设置</button>
          <button className={`settings-tab ${tab === 'about' ? 'active' : ''}`} onClick={() => setTab('about')}>
            关于
          </button>
        </div>

        <div className="settings-content">
          {tab === 'accounts' && (
            <div>
              {showAddForm || editAccount ? (
                <AddAccountForm
                  key={editAccount ? editAccount.id : 'new'}
                  editConfig={editAccount}
                  onAdd={(cfg) => {
                    if (editAccount) {
                      setAccounts(prev => prev.map(a => a.id === cfg.id ? cfg : a))
                      setEditAccount(null)
                    } else {
                      handleAdd(cfg)
                    }
                  }}
                  onCancel={() => { setShowAddForm(false); setEditAccount(null) }}
                />
              ) : (
                <>
                  <button className="btn-primary" onClick={() => setShowAddForm(true)}>+ 添加邮箱账户</button>
                  {testError && <div className="error-msg">{testError}</div>}
                  <div className="settings-account-list">
                    {accounts.map(a => (
                      <div key={a.id} className="settings-account-item">
                        <div>
                          <strong>{a.label}</strong>
                          {testStatus[a.id] === 'success' && <span className="test-badge success"> 测试成功</span>}
                          {testStatus[a.id] === 'fail' && <span className="test-badge fail"> 测试失败</span>}
                          {testStatus[a.id] === 'testing' && <span className="test-badge testing"> 测试中...</span>}
                          <br />
                          <span className="text-muted">{a.email}</span>
                        </div>
                        <div className="settings-account-actions">
                          <button className="btn-tiny" onClick={() => handleTest(a)}>测试连接</button>
                          <button className="btn-tiny" onClick={() => setEditAccount(a)}>编辑</button>
                          <button className="btn-tiny btn-danger-tiny" onClick={() => handleRemove(a.id)}>删除</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {tab === 'folders' && (
            <div>
              {accounts.length === 0 && <p className="empty-hint">暂无账户，请先在「账户管理」中添加</p>}
              {accounts.map(a => (
                <div key={a.id} className="settings-folder-account">
                  <div className="settings-folder-acct-header" onClick={() => expandAccount(a)}>
                    <span>{expandedAcct === a.id ? '▼' : '▶'}</span>
                    <strong>{a.label}</strong>
                    <span className="text-muted">{a.email}</span>
                  </div>
                  {expandedAcct === a.id && acctFolders[a.id] && (
                    <div className="settings-folder-list">
                      <div className="settings-folder-hint">
                        <span>从 IMAP 服务器发现 {acctFolders[a.id].imapFolders.length} 个文件夹</span>
                        <div className="settings-folder-add-imap">
                          {acctFolders[a.id].imapFolders
                            .filter(im => !acctFolders[a.id].folders.some(f => f.folder_name === im.name))
                            .map(im => (
                              <button key={im.name} className="btn-tiny" onClick={() => addFolderRow(a.id, im.name)}>
                                + {im.name}
                              </button>
                            ))}
                        </div>
                      </div>
                      {acctFolders[a.id].folders.map(f => (
                        <div key={f.folder_name} className="settings-folder-row">
                          <label className="settings-folder-toggle">
                            <input type="checkbox" checked={f.enabled} onChange={() => toggleFolder(a.id, f.folder_name)} />
                            <span className="text-mono">{f.folder_name}</span>
                          </label>
                          <input
                            className="settings-folder-name-input"
                            value={f.display_name}
                            onChange={e => updateDisplayName(a.id, f.folder_name, e.target.value)}
                            placeholder="显示名称"
                          />
                        </div>
                      ))}
                      <button className="btn-primary btn-sm" disabled={saving} onClick={() => saveCurrentFolders(a.id)}>
                        {saving ? '保存中...' : '保存文件夹配置'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {tab === 'presets' && (
            <div>
              {presetForm ? (
                <div className="preset-form">
                  <h3>{presetForm.id ? '编辑预设' : '添加预设'}</h3>
                  <div className="field-group">
                    <label>名称</label>
                    <input value={presetForm.label} onChange={e => setPresetForm({...presetForm, label: e.target.value})} placeholder="QQ 邮箱" />
                  </div>
                  <div className="field-group">
                    <label>域名</label>
                    <input value={presetForm.domain} onChange={e => setPresetForm({...presetForm, domain: e.target.value})} placeholder="qq.com" />
                  </div>
                  <fieldset>
                    <legend>SMTP</legend>
                    <div className="field-row">
                      <div className="field-group flex-1">
                        <label>服务器</label>
                        <input value={presetForm.smtpHost} onChange={e => setPresetForm({...presetForm, smtpHost: e.target.value})} />
                      </div>
                      <div className="field-group" style={{width: 100}}>
                        <label>端口</label>
                        <input type="number" value={presetForm.smtpPort} onChange={e => setPresetForm({...presetForm, smtpPort: Number(e.target.value)})} />
                      </div>
                    </div>
                    <label className="field-checkbox">
                      <input type="checkbox" checked={presetForm.smtpSecure} onChange={e => setPresetForm({...presetForm, smtpSecure: e.target.checked})} />
                      SSL/TLS
                    </label>
                  </fieldset>
                  <fieldset>
                    <legend>IMAP</legend>
                    <div className="field-row">
                      <div className="field-group flex-1">
                        <label>服务器</label>
                        <input value={presetForm.imapHost} onChange={e => setPresetForm({...presetForm, imapHost: e.target.value})} />
                      </div>
                      <div className="field-group" style={{width: 100}}>
                        <label>端口</label>
                        <input type="number" value={presetForm.imapPort} onChange={e => setPresetForm({...presetForm, imapPort: Number(e.target.value)})} />
                      </div>
                    </div>
                    <label className="field-checkbox">
                      <input type="checkbox" checked={presetForm.imapSecure} onChange={e => setPresetForm({...presetForm, imapSecure: e.target.checked})} />
                      SSL/TLS
                    </label>
                  </fieldset>
                  <div className="modal-actions" style={{marginTop: 16}}>
                    <button className="btn-secondary" onClick={() => setPresetForm(null)}>取消</button>
                    <button className="btn-primary" onClick={async () => {
                      try {
                        await savePreset(presetForm)
                        setPresetForm(null)
                        loadPresets()
                      } catch {}
                    }}>保存</button>
                  </div>
                </div>
              ) : (
                <>
                  <button className="btn-primary" onClick={() => setPresetForm({label: '', domain: '', smtpHost: '', smtpPort: 465, smtpSecure: true, imapHost: '', imapPort: 993, imapSecure: true})}>+ 添加预设</button>
                  <div className="settings-preset-list" style={{marginTop: 12}}>
                    {presets.map(p => (
                      <div key={p.id} className="settings-account-item">
                        <div>
                          <strong>{p.label}</strong>
                          <br />
                          <span className="text-muted">{p.domain}</span>
                        </div>
                        <div className="settings-account-actions">
                          <button className="btn-tiny" onClick={() => setPresetForm({...p})}>编辑</button>
                          <button className="btn-tiny btn-danger-tiny" onClick={async () => {
                            try { await deletePreset(p.id); loadPresets() } catch {}
                          }}>删除</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {tab === 'recipients' && (
            <div>
              {recipientForm ? (
                <div className="preset-form">
                  <h3>{recipientForm.id ? '编辑收件人' : '添加收件人'}</h3>
                  <div className="field-group">
                    <label>姓名</label>
                    <input value={recipientForm.name} onChange={e => setRecipientForm({...recipientForm, name: e.target.value})} placeholder="张三" />
                  </div>
                  <div className="field-group">
                    <label>邮箱</label>
                    <input value={recipientForm.email} onChange={e => setRecipientForm({...recipientForm, email: e.target.value})} placeholder="zhangsan@example.com" />
                  </div>
                  <div className="modal-actions" style={{marginTop: 16}}>
                    <button className="btn-secondary" onClick={() => setRecipientForm(null)}>取消</button>
                    <button className="btn-primary" onClick={async () => {
                      try { await saveRecipient(recipientForm); setRecipientForm(null); loadRecipients() } catch {}
                    }}>保存</button>
                  </div>
                </div>
              ) : (
                <>
                  <button className="btn-primary" onClick={() => setRecipientForm({name: '', email: ''})}>+ 添加收件人</button>
                  <div className="settings-preset-list" style={{marginTop: 12}}>
                    {recipients.map(r => (
                      <div key={r.id} className="settings-account-item">
                        <div>
                          <strong>{r.name}</strong>
                          <br />
                          <span className="text-muted">{r.email}</span>
                        </div>
                        <div className="settings-account-actions">
                          <button className="btn-tiny" onClick={() => setRecipientForm({...r})}>编辑</button>
                          <button className="btn-tiny btn-danger-tiny" onClick={async () => {
                            try { await deleteRecipient(r.id); loadRecipients() } catch {}
                          }}>删除</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {tab === 'about' && (
            <AboutTab />
          )}

          {tab === 'settings' && (
            <div>
              <fieldset>
                <legend>基本设置</legend>
                <div className="field-group">
                  <label>应用标题</label>
                  <input value={settings.appTitle} onChange={e => setSettings({ ...settings, appTitle: e.target.value })} placeholder="Mail Client" />
                </div>
                <div className="field-group">
                  <label>主题</label>
                  <select value={settings.theme} onChange={e => setSettings({ ...settings, theme: e.target.value as 'light' | 'dark' })}>
                    <option value="light">浅色</option>
                    <option value="dark">深色</option>
                  </select>
                </div>
                <div className="field-group">
                  <label>字体大小</label>
                  <input type="number" min={12} max={24} value={settings.fontSize} onChange={e => setSettings({ ...settings, fontSize: Number(e.target.value) })} />
                </div>
                <div className="field-group">
                  <label>每页显示邮件数</label>
                  <input type="number" min={10} max={200} value={settings.itemsPerPage} onChange={e => setSettings({ ...settings, itemsPerPage: Number(e.target.value) })} />
                </div>
                <div className="field-group">
                  <label>自动刷新间隔（秒，0=关闭）</label>
                  <input type="number" min={0} max={600} value={settings.autoRefreshInterval} onChange={e => setSettings({ ...settings, autoRefreshInterval: Number(e.target.value) })} />
                </div>
                <div className="field-group">
                  <label>默认签名（HTML）</label>
                  <textarea rows={4} value={settings.signature} onChange={e => setSettings({ ...settings, signature: e.target.value })} placeholder='&lt;p&gt;--&lt;br&gt;发自我的邮件客户端&lt;/p&gt;' />
                </div>
              </fieldset>

              <div className="settings-save-row">
                <button className="btn-primary" onClick={saveUserSettings}>保存设置</button>
                {saveMsg && <span className="settings-save-msg">{saveMsg}</span>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function AboutTab() {
  const [showUpdate, setShowUpdate] = useState(false)

  return (
    <div className="about-section">
      <h3>Mail Client</h3>
      <p className="about-desc">
        一款基于 Web 的多账户邮件客户端，支持 SMTP 发送与 IMAP 收取，
        提供邮件缓存、发送队列、自定义模板等功能。
      </p>
      <dl className="about-info">
        <dt>技术栈</dt>
        <dd>React + TypeScript + Express + MySQL</dd>
        <dt>作者</dt>
        <dd>heiu</dd>
      </dl>

      <div className="update-section">
        <button className="btn-primary" onClick={() => setShowUpdate(true)}>
          检查更新
        </button>
      </div>
      {showUpdate && <UpdatePanel onClose={() => setShowUpdate(false)} />}
    </div>
  )
}

function guessDisplayName(name: string): string {
  const lower = name.toLowerCase()
  if (lower === 'inbox') return '收件箱'
  if (lower.includes('sent') || lower.includes('已发送')) return '发件箱'
  if (lower.includes('draft') || lower.includes('草稿')) return '草稿箱'
  if (lower.includes('trash') || lower.includes('deleted') || lower.includes('垃圾') || lower.includes('已删除')) return '垃圾箱'
  if (lower.includes('spam') || lower.includes('junk')) return '垃圾邮件'
  if (lower.includes('archive')) return '归档'
  return name
}
