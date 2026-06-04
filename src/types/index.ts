export interface MailConfig {
  id: string
  label: string
  smtpHost: string
  smtpPort: number
  smtpSecure: boolean
  imapHost: string
  imapPort: number
  imapSecure: boolean
  email: string
  password: string
}

export interface Email {
  id: string
  accountId: string
  accountEmail: string
  from: string
  to: string
  subject: string
  body: string
  date: string
  seen: boolean
}

export interface Attachment {
  filename: string
  content: string
  encoding: 'base64'
}

export interface SendPayload {
  config: MailConfig
  to: string
  subject: string
  body: string
  attachments?: Attachment[]
}

export interface EmailTemplate {
  id: string
  name: string
  subject: string
  body: string
}

export interface FolderConfig {
  folder_name: string
  display_name: string
  enabled: boolean
  sort_order: number
}

export interface CustomLink {
  id: string
  title: string
  url: string
  icon: string
}

export interface Recipient {
  id?: number
  name: string
  email: string
}

export interface SmtpPreset {
  id?: number
  label: string
  domain: string
  smtpHost: string
  smtpPort: number
  smtpSecure: boolean
  imapHost: string
  imapPort: number
  imapSecure: boolean
}

export interface UserSettings {
  itemsPerPage: number
  appTitle: string
  theme: 'light' | 'dark'
  customLinks: CustomLink[]
  fontSize: number
  autoRefreshInterval: number
  signature: string
}
