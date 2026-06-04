import type { SmtpPreset } from '../types'

export function matchPreset(email: string, presets: SmtpPreset[]): SmtpPreset | undefined {
  const m = email.match(/@([\w.-]+)$/)
  if (!m) return undefined
  const domain = m[1].toLowerCase()
  return presets.find(p => p.domain && (domain === p.domain || domain.endsWith('.' + p.domain)))
}
