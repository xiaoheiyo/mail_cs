import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { resolve, dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)

function loadPackageJson() {
  const pkgPath = resolve(dirname(__filename), '../../../package.json')
  const p = JSON.parse(readFileSync(pkgPath, 'utf-8'))
  return { version: p.version || '0.0.0' }
}

const GITHUB_API = 'https://api.github.com/repos/xiaoheiyo/mail_cs/releases/latest'

export function getCurrentVersion(): string {
  return loadPackageJson().version
}

export interface CheckResult {
  current: string
  latest: string
  hasUpdate: boolean
  releaseUrl: string | null
  downloadUrl: string | null
  error?: string
}

let downloadProgress = { total: 0, received: 0, done: false, error: '' }

export function getDownloadProgress() {
  return { ...downloadProgress }
}

export async function checkForUpdate(): Promise<CheckResult> {
  const { version: current } = loadPackageJson()
  try {
    const res = await fetch(GITHUB_API, {
      headers: { 'User-Agent': 'mail-cs-update-checker' },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) {
      return { current, latest: current, hasUpdate: false, releaseUrl: null, downloadUrl: null, error: '检查失败: ' + res.status }
    }
    const data: any = await res.json()
    const latest = (data.tag_name || data.name || '').replace(/^v/, '')
    if (!latest) {
      return { current, latest: current, hasUpdate: false, releaseUrl: null, downloadUrl: null, error: '无法获取最新版本' }
    }
    const hasUpdate = compareVersions(latest, current) > 0
    const asset = data.assets?.find((a: any) => a.name.endsWith('.zip'))
    return {
      current, latest, hasUpdate,
      releaseUrl: data.html_url || null,
      downloadUrl: asset?.browser_download_url || data.zipball_url || null,
    }
  } catch (err: any) {
    return { current, latest: current, hasUpdate: false, releaseUrl: null, downloadUrl: null, error: err.message || '检查失败' }
  }
}

export async function downloadUpdate(): Promise<void> {
  const check = await checkForUpdate()
  if (!check.downloadUrl) throw new Error('没有可下载的更新包')
  downloadProgress = { total: 0, received: 0, done: false, error: '' }

  const tmpDir = join(process.cwd(), 'data', 'update_tmp')
  if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true })
  const zipPath = join(tmpDir, 'update.zip')

  const res = await fetch(check.downloadUrl, {
    headers: { 'User-Agent': 'mail-cs-downloader' },
  })
  if (!res.ok) throw new Error('下载失败: ' + res.status)

  const total = Number(res.headers.get('content-length')) || 0
  downloadProgress.total = total

  const reader = res.body!.getReader()
  const chunks: Uint8Array[] = []
  let received = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    received += value.length
    downloadProgress.received = received
  }

  const buffer = Buffer.concat(chunks)
  writeFileSync(zipPath, buffer)
  downloadProgress.done = true
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0
    const nb = pb[i] || 0
    if (na > nb) return 1
    if (na < nb) return -1
  }
  return 0
}
