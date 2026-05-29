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

  CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    provider    TEXT NOT NULL,        -- 'telegram' (sau này: 'zalo', 'dev')
    provider_id TEXT NOT NULL,        -- id từ nhà cung cấp
    name        TEXT,
    username    TEXT,
    photo_url   TEXT,
    cover_image TEXT,                 -- ảnh bìa lịch (mỗi user 1 ảnh)
    created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    UNIQUE(provider, provider_id)
  );
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
if (!cols.includes('user_id')) {
  // Chủ sở hữu ghi chú (NULL = dữ liệu cũ, sẽ gán cho user đầu tiên đăng nhập)
  db.exec(`ALTER TABLE entries ADD COLUMN user_id INTEGER`);
}
db.exec(`CREATE INDEX IF NOT EXISTS idx_entries_user ON entries(user_id, created_at DESC)`);

module.exports = db;
