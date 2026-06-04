import { query } from '../db/index.js'

export interface EmailTemplate {
  id: string
  name: string
  subject: string
  body: string
}

let _idCounter = 0
export function nextTemplateId(): string {
  _idCounter++
  return `tmpl_${Date.now()}_${_idCounter}`
}

export async function listTemplates(): Promise<EmailTemplate[]> {
  const rows = await query<any[]>(
    'SELECT id, name, subject, body FROM email_templates ORDER BY created_at ASC',
  )
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    subject: r.subject,
    body: r.body,
  }))
}

export async function saveTemplate(tmpl: EmailTemplate) {
  await query(
    `INSERT INTO email_templates (id, name, subject, body)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       name = VALUES(name),
       subject = VALUES(subject),
       body = VALUES(body)`,
    [tmpl.id, tmpl.name, tmpl.subject, tmpl.body],
  )
}

export async function deleteTemplate(id: string) {
  await query('DELETE FROM email_templates WHERE id = ?', [id])
}
