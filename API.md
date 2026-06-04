# Mail Sending Library API

位于 `src/server/lib/`，可独立于 Web 界面使用。

## 模块概览

| 模块 | 文件 | 说明 |
|------|------|------|
| `MailClient` | `mailer.ts` | 邮件发送 API 入口 |
| `resolveConfig` | `config.ts` | 配置管理 |
| `SmtpSession` | `smtp-protocol.ts` | 原始 SMTP 协议会话 |
| `connect` | `connection.ts` | TCP/TLS 连接管理器 |
| `buildMime` | `mime.ts` | MIME 邮件构建器 |

---

## mailer.ts — 邮件发送 API

### `MailClient` 类

```typescript
import { MailClient } from './lib/mailer'

const client = new MailClient({
  host: 'smtp.example.com',
  port: 587,
  auth: { user: 'user@example.com', pass: '...' },
  proxy: 'socks5://127.0.0.1:1080',   // optional
  ignoreCert: false,                    // optional
  timeout: 10000,                       // optional
})
```

#### 构造参数 `MailerConfig`

```typescript
interface MailerConfig {
  host: string
  port: number
  secure?: boolean           // 默认 false（STARTTLS），true = 隐式 SSL（465）
  auth?: { user: string; pass: string }
  ignoreCert?: boolean       // 忽略 TLS 证书错误
  proxy?: string             // HTTP / SOCKS 代理 URL
  timeout?: number           // 连接超时，毫秒，默认 10000
}
```

#### 方法

**`send(mail_from, rcpt_to, subject, body, html_body?, attachments?)`** — 位置参数风格发送

```typescript
const result = await client.send(
  'sender@example.com',        // string
  'recipient@example.com',     // string | string[]
  'Hello World',               // string
  'Plain text body',           // string
  '<p>HTML body</p>',          // string | undefined
  [{ filename: 'f.pdf', content: Buffer }]  // Attachment[] | undefined
)
```

**`sendMail(options)`** — 对象选项风格发送

```typescript
const result = await client.sendMail({
  from: 'sender@example.com',
  to: ['a@example.com', 'b@example.com'],
  subject: 'Hello',
  body: 'Plain text',
  htmlBody: '<p>HTML</p>',
  attachments: [{ filename: 'doc.pdf', content: buffer, contentType: 'application/pdf' }],
  dsn: { notify: ['failure', 'delay'] },
})
```

**`sendRaw(options)`** — 通过原始 SMTP 协议发送（不走 nodemailer）

```typescript
const result = await client.sendRaw({
  from: 'sender@example.com',
  to: 'recipient@example.com',
  subject: 'Test',
  body: 'Body text',
})
// 返回 { reply: SmtpReply, accepcted: string[], rejected: string[] }
```

**`verify()`** — 测试 SMTP 连接

```typescript
await client.verify()  // throws on failure, returns true on success
```

**`resolveMx(email)`** — 查询邮箱域名的 MX 记录

```typescript
const records = await client.resolveMx('user@gmail.com')
// [{ priority: 10, exchange: 'gmail-smtp-in.l.google.com' }, ...]
```

**`configure(config)`** — 运行时更新配置

```typescript
client.configure({ host: 'smtp.other.com', port: 465, secure: true })
```

#### 返回类型 `SendResult`

```typescript
interface SendResult {
  accepted: string[]       // 被服务器接受的收件人地址
  rejected: string[]       // 被服务器拒绝的收件人地址
  messageId?: string       // SMTP 返回的 Message-ID
  pending?: boolean        // 是否已加入发送队列
}
```

### 顶层快捷函数

适用于一次性的简单发送，使用默认单例 `MailClient` 实例。

```typescript
import { send, sendMail, configure } from './lib/mailer'

// 全局配置
configure({ host: 'smtp.example.com', port: 587, auth: { user, pass } })

// 直接发送
await send(from, to, subject, body, html, attachments)
await sendMail({ from, to, subject, body, htmlBody })
```

### `Attachment` 类型

```typescript
interface Attachment {
  filename?: string              // 文件名（可选）
  content: string | Buffer       // 文件内容或 base64 字符串
  encoding?: 'base64' | 'utf-8' | 'binary'
  contentType?: string           // MIME 类型，如 application/pdf
  cid?: string                   // Content-ID，内嵌资源用（如 <cid:logo>）
  inline?: boolean               // true = 内嵌显示，false/undefined = 附件
}
```

---

## config.ts — 配置管理

优先级：**代码参数 > 环境变量 > 配置文件**

### 环境变量

| 变量 | 对应配置项 |
|------|-----------|
| `SMTP_HOST` | `host` |
| `SMTP_PORT` | `port` |
| `SMTP_SECURE` | `secure` |
| `SMTP_USER` | `auth.user` |
| `SMTP_PASS` | `auth.pass` |
| `SMTP_PROXY` | `proxy` |
| `SMTP_IGNORE_CERT` | `ignoreCert` |
| `SMTP_TIMEOUT` | `timeout` |

### 配置文件

自动读取以下文件（按优先级）：
- `mailer.config.json`
- `mailer.config.jsonc`
- `.mailerrc`

内容为 JSON，字段同 `MailerConfig`：

```json
{
  "host": "smtp.example.com",
  "port": 587,
  "auth": { "user": "user@example.com", "pass": "password" },
  "proxy": "socks5://127.0.0.1:1080",
  "ignoreCert": true,
  "timeout": 15000
}
```

### `resolveConfig()`

```typescript
function resolveConfig(
  codeConfig?: Partial<MailerConfig>,
  filePath?: string
): MailerConfig
```

---

## smtp-protocol.ts — 原始 SMTP 协议

### `SmtpSession` 类

完整的 SMTP 会话控制。每个命令返回 `SmtpReply`：

```typescript
interface SmtpReply {
  code: number        // SMTP 状态码（如 250, 235, 354）
  lines: string[]     // 所有响应行
  ok: boolean         // code >= 200 && code < 400
}
```

#### 构造

```typescript
const session = new SmtpSession({
  host: 'smtp.example.com',
  port: 587,
  useTLS?: boolean       // 隐式 SSL（465）
  startTLS?: boolean     // 明文连接后升级 TLS
  ignoreCert?: boolean
  timeout?: number
  proxy?: string
  maxRetries?: number
})
```

#### 会话生命周期

| 方法 | 对应 SMTP 命令 | 说明 |
|------|---------------|------|
| `connect()` | — | 建立 TCP/TLS 连接，读取服务器 banner |
| `close()` | — | 销毁 socket |
| `ehlo(domain?)` | `EHLO` | 发送 EHLO，返回能力列表 `{ reply, caps: string[] }` |
| `helo(domain?)` | `HELO` | 发送 HELO（fallback） |
| `startTls()` | `STARTTLS` | 升级到 TLS，返回后需重新 EHLO |
| `authPlain(user, pass)` | `AUTH PLAIN` | 单步 base64 认证 |
| `authLogin(user, pass)` | `AUTH LOGIN` | 两步挑战-响应认证 |
| `authCramMd5(user, pass)` | `AUTH CRAM-MD5` | HMAC-MD5 挑战-响应 |
| `authBest(user, pass, caps)` | — | 根据服务器能力自动选择最佳机制 |
| `mailFrom(from, options?)` | `MAIL FROM` | 设置发件人，可选附加参数 |
| `rcptTo(to)` | `RCPT TO` | 添加收件人 |
| `data(headers, body)` | `DATA` | 发送邮件（自动 dot-stuffing） |
| `rset()` | `RSET` | 重置会话 |
| `quit()` | `QUIT` | 正常断开 |
| `noop()` | `NOOP` | 保活 |
| `command(line)` | — | 发送任意原始命令 |

#### 典型流程

```typescript
const session = new SmtpSession({ host, port: 587, startTLS: true })
try {
  // 1. 连接
  await session.connect()

  // 2. EHLO 获取服务器能力
  const { reply, caps } = await session.ehlo('mydomain.com')
  if (!reply.ok) await session.helo()

  // 3. STARTTLS 升级
  if (caps.includes('STARTTLS')) {
    await session.startTls()
    await session.ehlo()  // 重新 EHLO
  }

  // 4. 自动选择认证方式
  await session.authBest(user, pass, caps)

  // 5. 发件人/收件人
  await session.mailFrom('from@example.com')
  await session.rcptTo('to@example.com')

  // 6. 发送正文
  await session.data(['From: ...', 'Subject: ...'], 'body')

  // 7. 退出
  await session.quit()
} finally {
  session.close()
}
```

---

## connection.ts — TCP/TLS 连接

### `connect(cfg)`

建立 TCP/TLS 连接，支持重试和超时。

```typescript
import { connect } from './lib/connection'

const { socket, secured } = await connect({
  host: 'smtp.example.com',
  port: 465,
  useTLS: true,              // 隐式 SSL
  ignoreCert: true,
  timeout: 10000,
  maxRetries: 2,             // 失败重试 2 次（指数退避）
})
```

### `upgradeToTLS(socket, host, ignoreCert?)`

将明文 TCP socket 升级为 TLS（STARTTLS 用）。

```typescript
const tlsSocket = await upgradeToTLS(tcpSocket, 'smtp.example.com', true)
```

### `resolveMxRecords(domain)`

DNS MX 记录查询，按优先级排序。

```typescript
const mx = await resolveMxRecords('gmail.com')
// [{ priority: 10, exchange: 'gmail-smtp-in.l.google.com' }, ...]
```

### `resolveHostname(host)`

DNS A 记录查询。

```typescript
const ip = await resolveHostname('smtp.example.com')  // "93.184.216.34"
```

### `domainFromEmail(email)`

从邮箱地址提取域名。

```typescript
domainFromEmail('user@gmail.com')  // "gmail.com"
```

---

## mime.ts — MIME 邮件构建

### `buildMime(options)`

构建符合 RFC 5322 / MIME 标准的邮件内容。

```typescript
import { buildMime } from './lib/mime'

const { headers, body, messageId } = buildMime({
  from: 'sender@example.com',
  to: ['a@example.com', 'b@example.com'],
  subject: '主题',
  text: '纯文本备选',
  html: '<p>HTML 正文</p> <img src="cid:logo">',
  attachments: [
    { filename: 'report.pdf', content: pdfBuffer, contentType: 'application/pdf' },
    { filename: 'logo.png', content: pngBase64, encoding: 'base64', cid: 'logo', inline: true },
  ],
  headers: { 'X-Priority': '1' },
})
```

#### 参数 `MimeOptions`

```typescript
interface MimeOptions {
  from: string
  to: string | string[]
  subject: string
  text?: string                    // 纯文本版本（可选，推荐提供）
  html?: string                    // HTML 版本（可选）
  attachments?: Attachment[]       // 附件 / 内嵌资源
  headers?: Record<string, string> // 自定义头
}
```

#### 返回 `BuildResult`

```typescript
interface BuildResult {
  headers: string[]    // 完整的邮件头（包括 Content-Type 等 MIME 头）
  body: string         // MIME 主体
  messageId: string    // 生成的 Message-ID
}
```

#### MIME 结构自动选择

| 输入 | 生成的 MIME 结构 |
|------|-----------------|
| 仅 `text` | `text/plain` |
| 仅 `html` | `text/html` |
| `text` + `html` | `multipart/alternative` → text/plain + text/html |
| + 附件 | `multipart/mixed` → (body) + application/* |
| + 内嵌图片 (`cid`) | `multipart/related` → html + image (cid) |
| 全部 | `multipart/mixed` → `multipart/related` → `multipart/alternative` |

#### 编码处理

- **非 ASCII 头** — 自动 `=?UTF-8?B?...?=` 编码（RFC 2047）
- **正文** — 7bit / quoted-printable / base64 按内容自动选择
- **附件** — 固定 base64，每行 76 字符折叠（RFC 2045）
- **dot-stuffing** — 调用方（`SmtpSession.data`）自动处理
