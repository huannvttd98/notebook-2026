'use strict';

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// Thư mục chứa file DB (db/ ở gốc dự án) — tạo nếu chưa có
const dbDir = path.join(__dirname, '..', 'db');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'notebook.db');
const db = new Database(dbPath);

// WAL: cho phép đọc/ghi đồng thời mượt hơn, hợp với server nhỏ
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Migration: tạo bảng nếu chưa tồn tại
db.exec(`
  CREATE TABLE IF NOT EXISTS entries (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    title      TEXT,
    content    TEXT NOT NULL,
    mood       TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_entries_created ON entries(created_at DESC);

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
  );

  -- Tài khoản người dùng: đăng nhập bằng username, email dùng để reset mật khẩu
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  -- Token đặt lại mật khẩu (chỉ lưu hash của token, hết hạn + dùng 1 lần)
  CREATE TABLE IF NOT EXISTS password_resets (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at    TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX IF NOT EXISTS idx_resets_token ON password_resets(token_hash);

  -- Chia sẻ ghi chú: 1 dòng = note_id được chia sẻ (xem+sửa) cho user_id.
  -- Xóa note hoặc xóa user thì tự gỡ chia sẻ (ON DELETE CASCADE).
  CREATE TABLE IF NOT EXISTS note_shares (
    note_id    INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    PRIMARY KEY (note_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_shares_user ON note_shares(user_id);
`);

// Migration: thêm cột nếu DB cũ chưa có
const cols = db.prepare(`PRAGMA table_info(entries)`).all().map((c) => c.name);
if (!cols.includes('rating')) {
  db.exec(`ALTER TABLE entries ADD COLUMN rating INTEGER NOT NULL DEFAULT 0`);
}
if (!cols.includes('images')) {
  // Mảng JSON các URL ảnh đính kèm trong nội dung ghi chú
  db.exec(`ALTER TABLE entries ADD COLUMN images TEXT NOT NULL DEFAULT '[]'`);
}
if (!cols.includes('music')) {
  // Link nhạc (YouTube/Spotify) gắn vào ghi chú — nghe khi mở ghi chú
  db.exec(`ALTER TABLE entries ADD COLUMN music TEXT NOT NULL DEFAULT ''`);
}
if (!cols.includes('user_id')) {
  // Chủ sở hữu ghi chú (NULL = ghi chú cũ chưa gán user). Mỗi user chỉ thấy
  // ghi chú của mình; xem db.js -> claimOrphanEntries trong auth khi user đầu đăng ký.
  db.exec(`ALTER TABLE entries ADD COLUMN user_id INTEGER REFERENCES users(id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_entries_user ON entries(user_id)`);
}

// Migration: nếu bảng users đã tồn tại từ schema cũ mà thiếu cột, thêm vào.
// (ALTER thêm cột nullable; ràng buộc unique đảm bảo bằng index bên dưới.)
const ucols = db.prepare(`PRAGMA table_info(users)`).all().map((c) => c.name);
if (!ucols.includes('email')) {
  db.exec(`ALTER TABLE users ADD COLUMN email TEXT`);
}
if (!ucols.includes('password_hash')) {
  db.exec(`ALTER TABLE users ADD COLUMN password_hash TEXT`);
}
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username)`);
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email)`);

module.exports = db;
