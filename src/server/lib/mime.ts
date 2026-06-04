import { randomUUID } from 'crypto'

// ── Interfaces ────────────────────────────────────────────────────

export interface Attachment {
  filename?: string
  content: string | Buffer
  encoding?: 'base64' | 'utf-8' | 'binary'
  contentType?: string
  /** Content-ID for inline resources (e.g. <cid:logo> → cid = "logo") */
  cid?: string
  /** True = inline display, false/undefined = attachment */
  inline?: boolean
}

export interface MimeOptions {
  from: string
  to: string | string[]
  subject: string
  /** Plain text body (optional if html provided) */
  text?: string
  /** HTML body (optional if text provided) */
  html?: string
  /** Attachments (regular) */
  attachments?: Attachment[]
  /** Custom headers */
  headers?: Record<string, string>
}

export interface BuildResult {
  headers: string[]
  body: string
  messageId: string
}

// ── Constants ─────────────────────────────────────────────────────

const CRLF = '\r\n'

// ── Encoding helpers ───────────────────────────────────────────────

/** RFC 2047 encode a header value that contains non-ASCII chars */
function encodeHeader(value: string): string {
  // Check if encoding is needed
  if (/^[\x20-\x7E]*$/.test(value)) return value

  const bytes = Buffer.from(value, 'utf-8')
  const b64 = bytes.toString('base64')
  // Split long encoded words (RFC 5322 recommends max 76 chars per encoded-word)
  const maxLine = 60 // leave room for =?UTF-8?B?...?=
  const result: string[] = []
  for (let i = 0; i < b64.length; i += maxLine) {
    const chunk = b64.slice(i, i + maxLine)
    result.push(`=?UTF-8?B?${chunk}?=`)
  }
  return result.join(CRLF + ' ')
}

/** Generate a unique Message-ID */
function generateMessageId(): string {
  const domain = 'mailer.local'
  return `<${randomUUID()}@${domain}>`
}

/** Base64 encode with line wrapping (RFC 2045: max 76 chars) */
function base64Wrap(data: string | Buffer, maxCol = 76): string {
  const b64 = typeof data === 'string' ? Buffer.from(data, 'utf-8').toString('base64') : data.toString('base64')
  const lines: string[] = []
  for (let i = 0; i < b64.length; i += maxCol) {
    lines.push(b64.slice(i, i + maxCol))
  }
  return lines.join(CRLF)
}

/** Quoted-Printable encode (RFC 2045) */
function qpEncode(data: string | Buffer, maxCol = 76): string {
  const buf = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data
  const lines: string[] = []
  let line = ''
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i]
    let encoded: string
    if (b === 0x09 || (b >= 0x20 && b <= 0x3c) || (b >= 0x3e && b <= 0x7e)) {
      // Tab, printable ASCII except '='
      encoded = String.fromCharCode(b)
    } else if (b === 0x0d || b === 0x0a) {
      // Keep CR/LF as-is for line breaks? In QP, soft line breaks are =\r\n
      // Actually we handle these separately
      encoded = String.fromCharCode(b)
    } else if (b === 0x3d) {
      // '=' must be encoded
      encoded = '=3D'
    } else {
      encoded = `=${b.toString(16).padStart(2, '0').toUpperCase()}`
    }

    // Soft line break if too long (not for CR/LF)
    if (line.length + encoded.length > maxCol - 1 && b !== 0x0d && b !== 0x0a) {
      lines.push(line + '=')
      line = encoded
    } else {
      line += encoded
    }
  }
  if (line) lines.push(line)
  return lines.join(CRLF)
}

/** Choose best Content-Transfer-Encoding for text */
function textEncoding(body: string): { encoding: string; encoded: string } {
  const buf = Buffer.from(body, 'utf-8')
  // Check if pure 7-bit ASCII
  const isAscii = /^[\x00-\x7F]*$/.test(body)
  if (isAscii && body.length === buf.length) {
    return { encoding: '7bit', encoded: body }
  }
  // Use base64 for non-ASCII (more compact than QP for CJK)
  if (buf.length > 200) {
    return { encoding: 'base64', encoded: base64Wrap(body) }
  }
  return { encoding: 'quoted-printable', encoded: qpEncode(body) }
}

// ── MIME part builders ────────────────────────────────────────────

interface Part {
  headers: string[]
  body: string
}

function buildTextPart(text: string, contentType: 'plain' | 'html'): Part {
  const enc = textEncoding(text)
  const headers = [
    `Content-Type: text/${contentType}; charset=utf-8`,
    `Content-Transfer-Encoding: ${enc.encoding}`,
  ]
  return { headers, body: enc.encoded }
}

function buildAttachmentPart(att: Attachment): Part {
  const contentType = att.contentType || 'application/octet-stream'
  const disposition = att.inline ? 'inline' : 'attachment'
  const dispLine = att.filename
    ? `Content-Disposition: ${disposition}; filename="${encodeHeader(att.filename)}"`
    : `Content-Disposition: ${disposition}`

  const headers: string[] = [
    `Content-Type: ${contentType}`,
    `Content-Transfer-Encoding: base64`,
    dispLine,
  ]

  if (att.cid) {
    headers.push(`Content-ID: <${att.cid}>`)
  }

  const raw = typeof att.content === 'string'
    ? (att.encoding === 'base64' ? att.content : Buffer.from(att.content, 'utf-8').toString('base64'))
    : att.content.toString('base64')

  const body = base64Wrap(raw)

  return { headers, body }
}

function buildBoundary(): string {
  return `=_${randomUUID().replace(/-/g, '')}`
}

function renderMultipart(parts: Part[], boundary: string): Part {
  const headers = [`Content-Type: multipart/mixed; boundary="${boundary}"`]
  const body = CRLF +
    parts.map(p => `--${boundary}${CRLF}${p.headers.join(CRLF)}${CRLF}${CRLF}${p.body}`).join(CRLF) +
    `${CRLF}--${boundary}--`
  return { headers, body }
}

function renderAlternative(textPart?: Part, htmlPart?: Part): Part[] {
  const parts: Part[] = []
  if (textPart) parts.push(textPart)
  if (htmlPart) parts.push(htmlPart)
  if (parts.length <= 1) return parts

  const boundary = buildBoundary()
  const altHeaders = [`Content-Type: multipart/alternative; boundary="${boundary}"`]
  const body = CRLF +
    parts.map(p => `--${boundary}${CRLF}${p.headers.join(CRLF)}${CRLF}${CRLF}${p.body}`).join(CRLF) +
    `${CRLF}--${boundary}--`
  return [{ headers: altHeaders, body }]
}

function renderRelated(htmlPart: Part, inlineParts: Attachment[]): Part {
  const boundary = buildBoundary()
  const inlineEntries = inlineParts.map(buildAttachmentPart)

  // First part is the HTML (must be the "root" of the related)
  const allParts = [htmlPart, ...inlineEntries]
  const body = CRLF +
    allParts.map(p => `--${boundary}${CRLF}${p.headers.join(CRLF)}${CRLF}${CRLF}${p.body}`).join(CRLF) +
    `${CRLF}--${boundary}--`

  return {
    headers: [`Content-Type: multipart/related; boundary="${boundary}"`],
    body,
  }
}

// ── Main build function ───────────────────────────────────────────

/**
 * Build a complete RFC 5322 / MIME message.
 *
 * Handles:
 *  - multipart/mixed   (for attachments)
 *  - multipart/related (for inline resources in HTML)
 *  - multipart/alternative (for text + HTML)
 *  - Header encoding (RFC 2047)
 *  - Base64 / QP / 7bit encoding
 *  - Message-ID generation
 *
 * Usage:
 *   const { headers, body } = buildMime({ from, to, subject, text, html, attachments })
 *   // headers + body are ready for SMTP DATA
 */
export function buildMime(opts: MimeOptions): BuildResult {
  const messageId = generateMessageId()

  // Separate inline resources from regular attachments
  const inline = (opts.attachments ?? []).filter(a => a.cid)
  const attachments = (opts.attachments ?? []).filter(a => !a.cid)

  // Build body parts
  const textPart = opts.text ? buildTextPart(opts.text, 'plain') : undefined
  let htmlPart = opts.html ? buildTextPart(opts.html, 'html') : undefined

  // If HTML has inline resources, wrap in multipart/related
  if (htmlPart && inline.length > 0) {
    htmlPart = renderRelated(htmlPart, inline)
  }

  // Combine text + HTML into multipart/alternative
  const bodyParts: Part[] = []
  const alternatives = renderAlternative(textPart, htmlPart)
  bodyParts.push(...alternatives)

  // Wrap everything in multipart/mixed if there are attachments
  let topParts: Part[]
  if (attachments.length > 0) {
    const attachParts = attachments.map(buildAttachmentPart)
    topParts = [...bodyParts, ...attachParts]
  } else {
    topParts = bodyParts
  }

  // If only a single part, use it directly
  let finalPart: Part
  if (topParts.length === 1) {
    finalPart = topParts[0]
  } else {
    const boundary = buildBoundary()
    finalPart = renderMultipart(topParts, boundary)
  }

  // Build the envelope headers
  const to = Array.isArray(opts.to) ? opts.to.join(', ') : opts.to
  const headers: string[] = [
    `From: ${encodeHeader(opts.from)}`,
    `To: ${encodeHeader(to)}`,
    `Subject: ${encodeHeader(opts.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: ${messageId}`,
    'MIME-Version: 1.0',
  ]

  // Custom headers
  if (opts.headers) {
    for (const [k, v] of Object.entries(opts.headers)) {
      headers.push(`${k}: ${v}`)
    }
  }

  // Combine headers with content-type from the final part
  const allHeaders = [...headers, ...finalPart.headers]

  return { headers: allHeaders, body: finalPart.body, messageId }
}
