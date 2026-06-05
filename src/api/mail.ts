import type { MailConfig, Email, SendPayload, EmailTemplate, FolderConfig } from '../types'

const BASE = '/api'

export async function checkHealth(): Promise<{ configured: boolean }> {
  const res = await fetch(`${BASE}/health`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function setupDatabase(config: {
  host: string
  port: string
  user: string
  password: string
  database: string
}): Promise<{ success: boolean }> {
  const res = await fetch(`${BASE}/setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

// ---- 账户持久化 ----

export async function fetchAccounts(): Promise<MailConfig[]> {
  const res = await fetch(`${BASE}/accounts`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function saveAccount(config: MailConfig): Promise<void> {
  const res = await fetch(`${BASE}/accounts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  })
  if (!res.ok) throw new Error(await res.text())
}

export async function deleteAccount(id: string): Promise<void> {
  const res = await fetch(`${BASE}/accounts/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(await res.text())
}

export async function getAccountConfig(id: string): Promise<MailConfig> {
  const res = await fetch(`${BASE}/accounts/${id}/config`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

// ---- 模板管理 ----

export async function fetchTemplates(): Promise<EmailTemplate[]> {
  const res = await fetch(`${BASE}/templates`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function saveTemplate(tmpl: EmailTemplate): Promise<void> {
  const res = await fetch(`${BASE}/templates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(tmpl),
  })
  if (!res.ok) throw new Error(await res.text())
}

export async function deleteTemplate(id: string): Promise<void> {
  const res = await fetch(`${BASE}/templates/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(await res.text())
}

// ---- 邮件操作 ----

export async function fetchEmails(config: MailConfig & { mailbox?: string; force?: boolean }): Promise<Email[]> {
  const res = await fetch(`${BASE}/mails`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function sendEmail(payload: SendPayload & { attachments?: any[] }): Promise<{ success: boolean }> {
  const res = await fetch(`${BASE}/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function markRead(accountId: string, uid: string, mailbox: string, seen: boolean): Promise<void> {
  const res = await fetch(`${BASE}/mails/${uid}/read`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accountId, mailbox, seen }),
  })
  if (!res.ok) throw new Error(await res.text())
}

export async function testConnection(config: MailConfig): Promise<{ success: boolean }> {
  const res = await fetch(`${BASE}/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

// ---- 文件夹管理 ----

export async function fetchImapFolders(accountId: string): Promise<{ name: string; specialUse: string }[]> {
  const res = await fetch(`${BASE}/accounts/${accountId}/folders/list`, { method: 'POST' })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function fetchFolderConfig(accountId: string): Promise<FolderConfig[]> {
  const res = await fetch(`${BASE}/accounts/${accountId}/folders`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function saveFolderConfig(accountId: string, folders: FolderConfig[]): Promise<void> {
  const res = await fetch(`${BASE}/accounts/${accountId}/folders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folders }),
  })
  if (!res.ok) throw new Error(await res.text())
}

// ---- 用户设置 ----

export async function fetchSettings(): Promise<Record<string, any>> {
  const res = await fetch(`${BASE}/settings`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

// ---- 服务商预设 ----

export async function fetchPresets(): Promise<any[]> {
  const res = await fetch(`${BASE}/presets`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function savePreset(preset: any): Promise<{ id: number }> {
  const method = preset.id ? 'PUT' : 'POST'
  const url = preset.id ? `${BASE}/presets/${preset.id}` : `${BASE}/presets`
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(preset),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function deletePreset(id: number): Promise<void> {
  const res = await fetch(`${BASE}/presets/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(await res.text())
}

export async function deleteEmail(accountId: string, uid: string, mailbox: string): Promise<void> {
  const res = await fetch(`${BASE}/mails/${uid}/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accountId, mailbox }),
  })
  if (!res.ok) throw new Error(await res.text())
}

// ---- 收件人管理 ----

export async function fetchRecipients(): Promise<any[]> {
  const res = await fetch(`${BASE}/recipients`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function saveRecipient(r: { name: string; email: string; id?: number }): Promise<{ id: number }> {
  const method = r.id ? 'PUT' : 'POST'
  const url = r.id ? `${BASE}/recipients/${r.id}` : `${BASE}/recipients`
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(r),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function deleteRecipient(id: number): Promise<void> {
  const res = await fetch(`${BASE}/recipients/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(await res.text())
}

// ---- 管理员密码 ----

export async function checkAdminStatus(): Promise<{ configured: boolean }> {
  const res = await fetch(`${BASE}/admin/status`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function adminSetup(password: string): Promise<void> {
  const res = await fetch(`${BASE}/admin/setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  if (!res.ok) throw new Error(await res.text())
}

export async function adminLogin(password: string): Promise<void> {
  const res = await fetch(`${BASE}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  if (!res.ok) throw new Error(await res.text())
}

export async function changeAdminPassword(oldPassword: string, newPassword: string): Promise<void> {
  const res = await fetch(`${BASE}/admin/change`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ oldPassword, newPassword }),
  })
  if (!res.ok) throw new Error(await res.text())
}

// ---- 发送队列 ----

export async function fetchQueueStats(): Promise<Record<string, number>> {
  const res = await fetch(`${BASE}/queue/stats`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function fetchFailedQueue(): Promise<any[]> {
  const res = await fetch(`${BASE}/queue/failed`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function retryQueueItem(id: number): Promise<void> {
  const res = await fetch(`${BASE}/queue/retry/${id}`, { method: 'POST' })
  if (!res.ok) throw new Error(await res.text())
}

export async function deleteQueueItem(id: number): Promise<void> {
  const res = await fetch(`${BASE}/queue/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(await res.text())
}

// ---- 版本更新 ----

export interface CommitInfo {
  sha: string
  message: string
  date: string
  author: string
}

export interface CheckUpdateResult {
  current: string
  latest: string
  hasUpdate: boolean
  commits: CommitInfo[]
  downloadUrl: string | null
  error?: string
}

export async function fetchVersion(): Promise<{ version: string }> {
  const res = await fetch(`${BASE}/version`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function checkForUpdate(): Promise<CheckUpdateResult> {
  const res = await fetch(`${BASE}/check-update`, { method: 'POST' })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function saveSettings(settings: Record<string, any>): Promise<void> {
  const res = await fetch(`${BASE}/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  })
  if (!res.ok) throw new Error(await res.text())
}
