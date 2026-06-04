# Mail Client

基于 Web 的全功能邮件客户端，支持 SMTP 发送与 IMAP 接收，提供简单易用的邮件发送 API。
个人开发，建议只在内网进行使用。

## 特性

### 📧 邮件发送
- **SMTP 发送** — 支持端口 25/587/465，显式 TLS（STARTTLS）与隐式 SSL
- **邮件队列与重试** — 发送失败自动入队，指数退避重试（30s→1m→2m→4m→8m），最大 5 次
- **批量收件人** — 支持多个 RCPT TO
- **DSN 状态通知** — 请求投递状态报告（success/failure/delay）

### 📥 邮件接收
- **IMAP 拉取** — 支持多账户、多文件夹
- **增量同步** — 仅拉取新邮件，30 秒冷却避免频繁连接
- **缓存** — MySQL 缓存邮件列表，支持强制刷新

### 🎨 界面
- **三栏布局** — 文件夹树 / 邮件列表 / 邮件预览
- **富文本编辑器** — 加粗、斜体、下划线、表格、图片、emoji
- **模板** — 邮件模板管理与快速插入
- **收件人管理** — 自动保存发过的收件人
- **多账户** — 添加任意 SMTP/IMAP 账户
- **深色模式** — 浅色/深色主题切换
- **响应式** — 适配桌面端、平板、手机
- **自定义导航链接**

### 🔐 安全
- **管理员密码** — 首次启动设置，HMAC-SHA256 保护
- **密码加密** — 邮箱密码 AES 加密存储
- **TLS 证书验证** — 可配置忽略（用于自签名证书）
- **代理支持** — HTTP CONNECT / SOCKS4 / SOCKS5

## 快速开始

```bash
# 安装依赖
npm install

# 开发模式（前后端同时启动）
npm run dev

# 构建生产版本
npm run build

# 启动生产服务
npm start
```

### 环境变量

| 变量 | 说明 |
|------|------|
| `PORT` | 服务端口（默认 3001） |
| `DB_HOST` | MySQL 主机 |
| `DB_PORT` | MySQL 端口 |
| `DB_USER` | MySQL 用户 |
| `DB_PASSWORD` | MySQL 密码 |
| `DB_NAME` | 数据库名 |
| `NODE_ENV` | 环境（production/development） |

## 邮件发送 API

### 导入

```typescript
import { send, sendMail, MailClient, configure } from './lib/mailer'
```

### 简单发送（位置参数风格）

```typescript
await send(
  'sender@example.com',     // mail_from
  'recipient@example.com',  // rcpt_to
  '邮件主题',                // subject
  '纯文本正文',              // body
  '<p>HTML 正文</p>',       // htmlBody (可选)
  [{ filename: 'test.pdf', content: buffer }]  // attachments (可选)
)
```

### 对象选项风格

```typescript
await sendMail({
  from: 'sender@example.com',
  to: ['user1@example.com', 'user2@example.com'],
  subject: 'Hello',
  body: 'Plain text content',
  htmlBody: '<p>HTML content</p>',
  attachments: [
    { filename: 'report.pdf', content: pdfBuffer, contentType: 'application/pdf' },
    { filename: 'logo.png', content: logoBase64, encoding: 'base64', cid: 'logo' },
  ],
})
```

### 实例化方式

```typescript
const client = new MailClient({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: { user: 'user@gmail.com', pass: 'app-password' },
  ignoreCert: false,
  proxy: 'socks5://127.0.0.1:1080',
  timeout: 15000,
})

await client.send(from, to, subject, body, html)
```

### 配置管理（优先级：代码 > 环境变量 > 配置文件）

**环境变量：** `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_PROXY`, `SMTP_IGNORE_CERT`

**配置文件：** 自动读取 `mailer.config.json` / `.mailerrc`（JSON 格式，字段同 `MailerConfig`）

```json
{
  "host": "smtp.example.com",
  "port": 587,
  "auth": { "user": "user", "pass": "pass" },
  "proxy": "socks5://127.0.0.1:1080"
}
```

### 返回结果

```typescript
interface SendResult {
  accepted: string[]     // 被接受的收件人
  rejected: string[]     // 被拒绝的收件人
  messageId?: string     // 服务端返回的 Message-ID
}
```

## 原始 SMTP 协议

底层 `SmtpSession` 类提供完整的 SMTP 会话控制：

```typescript
import { SmtpSession } from './lib/smtp-protocol'

const session = new SmtpSession({ host: 'smtp.example.com', port: 587, startTLS: true })
await session.connect()

// EHLO → STARTTLS → AUTH → MAIL → RCPT → DATA → QUIT
const ehlo = await session.ehlo()
if (ehlo.caps.includes('STARTTLS')) await session.startTls()
await session.authBest(user, pass, ehlo.caps)
await session.mailFrom('from@example.com')
await session.rcptTo('to@example.com')
await session.data(['From: ...', 'Subject: ...'], 'body content')
await session.quit()
```

### 支持的 SMTP 命令

| 命令 | 方法 | 说明 |
|------|------|------|
| `EHLO` / `HELO` | `ehlo()` / `helo()` | 建立连接，解析服务器能力 |
| `AUTH PLAIN` | `authPlain()` | 单步认证 |
| `AUTH LOGIN` | `authLogin()` | 两步挑战-响应 |
| `AUTH CRAM-MD5` | `authCramMd5()` | HMAC-MD5 挑战-响应 |
| 自动协商 | `authBest()` | 按服务器能力选择最佳机制 |
| `MAIL FROM` | `mailFrom()` | 设置发件人 |
| `RCPT TO` | `rcptTo()` | 添加收件人 |
| `DATA` | `data()` | 发送邮件正文（自动 dot-stuffing） |
| `RSET` | `rset()` | 重置会话 |
| `QUIT` | `quit()` | 正常断开 |
| `NOOP` | `noop()` | 保活 |

### 连接模块

```typescript
import { connect, resolveMxRecords, upgradeToTLS } from './lib/connection'
```

- `connect()` — TCP/TLS 连接，支持重试（指数退避）
- `upgradeToTLS()` — STARTTLS 升级
- `resolveMxRecords(domain)` — DNS MX 记录查询
- `resolveHostname(host)` — DNS A 记录解析

## MIME 邮件构建

```typescript
import { buildMime } from './lib/mime'

const { headers, body, messageId } = buildMime({
  from: 'sender@example.com',
  to: 'recipient@example.com',
  subject: '主题',
  text: '纯文本版本',
  html: '<p>HTML 版本</p>',
  attachments: [
    { filename: 'doc.pdf', content: buffer, contentType: 'application/pdf' },
    { filename: 'inline.png', content: pngBase64, encoding: 'base64', cid: 'img1' },
  ],
})
```

自动处理：
- **多部分结构** — `multipart/mixed` → `multipart/related` → `multipart/alternative`
- **Header 编码** — 非 ASCII 头自动 `=?UTF-8?B?...?=`（RFC 2047）
- **内容编码** — 7bit / quoted-printable / base64 自动选择
- **dot-stuffing** — DATA 内容自动转义（RFC 5321 §4.5.2）

## 项目结构

```
src/
├── api/              # 前端 API 调用
│   └── mail.ts
├── components/       # React 组件
│   ├── AddAccountForm.tsx
│   ├── ComposeMail.tsx
│   ├── FolderTree.tsx
│   ├── MailList.tsx
│   ├── MailView.tsx
│   ├── NavBar.tsx
│   ├── RichEditor.tsx
│   ├── SettingsPanel.tsx
│   └── TemplateManager.tsx
├── views/            # 页面级视图
│   ├── AdminLogin.tsx
│   └── SetupView.tsx
├── server/           # 后端
│   ├── index.ts
│   ├── db/           # MySQL 连接与初始化
│   ├── routes/       # Express 路由
│   ├── services/     # 业务逻辑
│   └── lib/          # 邮件库（可独立使用）
│       ├── mailer.ts          # 邮件发送 API 入口
│       ├── config.ts          # 配置管理
│       ├── connection.ts      # TCP/TLS 连接
│       ├── smtp-protocol.ts   # SMTP 协议实现
│       └── mime.ts            # MIME 邮件构建
├── types/            # TypeScript 类型
│   └── index.ts
├── App.tsx           # 主应用
├── App.css           # 样式
└── index.css         # 全局样式
```

## 技术栈

- **前端：** React 18, TypeScript, Vite
- **后端：** Node.js, Express, TypeScript
- **数据库：** MySQL 8+
- **邮件协议：** SMTP (nodemailer), IMAP (imapflow)
