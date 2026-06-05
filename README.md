# Mail Client

基于 Web 的全功能邮件客户端，支持 SMTP 发送与 IMAP 接收，提供简单易用的邮件发送 API。
个人开发，建议只在内网进行使用。

## 特性

### 📧 邮件发送
- **SMTP 发送** — 支持端口 25/587/465，显式 TLS（STARTTLS）与隐式 SSL
- **邮件队列与重试** — 发送失败自动入队，指数退避重试（30s→1m→2m→4m→8m），最大 5 次


### 📥 邮件接收
- **IMAP 拉取** — 支持多账户、多文件夹
- **增量同步** — 仅拉取新邮件，30 秒冷却避免频繁连接
- **缓存** — MySQL 缓存邮件列表，支持强制刷新

### 🎨 界面
- **三栏布局** — 文件夹树 / 邮件列表 / 邮件预览
- **富文本编辑器** — 加粗、斜体、下划线、表格、图片、emoji
- **收件人管理** — 自动保存发过的收件人
- **多账户** — 添加任意 SMTP/IMAP 账户

### 🔐 安全
- **管理员密码** — 首次启动设置，HMAC-SHA256 保护
- **密码加密** — 邮箱密码 AES 加密存储
- **TLS 证书验证** — 可配置忽略（用于自签名证书

## 快速开始

### 本地部署

```bash
# 1. 安装依赖
npm install

# 2. 构建前端 + 编译后端
npm run build

# 3. 启动（需自行准备 MySQL）
node dist/server/index.js
```

### Docker 部署（推荐）

```bash
# 克隆仓库
git clone https://github.com/xiaoheiyo/mail_cs.git
cd mail_cs

# 启动（MySQL + 应用自动运行）
docker compose up -d

# 查看日志
docker compose logs -f app
```

首次启动后访问 `http://localhost:3001`，在初始化页面配置 MySQL 连接信息即可。

### 下载源码本地部署

```bash
# 从 GitHub 下载最新代码
git clone https://github.com/xiaoheiyo/mail_cs.git
cd mail_cs

# 安装依赖
npm install

# 构建
npm run build

# 配置环境变量（可选，也可通过前端页面配置）
set DB_HOST=127.0.0.1
set DB_PORT=3306
set DB_USER=root
set DB_PASSWORD=yourpassword
set DB_NAME=mail_cs

# 启动
node dist/server/index.js
```

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PORT` | 服务端口 | 3001 |
| `DB_HOST` | MySQL 主机 | - |
| `DB_PORT` | MySQL 端口 | 3306 |
| `DB_USER` | MySQL 用户 | - |
| `DB_PASSWORD` | MySQL 密码 | - |
| `DB_NAME` | 数据库名 | - |
| `GITHUB_TOKEN` | GitHub API 令牌（提升更新检查频率限制） | - |


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


## 技术栈

- **前端：** React 18, TypeScript, Vite
- **后端：** Node.js, Express, TypeScript
- **数据库：** MySQL 8+
- **邮件协议：** SMTP (nodemailer), IMAP (imapflow)
