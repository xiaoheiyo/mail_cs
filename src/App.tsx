import { useState, useCallback, useEffect } from 'react'
import type { MailConfig, Email, FolderConfig, UserSettings } from './types'
import { fetchEmails, checkHealth, fetchAccounts, fetchFolderConfig, markRead, fetchSettings, deleteEmail } from './api/mail'
import NavBar from './components/NavBar'
import SettingsPanel from './components/SettingsPanel'
import FolderTree from './components/FolderTree'
import MailList from './components/MailList'
import MailView from './components/MailView'
import ComposeMail from './components/ComposeMail'
import AddAccountForm from './components/AddAccountForm'
import SetupView from './views/SetupView'
import AdminLogin from './views/AdminLogin'
import TemplateManager from './components/TemplateManager'
import './App.css'

type AppPhase = 'loading' | 'setup' | 'ready' | 'admin'

function emailCacheKey(accountId: string, folder: string): string {
  return `${accountId}/${folder}`
}

const DEFAULT_SETTINGS: UserSettings = {
  itemsPerPage: 50,
  appTitle: 'Mail Client',
  theme: 'light',
  customLinks: [],
  fontSize: 14,
  autoRefreshInterval: 0,
  signature: '',
}

function applySettings(s: Partial<UserSettings>) {
  if (s.theme) document.documentElement.setAttribute('data-theme', s.theme)
  if (s.appTitle) document.title = s.appTitle
  if (s.fontSize) document.documentElement.style.fontSize = `${s.fontSize}px`
}

export default function App() {
  const [phase, setPhase] = useState<AppPhase>('loading')
  const [accounts, setAccounts] = useState<MailConfig[]>([])
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null)
  const [selectedFolder, setSelectedFolder] = useState<string>('INBOX')
  const [folderConfigs, setFolderConfigs] = useState<Record<string, FolderConfig[]>>({})
  const [emailsCache, setEmailsCache] = useState<Record<string, Email[]>>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loadingCount, setLoadingCount] = useState(0)
  const [composeInit, setComposeInit] = useState<{ to?: string; subject?: string; body?: string } | null>(null)
  const [showCompose, setShowCompose] = useState(false)
  const [showAddAccount, setShowAddAccount] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS)

  const initApp = useCallback(async () => {
    try {
      const r = await checkHealth()
      if (!r.configured) { setPhase('setup'); return }
    } catch { setPhase('setup'); return }

    const authed = localStorage.getItem('admin_authenticated') === 'true'
    if (!authed) { setPhase('admin'); return }

    try {
      const [saved, s] = await Promise.all([fetchAccounts(), fetchSettings()])
      setAccounts(saved)
      const merged = { ...DEFAULT_SETTINGS, ...s }
      setSettings(merged)
      applySettings(merged)
      if (saved.length > 0) setActiveAccountId(saved[0].id)
      setPhase('ready')
    } catch { setPhase('setup') }
  }, [])

  useEffect(() => { initApp() }, [initApp])

  // Load folder config when active account changes
  useEffect(() => {
    if (!activeAccountId) return
    fetchFolderConfig(activeAccountId)
      .then(folders => {
        setFolderConfigs(prev => ({ ...prev, [activeAccountId]: folders }))
        if (folders.length === 0) {
          setSelectedFolder('INBOX')
        } else {
          const enabled = folders.filter(f => f.enabled)
          if (enabled.length > 0 && !enabled.some(f => f.folder_name === selectedFolder)) {
            setSelectedFolder(enabled[0].folder_name)
          }
        }
      })
      .catch(() => {})
  }, [activeAccountId])

  const currentFolders = folderConfigs[activeAccountId ?? ''] ?? []

  const unreadCounts: Record<string, number> = {}
  for (const [key, list] of Object.entries(emailsCache)) {
    const count = list.filter(m => !m.seen).length
    if (count > 0) unreadCounts[key] = count
  }

  const visibleEmails = activeAccountId
    ? (emailsCache[emailCacheKey(activeAccountId, selectedFolder)] ?? [])
    : Object.values(emailsCache).flat().sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      )

  const activeAccount = accounts.find(a => a.id === activeAccountId) ?? null

  const loadFolderEmails = useCallback(async (account: MailConfig, folder: string, force?: boolean) => {
    const key = emailCacheKey(account.id, folder)
    setLoadingCount(c => c + 1)
    try {
      const list = await fetchEmails({ accountId: account.id, mailbox: folder, force } as any)
      const tagged: Email[] = list.map(m => ({
        ...m,
        accountId: account.id,
        accountEmail: account.email,
      }))
      setEmailsCache(prev => ({ ...prev, [key]: tagged }))
    } catch (err) {
      console.error(`获取 ${account.email}/${folder} 邮件失败:`, err)
    } finally {
      setLoadingCount(c => c - 1)
    }
  }, [])

  const handleSelectAccount = (id: string) => {
    setActiveAccountId(id)
    setSelectedId(null)
    setSelectedFolder('INBOX')
  }

  const handleSelectFolder = (folder: string) => {
    setSelectedFolder(folder)
    setSelectedId(null)
  }

  const handleAddAccount = (cfg: MailConfig) => {
    setAccounts(prev => [...prev, cfg])
    setActiveAccountId(cfg.id)
    setSelectedFolder('INBOX')
    setShowAddAccount(false)
  }

  useEffect(() => {
    if (activeAccount) {
      loadFolderEmails(activeAccount, selectedFolder)
    }
  }, [activeAccount, selectedFolder, loadFolderEmails])

  const refreshActive = useCallback(() => {
    if (activeAccount) loadFolderEmails(activeAccount, selectedFolder, true)
  }, [activeAccount, selectedFolder, loadFolderEmails])

  const handleSelectEmail = useCallback((compositeId: string) => {
    setSelectedId(compositeId)
    const email = visibleEmails.find(m => `${m.accountId}_${m.id}` === compositeId)
    if (email && !email.seen && activeAccountId) {
      setEmailsCache(prev => {
        const key = emailCacheKey(activeAccountId, selectedFolder)
        const list = prev[key]
        if (!list) return prev
        return { ...prev, [key]: list.map(m => m.id === email.id ? { ...m, seen: true } : m) }
      })
      markRead(activeAccountId, email.id, selectedFolder, true).catch(() => {})
    }
  }, [visibleEmails, activeAccountId, selectedFolder])

  const handleToggleRead = useCallback((compositeId: string, currentSeen: boolean) => {
    if (!activeAccountId) return
    const email = visibleEmails.find(m => `${m.accountId}_${m.id}` === compositeId)
    if (!email) return
    const newSeen = !currentSeen
    setEmailsCache(prev => {
      const key = emailCacheKey(activeAccountId, selectedFolder)
      const list = prev[key]
      if (!list) return prev
      return { ...prev, [key]: list.map(m => m.id === email.id ? { ...m, seen: newSeen } : m) }
    })
    markRead(activeAccountId, email.id, selectedFolder, newSeen).catch(() => {})
  }, [activeAccountId, selectedFolder, visibleEmails])

  const handleBatchRead = useCallback((ids: string[], seen: boolean) => {
    if (!activeAccountId) return
    setEmailsCache(prev => {
      const key = emailCacheKey(activeAccountId, selectedFolder)
      const list = prev[key]
      if (!list) return prev
      const idSet = new Set(ids)
      return { ...prev, [key]: list.map(m => idSet.has(`${m.accountId}_${m.id}`) ? { ...m, seen } : m) }
    })
    ids.forEach(compositeId => {
      const email = visibleEmails.find(m => `${m.accountId}_${m.id}` === compositeId)
      if (email) markRead(activeAccountId, email.id, selectedFolder, seen).catch(() => {})
    })
  }, [activeAccountId, selectedFolder, visibleEmails])

  const handleSettingsChange = (s: UserSettings) => {
    setSettings(s)
    applySettings(s)
  }

  const selectedEmail = visibleEmails.find(m => `${m.accountId}_${m.id}` === selectedId) ?? null
  const loading = loadingCount > 0

  if (phase === 'loading') return null

  if (phase === 'admin') {
    return <AdminLogin onLogin={initApp} />
  }

  if (phase === 'setup') {
    return <SetupView onSetupComplete={() => window.location.reload()} />
  }

  if (accounts.length === 0 && !showAddAccount) {
    return <AddAccountForm onAdd={handleAddAccount} onCancel={() => setShowAddAccount(false)} />
  }

  return (
    <div className="app-container">
      <NavBar settings={settings} onSettings={() => setShowSettings(true)} />
      <div className="app-layout">
        <div className="panel-left">
          <FolderTree
            accounts={accounts}
            activeAccountId={activeAccountId}
            folders={currentFolders}
            selectedFolder={selectedFolder}
            unreadCounts={unreadCounts}
            onSelectAccount={handleSelectAccount}
            onSelectFolder={handleSelectFolder}
            onCompose={() => setShowCompose(true)}
          />
        </div>
        <div className="panel-middle">
          <MailList
            emails={visibleEmails}
            selectedId={selectedId}
            onSelect={handleSelectEmail}
            onToggleRead={handleToggleRead}
            onBatchRead={handleBatchRead}
            onRefresh={refreshActive}
            loading={loading}
          />
        </div>
        <div className="panel-right">
          <MailView
            email={selectedEmail}
            onReply={(email) => {
              setComposeInit({
                to: email.from,
                subject: email.subject?.startsWith('Re:') ? email.subject : `Re: ${email.subject}`,
                body: `\n\n-------- 原始邮件 --------\n发件人: ${email.from}\n收件人: ${email.to}\n时间: ${new Date(email.date).toLocaleString('zh-CN')}\n\n${email.body}`,
              })
              setShowCompose(true)
            }}
            onForward={(email) => {
              setComposeInit({
                subject: email.subject?.startsWith('Fw:') ? email.subject : `Fw: ${email.subject}`,
                body: `\n\n-------- 转发邮件 --------\n发件人: ${email.from}\n收件人: ${email.to}\n时间: ${new Date(email.date).toLocaleString('zh-CN')}\n主题: ${email.subject}\n\n${email.body}`,
              })
              setShowCompose(true)
            }}
            onDelete={async (email) => {
              try {
                await deleteEmail(email.accountId, email.id, selectedFolder)
                refreshActive()
              } catch {}
            }}
            onExport={(email) => {
              const eml = [
                `From: ${email.from}`,
                `To: ${email.to}`,
                `Subject: ${email.subject}`,
                `Date: ${new Date(email.date).toUTCString()}`,
                'Content-Type: text/html; charset=utf-8',
                '',
                email.body.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ''),
              ].join('\n')
              const blob = new Blob([eml], { type: 'message/rfc822;charset=utf-8' })
              const a = document.createElement('a')
              a.href = URL.createObjectURL(blob)
              a.download = `${email.subject || 'email'}.eml`
              a.click()
              URL.revokeObjectURL(a.href)
            }}
          />
        </div>
        {showCompose && (
          <ComposeMail
            accounts={accounts}
            defaultAccount={activeAccount}
            onClose={() => {
              setShowCompose(false)
              setComposeInit(null)
            }}
            onSent={refreshActive}
            initTo={composeInit?.to}
            initSubject={composeInit?.subject}
            initBody={composeInit?.body}
          />
        )}
        {showAddAccount && (
          <AddAccountForm onAdd={handleAddAccount} onCancel={() => setShowAddAccount(false)} />
        )}
        {showTemplates && (
          <TemplateManager onClose={() => setShowTemplates(false)} />
        )}
        {showSettings && (
          <SettingsPanel
            initialSettings={settings}
            onClose={() => {
              setShowSettings(false)
              fetchAccounts().then(setAccounts).catch(() => {})
            }}
            onSettingsChange={handleSettingsChange}
          />
        )}
      </div>
    </div>
  )
}
