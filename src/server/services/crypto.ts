import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16

let _key: Buffer | null = null

export function setSecretKey(hex: string) {
  _key = Buffer.from(hex, 'hex')
}

export function encrypt(plaintext: string): string {
  if (!_key) throw new Error('加密密钥未初始化')
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, _key, iv)
  let encrypted = cipher.update(plaintext, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const authTag = cipher.getAuthTag().toString('hex')
  return iv.toString('hex') + ':' + authTag + ':' + encrypted
}

export function decrypt(ciphertext: string): string {
  if (!_key) throw new Error('加密密钥未初始化')
  const parts = ciphertext.split(':')
  if (parts.length !== 3) throw new Error('无效的加密数据')
  const iv = Buffer.from(parts[0], 'hex')
  const authTag = Buffer.from(parts[1], 'hex')
  const encrypted = parts[2]
  const decipher = createDecipheriv(ALGORITHM, _key, iv)
  decipher.setAuthTag(authTag)
  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}
