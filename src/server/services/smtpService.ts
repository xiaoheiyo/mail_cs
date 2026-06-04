import { MailClient, resolveConfig } from '../lib/mailer.js'
import type { MailerConfig, SendOptions, Attachment } from '../lib/mailer.js'

export type { SendOptions, Attachment }

export interface SmtpConfig extends MailerConfig {
  user: string
  pass: string
}

export async function sendMail(config: SmtpConfig, options: SendOptions) {
  const client = new MailClient({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
    ignoreCert: config.ignoreCert,
    proxy: config.proxy,
    timeout: config.timeout,
  })

  const result = await client.sendMail({
    from: options.from || config.user,
    to: options.to,
    subject: options.subject,
    body: options.body,
    htmlBody: options.htmlBody,
    attachments: options.attachments as any,
  })
  return result
}

export async function sendMailFallback(config: SmtpConfig, to: string, subject: string, body: string, attachments?: Attachment[]) {
  return sendMail(config, { from: config.user, to, subject, body, attachments })
}

export async function verifySmtp(config: SmtpConfig) {
  const client = new MailClient({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
    ignoreCert: config.ignoreCert,
    proxy: config.proxy,
    timeout: config.timeout,
  })
  await client.verify()
}
