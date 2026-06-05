import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from 'fs'
import { resolve, dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const __filename = fileURLToPath(import.meta.url)

const COMMITS_API = 'https://api.github.com/repos/xiaoheiyo/mail_cs/commits?per_page=10'
const DOWNLOAD_PROXY = 'https://gh-proxy.com/'
const GH_TOKEN = process.env.GITHUB_TOKEN || ''

function getCurrentCommit(): string {
  try {
    return execSync('git rev-parse --short=7 HEAD', { cwd: process.cwd(), encoding: 'utf-8', timeout: 5000 }).trim()
  } catch {
    try {
      const pkgPath = resolve(dirname(__filename), '../../../package.json')
      const p = JSON.parse(readFileSync(pkgPath, 'utf-8'))
      return p.version || '0.0.0'
    } catch {
      return '0.0.0'
    }
  }
}

const CURRENT_COMMIT = getCurrentCommit()

export function getCurrentVersion(): string {
  return CURRENT_COMMIT
}

export interface CommitInfo {
  sha: string
  message: string
  date: string
  author: string
}

export interface CheckResult {
  current: string
  latest: string
  hasUpdate: boolean
  commits: CommitInfo[]
  downloadUrl: string | null
  error?: string
}

let downloadProgress = { total: 0, received: 0, done: false, error: '' }

export function getDownloadProgress() {
  return { ...downloadProgress }
}

export async function checkForUpdate(): Promise<CheckResult> {
  try {
    const headers: Record<string, string> = { 'User-Agent': 'mail-cs-update-checker' }
    if (GH_TOKEN) headers['Authorization'] = `Bearer ${GH_TOKEN}`
    const res = await fetch(COMMITS_API, { headers, signal: AbortSignal.timeout(10000) })
    if (res.status === 403) {
      const msg = GH_TOKEN ? 'GitHub API 访问被拒' : 'GitHub API 频率限制，请设置环境变量 GITHUB_TOKEN'
      return { current: CURRENT_COMMIT, latest: CURRENT_COMMIT, hasUpdate: false, commits: [], downloadUrl: null, error: msg }
    }
    if (!res.ok) {
      return { current: CURRENT_COMMIT, latest: CURRENT_COMMIT, hasUpdate: false, commits: [], downloadUrl: null, error: '检查失败: ' + res.status }
    }
    const data: any[] = await res.json()
    if (!data || data.length === 0) {
      return { current: CURRENT_COMMIT, latest: CURRENT_COMMIT, hasUpdate: false, commits: [], downloadUrl: null, error: '无法获取提交记录' }
    }

    const latestSha = data[0].sha.substring(0, 7).trim()
    const hasUpdate = latestSha !== CURRENT_COMMIT.trim()

    const commits: CommitInfo[] = data.map((c: any) => ({
      sha: c.sha.substring(0, 7),
      message: (c.commit?.message || '').split('\n')[0],
      date: c.commit?.committer?.date || '',
      author: c.commit?.author?.name || '',
    }))

    return {
      current: CURRENT_COMMIT,
      latest: latestSha,
      hasUpdate,
      commits,
      downloadUrl: `https://github.com/xiaoheiyo/mail_cs/archive/refs/heads/main.zip`,
    }
  } catch (err: any) {
    return { current: CURRENT_COMMIT, latest: CURRENT_COMMIT, hasUpdate: false, commits: [], downloadUrl: null, error: err.message || '检查失败' }
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
  if (existsSync(extractDir)) rmSync(extractDir, { recursive: true })
  mkdirSync(extractDir, { recursive: true })

  applyProgress = { step: '正在解压...', done: false, error: '' }

  const isWin = process.platform === 'win32'
  if (isWin) {
    execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${extractDir}' -Force"`, {
      stdio: 'pipe', timeout: 60000,
    })
  } else {
    execSync(`unzip -o "${zipPath}" -d "${extractDir}"`, { stdio: 'pipe', timeout: 60000 })
  }

  applyProgress = { step: '正在复制文件...', done: false, error: '' }

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
