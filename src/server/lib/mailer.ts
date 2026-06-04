import nodemailer from 'nodemailer'
import type { MailerConfig } from './config.js'
import { resolveConfig } from './config.js'
import { SmtpSession, type SmtpReply, type ConnConfig } from './smtp-protocol.js'
import { resolveMxRecords, domainFromEmail } from './connection.js'
import { buildMime } from './mime.js'
import type { Attachment as MimeAttachment } from './mime.js'

export { resolveConfig }
export type { MailerConfig }
export { SmtpSession, resolveMxRecords, domainFromEmail }
export type { SmtpReply, ConnConfig }

interface SentInfo {
  accepted: string[]
  rejected: string[]
  messageId?: string
}

export interface Attachment {
  filename?: string
  content: string | Buffer
  encoding?: 'base64' | 'utf-8' | 'binary'
  contentType?: string
  /** Content-ID for inline resources (e.g. <cid:logo>) */
  cid?: string
  /** True = inline display, false/undefined = attachment */
  inline?: boolean
}

export interface SendOptions {
  from: string
  to: string | string[]
  subject: string
  body: string
  htmlBody?: string
  attachments?: Attachment[]
  /** Request DSN (Delivery Status Notification) */
  dsn?: { id?: string; return?: 'headers' | 'full'; notify?: ('success' | 'failure' | 'delay')[] }
}

export interface SendResult {
  accepted: string[]
  rejected: string[]
  messageId?: string
  pending?: boolean
}

export interface SmtpSendResult {
  reply: SmtpReply
  accepcted: string[]
  rejected: string[]
}

/** Convert simple positional args to SendOptions */
function toOptions(
  mail_from: string,
  rcpt_to: string | string[],
  subject: string,
  body: string,
  html_body?: string,
  attachments?: Attachment[],
): SendOptions {
  return { from: mail_from, to: rcpt_to, subject, body, htmlBody: html_body, attachments }
}

export class MailClient {
  private cfg: MailerConfig

  constructor(config?: Partial<MailerConfig>) {
    this.cfg = resolveConfig(config)
  }

  /** Update configuration at runtime */
  configure(config: Partial<MailerConfig>) {
    this.cfg = resolveConfig(config)
  }

  /** Resolve MX records for a recipient email domain */
  async resolveMx(email: string): Promise<{ priority: number; exchange: string }[]> {
    return resolveMxRecords(domainFromEmail(email))
  }

  // ── High-level API (via nodemailer) ────────────────────────────

  private createTransport() {
    const tls: Record<string, any> = {}
    if (this.cfg.ignoreCert) tls.rejectUnauthorized = false

    const opts: any = {
      host: this.cfg.host,
      port: this.cfg.port,
      secure: this.cfg.secure ?? false,
      tls: Object.keys(tls).length ? tls : undefined,
      connectionTimeout: this.cfg.timeout,
      greetingTimeout: this.cfg.timeout,
    }

    if (this.cfg.auth?.user && this.cfg.auth?.pass) {
      opts.auth = { user: this.cfg.auth.user, pass: this.cfg.auth.pass }
    }

    if (this.cfg.proxy) {
      opts.proxy = this.cfg.proxy
    }

    return nodemailer.createTransport(opts)
  }

  /** Simple positional-style send */
  async send(
    mail_from: string,
    rcpt_to: string | string[],
    subject: string,
    body: string,
    html_body?: string,
    attachments?: Attachment[],
  ): Promise<SendResult> {
    return this.sendMail(toOptions(mail_from, rcpt_to, subject, body, html_body, attachments))
  }

  /** Options-object send */
  async sendMail(options: SendOptions): Promise<SendResult> {
    const transporter = this.createTransport()

    const to = Array.isArray(options.to) ? options.to.join(', ') : options.to

    const mailOpts: any = {
      from: options.from,
      to,
      subject: options.subject,
      text: options.body,
    }

    if (options.htmlBody) {
      mailOpts.html = options.htmlBody
    } else {
      mailOpts.html = options.body
    }

    if (options.attachments?.length) {
      mailOpts.attachments = options.attachments.map(a => ({
        filename: a.filename,
        content: a.content,
        encoding: a.encoding,
        contentType: a.contentType,
      }))
    }

    if (options.dsn) {
      mailOpts.dsn = options.dsn
    }

    const info = (await transporter.sendMail(mailOpts)) as SentInfo

    return {
      accepted: info.accepted ?? [],
      rejected: info.rejected ?? [],
      messageId: info.messageId,
    }
  }

  /** Test SMTP connection via nodemailer */
  async verify(): Promise<boolean> {
    const transporter = this.createTransport()
    await transporter.verify()
    return true
  }

  // ── Low-level API (raw SMTP protocol) ─────────────────────────

  /**
   * Send via raw SMTP protocol.
   * Uses EHLO → STARTTLS (optional) → AUTH → MAIL FROM → RCPT TO → DATA.
   */
  async sendRaw(options: SendOptions): Promise<SmtpSendResult> {
    const recipients = Array.isArray(options.to) ? options.to : [options.to]
    const domain = this.cfg.host || 'localhost'

    const session = new SmtpSession({
      host: this.cfg.host || 'localhost',
      port: this.cfg.port || 587,
      useTLS: this.cfg.secure === true && this.cfg.port === 465,
      startTLS: this.cfg.secure !== true && this.cfg.port !== 465,
      ignoreCert: this.cfg.ignoreCert,
      timeout: this.cfg.timeout,
      proxy: this.cfg.proxy,
    })

    try {
      // 1. Connect
      await session.connect()

      // 2. EHLO
      const ehlo = await session.ehlo(domain)
      if (!ehlo.reply.ok) {
        await session.helo(domain)
      }

      // 3. STARTTLS if available and not already secured
      const hasStartTls = ehlo.caps.some(c => c === 'STARTTLS')
      if (hasStartTls && !session.isSecured) {
        const stls = await session.startTls()
        if (stls.ok) {
          // Re-EHLO after STARTTLS
          await session.ehlo(domain)
        }
      }

      // 4. AUTH — try best mechanism based on server capabilities
      if (this.cfg.auth?.user && this.cfg.auth?.pass) {
        await session.authBest(this.cfg.auth.user, this.cfg.auth.pass, ehlo.caps)
      }

      // 5. MAIL FROM
      const mf = await session.mailFrom(options.from)
      if (!mf.ok) {
        throw new Error(`MAIL FROM rejected: ${mf.lines.join(' | ')}`)
      }

      // 6. RCPT TO
      const accepted: string[] = []
      const rejected: string[] = []
      for (const rcpt of recipients) {
        const r = await session.rcptTo(rcpt)
        if (r.ok) {
          accepted.push(rcpt)
        } else {
          rejected.push(rcpt)
        }
      }

      if (accepted.length === 0) {
        throw new Error('All recipients rejected')
      }

      // 7. Build MIME message and send via DATA
      const mime = buildMime({
        from: options.from,
        to: recipients,
        subject: options.subject,
        text: options.htmlBody ? options.body : undefined,
        html: options.htmlBody,
        attachments: options.attachments as MimeAttachment[],
      })
      const dataReply = await session.data(mime.headers, mime.body)

      // 8. QUIT
      await session.quit()

      return {
        reply: dataReply,
        accepcted: accepted,
        rejected,
      }
    } finally {
      session.close()
    }
  }
}

/* ---- Default singleton instance ---- */
let defaultClient = new MailClient()

/** Reconfigure default client */
export function configure(config?: Partial<MailerConfig>) {
  defaultClient = new MailClient(config)
}

/** Simple positional send via default client */
export async function send(
  mail_from: string,
  rcpt_to: string | string[],
  subject: string,
  body: string,
  html_body?: string,
  attachments?: Attachment[],
): Promise<SendResult> {
  return defaultClient.send(mail_from, rcpt_to, subject, body, html_body, attachments)
}

/** Options-object send via default client */
export async function sendMail(options: SendOptions): Promise<SendResult> {
  return defaultClient.sendMail(options)
}
