import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'

interface ImapConfig {
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
}

export interface EmailHeaders {
  id: string
  from: string
  to: string
  subject: string
  date: string
  seen: boolean
}

export interface EmailBody extends EmailHeaders {
  body: string
}

/** 拉取邮件，支持增量（sinceUid）和指定 mailbox */
export async function fetchRecentEmails(
  config: ImapConfig,
  options?: { sinceUid?: number; mailbox?: string },
): Promise<EmailBody[]> {
  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
    tls: { rejectUnauthorized: false },
    logger: false,
  })

  await client.connect()
  const mailbox = options?.mailbox || 'INBOX'
  const lock = await client.getMailboxLock(mailbox)
  const emails: EmailBody[] = []

  try {
    const fetchRange = options?.sinceUid ? `${options.sinceUid + 1}:*` : '1:*'
    const messages = client.fetch(fetchRange, {
      envelope: true,
      source: true,
      flags: true,
    })

    for await (const msg of messages) {
      const raw = msg.source
      if (!raw) continue

      try {
        const parsed = await simpleParser(raw)
        const envelope = msg.envelope
        emails.push({
          id: msg.uid.toString(),
          from: parsed.from?.text || envelope?.from?.map(a => a.address).filter(Boolean).join(', ') || 'unknown',
          to: (Array.isArray(parsed.to) ? parsed.to[0]?.text : parsed.to?.text) || envelope?.to?.map(a => a.address).filter(Boolean).join(', ') || '',
          subject: parsed.subject || envelope?.subject || '(无主题)',
          date: parsed.date?.toISOString() || envelope?.date?.toISOString() || new Date().toISOString(),
          seen: !(msg.flags?.has ? msg.flags.has('\\Seen') : false),
          body: parsed.html || parsed.textAsHtml || parsed.text || '',
        })
      } catch {
        continue
      }
    }

    if (!options?.sinceUid) {
      emails.reverse()
    }
  } finally {
    lock.release()
    await client.logout()
  }

  return emails
}
