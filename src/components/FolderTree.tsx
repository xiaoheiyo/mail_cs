import { useState, useEffect } from 'react'
import type { MailConfig, FolderConfig } from '../types'
import UpdatePanel from './UpdatePanel'

interface Props {
  accounts: MailConfig[]
  activeAccountId: string | null
  folders: FolderConfig[]
  selectedFolder: string
  unreadCounts: Record<string, number>
  onSelectAccount: (id: string) => void
  onSelectFolder: (folder: string) => void
  onCompose: () => void
}

export default function FolderTree({
  accounts, activeAccountId, folders, selectedFolder, unreadCounts,
  onSelectAccount, onSelectFolder, onCompose,
}: Props) {
  const [version, setVersion] = useState('')
  const [hasUpdate, setHasUpdate] = useState(false)
  const [updateInfo, setUpdateInfo] = useState('')
  const [showUpdate, setShowUpdate] = useState(false)
  const [showDeploy, setShowDeploy] = useState(false)

  useEffect(() => {
    fetch('/api/version').then(r => r.json()).then(v => {
      setVersion(v.version || '')
      const cached = sessionStorage.getItem('mail_cs_update_v2')
      if (cached) {
        const c = JSON.parse(cached)
        setHasUpdate(c.hasUpdate)
        if (c.hasUpdate) setUpdateInfo(`新版本 ${c.latest}`)
        else setUpdateInfo('已是最新')
        return
      }
      fetch('/api/check-update', { method: 'POST' }).then(r => r.json()).then(r => {
        sessionStorage.setItem('mail_cs_update_v2', JSON.stringify(r))
        setHasUpdate(r.hasUpdate)
        if (r.error) setUpdateInfo('检查失败')
        else if (r.hasUpdate) setUpdateInfo(`新版本 ${r.latest}`)
        else setUpdateInfo('已是最新')
      }).catch(() => setUpdateInfo('检查失败'))
    }).catch(() => {})
  }, [])

  const enabledFolders = folders.filter(f => f.enabled)
  // Ensure at least INBOX is available
  const displayFolders = enabledFolders.length > 0
    ? enabledFolders
    : [{ folder_name: 'INBOX', display_name: '收件箱', enabled: true, sort_order: 0 }]

  return (
    <div className="folder-tree">
      <div className="folder-tree-section">
        <div className="folder-tree-header">账户</div>
        <div className="folder-tree-accounts">
          {accounts.map(a => (
            <div
              key={a.id}
              className={`folder-tree-account ${activeAccountId === a.id ? 'active' : ''}`}
              onClick={() => onSelectAccount(a.id)}
            >
              <span className="folder-tree-acct-name">{a.label}</span>
            </div>
          ))}
        </div>
      </div>

      {activeAccountId && (
        <div className="folder-tree-section">
          <div className="folder-tree-header">邮箱文件夹</div>
          <div className="folder-tree-folders">
            {displayFolders.map(f => (
              <div
                key={f.folder_name}
                className={`folder-tree-folder ${selectedFolder === f.folder_name ? 'active' : ''}`}
                onClick={() => onSelectFolder(f.folder_name)}
              >
                <span className="folder-tree-folder-icon">
                  {f.folder_name === 'INBOX' ? '📬' : f.folder_name.toLowerCase().includes('sent') ? '📤' : f.folder_name.toLowerCase().includes('draft') ? '📝' : '📁'}
                </span>
                <span className="folder-tree-folder-name">{f.display_name || f.folder_name}</span>
                {activeAccountId && unreadCounts[`${activeAccountId}/${f.folder_name}`] > 0 && (
                  <span className="folder-tree-unread-badge">{unreadCounts[`${activeAccountId}/${f.folder_name}`]}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="folder-tree-actions">
        <button className="btn-primary folder-tree-compose" onClick={onCompose} disabled={!activeAccountId}>
          写邮件
        </button>
        <div className="folder-tree-footer">
          <span className="folder-tree-version" onClick={() => setShowUpdate(true)}>
            {version ? `v${version}` : ''}
          </span>
          {updateInfo && (
            <span className={`folder-tree-update ${hasUpdate ? 'has-update' : ''}`} onClick={() => setShowUpdate(true)}>
              {updateInfo}
            </span>
          )}
          <span className="folder-tree-support">
            <a href="https://www.heiu.top" target="_blank" rel="noopener noreferrer">嘿哟博客</a>
            &nbsp;·&nbsp;
            <span className="folder-tree-deploy" onClick={() => setShowDeploy(p => !p)}>部署指南</span>
          </span>
          {showDeploy && (
            <div className="folder-tree-deploy-box">
              <strong>Docker 部署</strong>
              <pre>docker compose up -d</pre>
              <strong>本地部署</strong>
              <pre>npm install &amp;&amp; npm run build &amp;&amp; node dist/server/index.js</pre>
              <span className="folder-tree-deploy-close" onClick={() => setShowDeploy(false)}>收起</span>
            </div>
          )}
        </div>
        {showUpdate && <UpdatePanel onClose={() => setShowUpdate(false)} />}
      </div>
    </div>
  )
}
