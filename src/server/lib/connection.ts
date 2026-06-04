import { connect as tcpConnect, type Socket } from 'net'
import { connect as tlsConnect, type TLSSocket, type ConnectionOptions } from 'tls'
import { lookup, resolveMx } from 'dns'

export interface ConnConfig {
  host: string
  port: number
  /** Use TLS immediately (implicit SSL, port 465) */
  useTLS?: boolean
  /** Use STARTTLS (explicit TLS, upgrade from plain) */
  startTLS?: boolean
  /** Ignore certificate errors */
  ignoreCert?: boolean
  /** Connection / greeting timeout ms */
  timeout?: number
  /** HTTP / SOCKS proxy URL */
  proxy?: string
  /** Max retry attempts on connection failure */
  maxRetries?: number
}

export interface ConnResult {
  socket: Socket | TLSSocket
  secured: boolean
}

const RETRY_DELAYS = [500, 1000, 2000, 4000, 8000]

/**
 * Resolve hostname to IP address.
 */
export function resolveHostname(host: string): Promise<string> {
  return new Promise((resolve, reject) => {
    lookup(host, 4, (err: Error | null, address: string) => {
      if (err) return reject(err)
      resolve(address)
    })
  })
}

/**
 * Resolve MX records for a domain, sorted by priority (lowest first).
 */
export function resolveMxRecords(domain: string): Promise<{ priority: number; exchange: string }[]> {
  return new Promise((resolve, reject) => {
    resolveMx(domain, (err: Error | null, addresses) => {
      if (err) return reject(err)
      addresses.sort((a, b) => a.priority - b.priority)
      resolve(addresses)
    })
  })
}

/**
 * Extract domain from an email address.
 */
export function domainFromEmail(email: string): string {
  const at = email.lastIndexOf('@')
  if (at === -1) throw new Error(`Invalid email address: ${email}`)
  return email.slice(at + 1).toLowerCase()
}

/**
 * Low-level TCP / TLS connection with timeout and retry.
 */
export async function connect(cfg: ConnConfig): Promise<ConnResult> {
  const maxRetries = cfg.maxRetries ?? 0
  let lastErr: Error | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_DELAYS[Math.min(attempt - 1, RETRY_DELAYS.length - 1)]
      await new Promise(r => setTimeout(r, delay))
    }

    try {
      return await doConnect(cfg)
    } catch (err: any) {
      lastErr = err
    }
  }

  throw lastErr ?? new Error('Connection failed')
}

async function doConnect(cfg: ConnConfig): Promise<ConnResult> {
  const timeout = cfg.timeout ?? 10000

  if (cfg.useTLS) {
    // Implicit SSL (port 465)
    const socket = await tlsConnectWithTimeout(cfg.host, cfg.port, timeout, {
      rejectUnauthorized: !cfg.ignoreCert,
    })
    return { socket, secured: true }
  }

  // Plain TCP
  const socket = await tcpConnectWithTimeout(cfg.host, cfg.port, timeout)

  if (cfg.startTLS) {
    // Will be upgraded later via STARTTLS command
    return { socket, secured: false }
  }

  return { socket, secured: false }
}

function tcpConnectWithTimeout(host: string, port: number, timeout: number): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.destroy()
      reject(new Error(`TCP connection timeout after ${timeout}ms to ${host}:${port}`))
    }, timeout)

    const socket = tcpConnect(port, host, () => {
      clearTimeout(timer)
      resolve(socket)
    })

    socket.on('error', (err: Error) => {
      clearTimeout(timer)
      reject(new Error(`TCP error on ${host}:${port} - ${err.message}`))
    })

    socket.on('close', () => clearTimeout(timer))
  })
}

function tlsConnectWithTimeout(
  host: string,
  port: number,
  timeout: number,
  tlsOpts: ConnectionOptions,
): Promise<TLSSocket> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.destroy()
      reject(new Error(`TLS connection timeout after ${timeout}ms to ${host}:${port}`))
    }, timeout)

    const socket = tlsConnect(port, host, {
      ...tlsOpts,
      host,
    })

    socket.on('secureConnect', () => {
      clearTimeout(timer)
      resolve(socket)
    })

    socket.on('error', (err: Error) => {
      clearTimeout(timer)
      reject(new Error(`TLS error on ${host}:${port} - ${err.message}`))
    })

    socket.on('close', () => clearTimeout(timer))
  })
}

/**
 * Upgrade a plain TCP socket to TLS (STARTTLS).
 */
export function upgradeToTLS(socket: Socket, host: string, ignoreCert?: boolean): Promise<TLSSocket> {
  return new Promise((resolve, reject) => {
    const tlsSocket = tlsConnect({
      socket,
      host,
      rejectUnauthorized: !ignoreCert,
    })

    tlsSocket.once('secureConnect', () => resolve(tlsSocket))
    tlsSocket.once('error', reject)
  })
}
