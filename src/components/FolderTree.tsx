import type { MailConfig, FolderConfig } from '../types'

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
          <span className="folder-tree-version">v1.0.0</span>
          <span className="folder-tree-support">技术支持：<a href="https://www.heiu.top" target="_blank" rel="noopener noreferrer">嘿哟博客</a></span>
        </div>
      </div>
    </div>
  )
}
