import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)

function loadPackageJson() {
  const pkgPath = resolve(dirname(__filename), '../../../package.json')
  const p = JSON.parse(readFileSync(pkgPath, 'utf-8'))
  return { version: p.version || '0.0.0', repoUrl: p.repository?.url || '' }
}

const UPDATE_URL = 'https://api.github.com/repos/xiaoheiyo/mail_cs/releases/latest'

export function getCurrentVersion(): string {
  return loadPackageJson().version
}

export interface CheckResult {
  current: string
  latest: string
  hasUpdate: boolean
  releaseUrl: string | null
  error?: string
}

export async function checkForUpdate(): Promise<CheckResult> {
  const { version: current } = loadPackageJson()
  try {
    const res = await fetch(UPDATE_URL, {
      headers: { 'User-Agent': 'mail-cs-update-checker' },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) {
      return { current, latest: current, hasUpdate: false, releaseUrl: null, error: '检查失败: ' + res.status }
    }
    const data: any = await res.json()
    const latest = (data.tag_name || data.name || '').replace(/^v/, '')
    if (!latest) {
      return { current, latest: current, hasUpdate: false, releaseUrl: null, error: '无法获取最新版本' }
    }
    const hasUpdate = compareVersions(latest, current) > 0
    return { current, latest, hasUpdate, releaseUrl: data.html_url || null }
  } catch (err: any) {
    return { current, latest: current, hasUpdate: false, releaseUrl: null, error: err.message || '检查失败' }
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
