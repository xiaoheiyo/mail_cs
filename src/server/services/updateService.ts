import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from 'fs'
import { resolve, dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const __filename = fileURLToPath(import.meta.url)

function loadPackageJson() {
  const pkgPath = resolve(dirname(__filename), '../../../package.json')
  const p = JSON.parse(readFileSync(pkgPath, 'utf-8'))
  return { version: p.version || '0.0.0' }
}

const GITHUB_API = 'https://api.github.com/repos/xiaoheiyo/mail_cs/releases/latest'
const DOWNLOAD_PROXY = 'https://gh-proxy.com/'

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

  const downloadUrl = DOWNLOAD_PROXY + check.downloadUrl
  const res = await fetch(downloadUrl, {
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
    downloadProgress.total = Math.max(downloadProgress.total, received)
  }

  const buffer = Buffer.concat(chunks)
  writeFileSync(zipPath, buffer)
  downloadProgress.done = true
}

let applyProgress = { step: '', done: false, error: '' }

export function getApplyProgress() {
  return { ...applyProgress }
}

export function applyUpdate(): void {
  const tmpDir = join(process.cwd(), 'data', 'update_tmp')
  const zipPath = join(tmpDir, 'update.zip')
  if (!existsSync(zipPath)) throw new Error('未找到更新包，请先下载')

  const extractDir = join(tmpDir, 'extracted')
  if (existsSync(extractDir)) {
    rmSync(extractDir, { recursive: true })
  }
  mkdirSync(extractDir, { recursive: true })

  applyProgress = { step: '正在解压...', done: false, error: '' }

  const isWin = process.platform === 'win32'
  if (isWin) {
    execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${extractDir}' -Force"`, {
      stdio: 'pipe', timeout: 60000,
    })
  } else {
    execSync(`unzip -o "${zipPath}" -d "${extractDir}"`, {
      stdio: 'pipe', timeout: 60000,
    })
  }

  applyProgress = { step: '正在复制文件...', done: false, error: '' }

  // The zip contains a single root folder like "mail_cs-main/"
  const entries = readdirSync(extractDir)
  const root = entries.length === 1 ? join(extractDir, entries[0]) : extractDir
  copyRecursive(root, process.cwd())

  applyProgress = { step: '正在安装依赖...', done: false, error: '' }
  execSync('npm install', { stdio: 'pipe', cwd: process.cwd(), timeout: 120000 })

  applyProgress = { step: '正在构建...', done: false, error: '' }
  execSync('npm run build', { stdio: 'pipe', cwd: process.cwd(), timeout: 120000 })

  applyProgress = { step: '', done: true, error: '' }
}

function copyRecursive(src: string, dest: string) {
  const entries = readdirSync(src, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = join(src, entry.name)
    const destPath = join(dest, entry.name)
    if (entry.isDirectory()) {
      if (!existsSync(destPath)) mkdirSync(destPath, { recursive: true })
      copyRecursive(srcPath, destPath)
    } else {
      writeFileSync(destPath, readFileSync(srcPath))
    }
  }
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
