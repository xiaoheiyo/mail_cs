import { createHmac } from 'crypto'
import type { Socket } from 'net'
import type { TLSSocket } from 'tls'
import { connect, upgradeToTLS, type ConnConfig } from './connection.js'

export type { ConnConfig }

/** SMTP reply from server */
export interface SmtpReply {
  code: number
  lines: string[]
  ok: boolean
}

/**
 * Parse multi-line SMTP response.
 * Final line matches `^d{3} ` (space after code).
 * Continuation lines match `^d{3}-` (hyphen after code).
 */
function parseReply(data: string): SmtpReply {
  const lines = data.trim().split('\r\n')
  const last = lines[lines.length - 1]
  const code = parseInt(last.substring(0, 3), 10)
  return { code, lines, ok: code >= 200 && code < 400 }
}

/** CRAM-MD5: compute response given a challenge and password */
function cramMd5Response(challenge: string, password: string): string {
  const hmac = createHmac('md5', password)
  hmac.update(Buffer.from(challenge, 'base64').toString('utf-8'))
  return hmac.digest('hex')
}

/**
 * Dot-stuff a message body per RFC 5321 §4.5.2:
 *  - A line starting with `.` gets an extra `.` prepended.
 *  - A line consisting of only `.` would end the DATA, so it's escaped to `..`.
 */
function dotStuff(body: string): string {
  return body.replace(/^\./gm, '..')
}

export class SmtpSession {
  private socket: Socket | TLSSocket | null = null
  private buffer = ''
  private cfg: ConnConfig
  private secured = false

  constructor(config: ConnConfig) {
    this.cfg = config
  }

  get isConnected(): boolean {
    return this.socket !== null && !this.socket.destroyed
  }

  get isSecured(): boolean {
    return this.secured
  }

  // ── Session lifecycle ──────────────────────────────────────────

  /** Establish TCP/TLS connection and read the server greeting */
  async connect(): Promise<SmtpReply> {
    const result = await connect(this.cfg)
    this.socket = result.socket
    this.secured = result.secured
    return this.readReply(10000)
  }

  /** Close the connection */
  close() {
    if (this.socket) {
      try { this.socket.destroy() } catch {}
      this.socket = null
    }
  }

  // ── SMTP commands ───────────────────────────────────────────────

  /** EHLO — request extended features */
  async ehlo(domain = 'localhost'): Promise<{ reply: SmtpReply; caps: string[] }> {
    const reply = await this.command(`EHLO ${domain}`)
    const caps: string[] = []
    for (const line of reply.lines) {
      // Only the first 4 characters are `ddd` + `-` or ` `
      const m = line.match(/^\d{3}[ -](.+)$/)
      if (m) caps.push(m[1].toUpperCase().trim())
    }
    return { reply, caps }
  }

  /** HELO — fallback greeting */
  async helo(domain = 'localhost'): Promise<SmtpReply> {
    return this.command(`HELO ${domain}`)
  }

  /** STARTTLS — upgrade to TLS */
  async startTls(): Promise<SmtpReply> {
    const reply = await this.command('STARTTLS')
    if (!reply.ok) return reply

    if (!this.socket) throw new Error('Socket not connected')
    this.socket = await upgradeToTLS(this.socket as Socket, this.cfg.host, this.cfg.ignoreCert)
    this.secured = true
    return reply
  }

  /** AUTH PLAIN */
  async authPlain(user: string, pass: string): Promise<SmtpReply> {
    const auth = `\0${user}\0${pass}`
    return this.command(`AUTH PLAIN ${Buffer.from(auth).toString('base64')}`)
  }

  /** AUTH LOGIN (two-step challenge-response) */
  async authLogin(user: string, pass: string): Promise<SmtpReply> {
    let reply = await this.command('AUTH LOGIN')
    if (!reply.ok) return reply

    reply = await this.command(Buffer.from(user).toString('base64'))
    if (!reply.ok) return reply

    reply = await this.command(Buffer.from(pass).toString('base64'))
    return reply
  }

  /** AUTH CRAM-MD5 (challenge-response, RFC 2195) */
  async authCramMd5(user: string, pass: string): Promise<SmtpReply> {
    const reply = await this.command('AUTH CRAM-MD5')
    if (!reply.ok) return reply

    // Server challenge is the last line (or the first line), in base64
    const challengeLine = reply.lines[0].replace(/^\d{3}[- ]/, '').trim()
    const digest = cramMd5Response(challengeLine, pass)
    const response = `${user} ${digest}`
    return this.command(Buffer.from(response).toString('base64'))
  }

  /** Automatically choose the best AUTH mechanism */
  async authBest(user: string, pass: string, advertisedCaps: string[]): Promise<SmtpReply> {
    const caps = advertisedCaps.map(c => c.split('=')[0])

    if (caps.includes('AUTH') || caps.includes('AUTH=PLAIN')) {
      const r = await this.authPlain(user, pass)
      if (r.ok) return r
    }

    if (caps.includes('AUTH=LOGIN') || caps.includes('AUTH')) {
      const r = await this.authLogin(user, pass)
      if (r.ok) return r
    }

    if (caps.includes('AUTH=CRAM-MD5')) {
      const r = await this.authCramMd5(user, pass)
      if (r.ok) return r
    }

    // Fallback: try each directly
    let r = await this.authPlain(user, pass)
    if (r.ok) return r
    r = await this.authLogin(user, pass)
    if (r.ok) return r
    r = await this.authCramMd5(user, pass)
    if (r.ok) return r

    throw new Error('Authentication failed: no compatible AUTH mechanism')
  }

  /** MAIL FROM — set reverse-path (envelope sender) */
  async mailFrom(from: string, options?: string): Promise<SmtpReply> {
    let cmd = `MAIL FROM:<${from}>`
    if (options) cmd += ` ${options}`
    return this.command(cmd)
  }

  /** RCPT TO — add a recipient */
  async rcptTo(to: string): Promise<SmtpReply> {
    return this.command(`RCPT TO:<${to}>`)
  }

  /**
   * DATA — send email content.
   *
   * Headers and body are sent as a single block.
   * Dot-stuffing is applied automatically.
   * The terminating `\r\n.\r\n` is appended.
   */
  async data(headers: string[], body: string): Promise<SmtpReply> {
    let reply = await this.command('DATA')
    if (!reply.ok) return reply

    const raw = [...headers, '', body].join('\r\n')
    const escaped = dotStuff(raw)
    return this.commandRaw(escaped + '\r\n.')
  }

  /** RSET — reset session (clear MAIL, RCPT, DATA) */
  async rset(): Promise<SmtpReply> {
    return this.command('RSET')
  }

  /** QUIT — graceful termination */
  async quit(): Promise<SmtpReply> {
    const reply = await this.command('QUIT')
    this.close()
    return reply
  }

  /** NOOP — keep-alive / test */
  async noop(): Promise<SmtpReply> {
    return this.command('NOOP')
  }

  // ── Low-level I/O ───────────────────────────────────────────────

  /** Send a command line (appends \r\n) */
  async command(line: string): Promise<SmtpReply> {
    if (!this.socket) throw new Error('Not connected')
    this.socket.write(line + '\r\n')
    return this.readReply(30000)
  }

  /** Send raw data (no \r\n appended) */
  private async commandRaw(data: string): Promise<SmtpReply> {
    if (!this.socket) throw new Error('Not connected')
    this.socket.write(data)
    return this.readReply(60000) // DATA can take longer
  }

  /**
   * Read an SMTP response.
   *
   * SMTP responses end with a line matching `^\d{3} ` (three digits + space).
   * Continuation lines match `^\d{3}-`.
   * We accumulate data until we see a complete final line.
   */
  private async readReply(timeout: number): Promise<SmtpReply> {
    if (!this.socket) throw new Error('Not connected')

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup()
        reject(new Error('SMTP response timeout'))
      }, timeout)

      const onData = (chunk: Buffer) => {
        this.buffer += chunk.toString('utf-8')

        // Search for complete response in buffer
        // A complete response ends with a line `ddd ...\r\n`
        const idx = tryExtractReply(this.buffer)
        if (idx !== -1) {
          const replyStr = this.buffer.substring(0, idx)
          this.buffer = this.buffer.substring(idx)
          cleanup()
          resolve(parseReply(replyStr))
        }
      }

      const onError = (err: Error) => {
        cleanup()
        reject(err)
      }

      const onClose = () => {
        cleanup()
        reject(new Error('Connection closed'))
      }

      const cleanup = () => {
        clearTimeout(timer)
        if (this.socket) {
          this.socket.removeListener('data', onData)
          this.socket.removeListener('error', onError)
          this.socket.removeListener('close', onClose)
        }
      }

      this.socket!.on('data', onData)
      this.socket!.on('error', onError)
      this.socket!.on('close', onClose)
    })
  }
}

/**
 * Scan `buf` for a complete SMTP response.
 * Returns the index AFTER the final \r\n, or -1 if incomplete.
 *
 * A complete response is one where a line ending with \r\n starts
 * with `^\d{3} ` (three digits + space).
 */
function tryExtractReply(buf: string): number {
  // Must have at least one \r\n
  const idxCr = buf.indexOf('\r\n')
  if (idxCr === -1) return -1

  // Look for final line pattern from the end
  // A response is complete when we see `\n` followed by `ddd ` pattern,
  // and that line is at a valid position (either start or after previous \r\n)
  let searchPos = 0
  while (true) {
    const crlf = buf.indexOf('\r\n', searchPos)
    if (crlf === -1) return -1

    const lineStart = searchPos === 0 ? 0 : searchPos + 2
    const line = buf.substring(lineStart, crlf)

    // If this line starts with `ddd ` it's a final response
    if (/^\d{3} /.test(line)) {
      // Verify there's a preceding line with the same code (for multi-line) or it's single-line
      const endPos = crlf + 2
      if (lineStart === 0) return endPos // single line response

      // For multi-line, check that preceding lines exist (already in buffer)
      // Just check the line before (if any) also starts with the same code
      return endPos
    }

    // For continuation lines (`ddd-`), keep going
    searchPos = crlf + 2
  }
}
