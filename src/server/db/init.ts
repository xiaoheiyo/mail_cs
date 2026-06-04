import { query } from './index.js'

const TABLES = [
  `CREATE TABLE IF NOT EXISTS cached_emails (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    email_addr VARCHAR(255) NOT NULL,
    message_uid INT UNSIGNED NOT NULL,
    from_addr VARCHAR(255) NOT NULL,
    to_addr TEXT,
    subject TEXT,
    body LONGTEXT,
    date DATETIME,
    seen BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_email_uid (email_addr, message_uid),
    INDEX idx_email_addr (email_addr),
    INDEX idx_date (date DESC)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS email_accounts (
    id VARCHAR(64) PRIMARY KEY,
    label VARCHAR(128) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password_enc TEXT NOT NULL,
    smtp_host VARCHAR(255) NOT NULL,
    smtp_port INT NOT NULL,
    smtp_secure TINYINT(1) DEFAULT 1,
    imap_host VARCHAR(255) NOT NULL,
    imap_port INT NOT NULL,
    imap_secure TINYINT(1) DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS email_templates (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    subject TEXT NOT NULL,
    body LONGTEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS user_settings (
    id INT PRIMARY KEY DEFAULT 1,
    settings JSON NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS smtp_presets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    label VARCHAR(64) NOT NULL,
    domain VARCHAR(64) NOT NULL,
    smtp_host VARCHAR(255) NOT NULL,
    smtp_port INT NOT NULL,
    smtp_secure TINYINT(1) DEFAULT 1,
    imap_host VARCHAR(255) NOT NULL,
    imap_port INT NOT NULL,
    imap_secure TINYINT(1) DEFAULT 1,
    sort_order INT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_label (label)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS account_folders (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    account_id VARCHAR(64) NOT NULL,
    folder_name VARCHAR(255) NOT NULL,
    display_name VARCHAR(128) NOT NULL DEFAULT '',
    enabled TINYINT(1) DEFAULT 1,
    sort_order INT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_account_folder (account_id, folder_name)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS recipients (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    email VARCHAR(255) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_email (email)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS send_queue (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    account_id VARCHAR(64) NOT NULL,
    to_addr TEXT NOT NULL,
    subject TEXT NOT NULL,
    body LONGTEXT NOT NULL,
    attachments JSON DEFAULT NULL,
    status ENUM('pending','sending','failed') DEFAULT 'pending',
    retry_count INT DEFAULT 0,
    max_retries INT DEFAULT 5,
    last_error TEXT DEFAULT NULL,
    next_retry_at DATETIME DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_status (status),
    INDEX idx_next_retry (next_retry_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
]

const DEFAULT_PRESETS = [
  { label: 'QQ 邮箱',       domain: 'qq.com',       smtp_host: 'smtp.qq.com',       smtp_port: 465, smtp_secure: 1, imap_host: 'imap.qq.com',       imap_port: 993, imap_secure: 1, sort_order: 1 },
  { label: 'Foxmail',       domain: 'foxmail.com',  smtp_host: 'smtp.qq.com',       smtp_port: 465, smtp_secure: 1, imap_host: 'imap.qq.com',       imap_port: 993, imap_secure: 1, sort_order: 2 },
  { label: '163 邮箱',      domain: '163.com',      smtp_host: 'smtp.163.com',      smtp_port: 465, smtp_secure: 1, imap_host: 'imap.163.com',      imap_port: 993, imap_secure: 1, sort_order: 3 },
  { label: '126 邮箱',      domain: '126.com',      smtp_host: 'smtp.126.com',      smtp_port: 465, smtp_secure: 1, imap_host: 'imap.126.com',      imap_port: 993, imap_secure: 1, sort_order: 4 },
  { label: 'Gmail',         domain: 'gmail.com',    smtp_host: 'smtp.gmail.com',    smtp_port: 587, smtp_secure: 0, imap_host: 'imap.gmail.com',    imap_port: 993, imap_secure: 1, sort_order: 5 },
  { label: 'Outlook',       domain: 'outlook.com',  smtp_host: 'smtp.office365.com', smtp_port: 587, smtp_secure: 0, imap_host: 'imap.office365.com', imap_port: 993, imap_secure: 1, sort_order: 6 },
  { label: 'Hotmail',       domain: 'hotmail.com',  smtp_host: 'smtp.office365.com', smtp_port: 587, smtp_secure: 0, imap_host: 'imap.office365.com', imap_port: 993, imap_secure: 1, sort_order: 7 },
  { label: '阿里企业邮箱', domain: 'aliyun.com',   smtp_host: 'smtp.mxhichina.com', smtp_port: 465, smtp_secure: 1, imap_host: 'imap.mxhichina.com', imap_port: 993, imap_secure: 1, sort_order: 8 },
  { label: '新浪邮箱',     domain: 'sina.com',     smtp_host: 'smtp.sina.com',     smtp_port: 465, smtp_secure: 1, imap_host: 'imap.sina.com',     imap_port: 993, imap_secure: 1, sort_order: 9 },
  { label: '搜狐邮箱',     domain: 'sohu.com',     smtp_host: 'smtp.sohu.com',     smtp_port: 465, smtp_secure: 1, imap_host: 'imap.sohu.com',     imap_port: 993, imap_secure: 1, sort_order: 10 },
  { label: 'Zoho',          domain: 'zoho.com',     smtp_host: 'smtp.zoho.com',     smtp_port: 465, smtp_secure: 1, imap_host: 'imap.zoho.com',     imap_port: 993, imap_secure: 1, sort_order: 11 },
  { label: 'Yandex',        domain: 'yandex.com',   smtp_host: 'smtp.yandex.com',   smtp_port: 465, smtp_secure: 1, imap_host: 'imap.yandex.com',   imap_port: 993, imap_secure: 1, sort_order: 12 },
]

async function seedPresets() {
  const rows = await query<any[]>('SELECT COUNT(*) as cnt FROM smtp_presets')
  if (rows[0].cnt > 0) return
  for (const p of DEFAULT_PRESETS) {
    await query(
      'INSERT INTO smtp_presets (label, domain, smtp_host, smtp_port, smtp_secure, imap_host, imap_port, imap_secure, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [p.label, p.domain, p.smtp_host, p.smtp_port, p.smtp_secure, p.imap_host, p.imap_port, p.imap_secure, p.sort_order],
    )
  }
  console.log('[DB] 默认服务商预设已初始化')
}

export async function initDatabase() {
  for (const sql of TABLES) {
    await query(sql)
  }
  for (const col of ['smtp_secure TINYINT(1) DEFAULT 1', 'imap_secure TINYINT(1) DEFAULT 1']) {
    try { await query(`ALTER TABLE email_accounts ADD COLUMN ${col}`) } catch {}
  }
  try { await seedPresets() } catch {}
  console.log('[DB] 数据表已就绪')
}
