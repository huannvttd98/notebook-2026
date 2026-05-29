'use strict';

const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const db = require('./db');

const router = express.Router();
const isProd = process.env.NODE_ENV === 'production';

// ===== Prepared statements cho users =====
const stmtFindUser = db.prepare(`SELECT * FROM users WHERE provider = ? AND provider_id = ?`);
const stmtGetUser = db.prepare(`SELECT * FROM users WHERE id = ?`);
const stmtInsertUser = db.prepare(
  `INSERT INTO users (provider, provider_id, name, username, photo_url) VALUES (?, ?, ?, ?, ?)`
);
const stmtUpdateUser = db.prepare(
  `UPDATE users SET name = ?, username = ?, photo_url = ? WHERE id = ?`
);
const stmtCountUsers = db.prepare(`SELECT COUNT(*) AS n FROM users`);

// Tìm/tạo user theo (provider, provider_id). Lần đầu tạo user (DB rỗng) sẽ
// "nhận" toàn bộ dữ liệu cũ chưa có chủ (user_id IS NULL) + ảnh bìa chung cũ.
function upsertUser(provider, providerId, profile = {}) {
  const pid = String(providerId);
  const existing = stmtFindUser.get(provider, pid);
  if (existing) {
    stmtUpdateUser.run(profile.name || existing.name, profile.username || existing.username, profile.photo_url || existing.photo_url, existing.id);
    return stmtGetUser.get(existing.id);
  }

  const wasEmpty = stmtCountUsers.get().n === 0;
  const info = stmtInsertUser.run(provider, pid, profile.name || null, profile.username || null, profile.photo_url || null);
  const userId = info.lastInsertRowid;

  if (wasEmpty) {
    // Gán dữ liệu cũ cho người dùng đầu tiên
    db.prepare(`UPDATE entries SET user_id = ? WHERE user_id IS NULL`).run(userId);
    const oldCover = db.prepare(`SELECT value FROM settings WHERE key = 'cover_image'`).get();
    if (oldCover && oldCover.value) {
      db.prepare(`UPDATE users SET cover_image = ? WHERE id = ?`).run(oldCover.value, userId);
    }
  }
  return stmtGetUser.get(userId);
}

// ===== Xác thực dữ liệu Telegram Login Widget =====
function verifyTelegram(data) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !data || !data.hash) return false;

  const { hash, ...fields } = data;
  const dataCheckString = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join('\n');
  const secret = crypto.createHash('sha256').update(token).digest();
  const computed = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');

  if (computed !== hash) return false;
  // Chống replay: dữ liệu không quá 24h
  const age = Math.floor(Date.now() / 1000) - Number(fields.auth_date || 0);
  return age >= 0 && age < 86400;
}

// ===== Middleware bảo vệ =====
function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    req.userId = req.session.userId;
    return next();
  }
  return res.status(401).json({ error: 'Chưa đăng nhập' });
}

// Chặn dò: tối đa 20 lần gọi auth / 15 phút / IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

// GET /auth/telegram — callback từ Telegram Login Widget (redirect mode)
router.get('/auth/telegram', authLimiter, (req, res) => {
  const data = req.query || {};
  if (!verifyTelegram(data)) {
    return res.status(401).send('Xác thực Telegram thất bại. <a href="/login.html">Thử lại</a>');
  }
  const name = [data.first_name, data.last_name].filter(Boolean).join(' ') || data.username || 'Người dùng';
  const user = upsertUser('telegram', data.id, {
    name,
    username: data.username || null,
    photo_url: data.photo_url || null,
  });
  req.session.regenerate((err) => {
    if (err) return res.status(500).send('Lỗi tạo phiên đăng nhập');
    req.session.userId = user.id;
    res.redirect('/');
  });
});

// POST /auth/dev-login — chỉ chạy ở môi trường dev (local)
router.post('/auth/dev-login', (req, res) => {
  if (isProd) return res.status(404).json({ error: 'Không khả dụng' });
  const dev = upsertUser('dev', '0', { name: 'Local Dev' });
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'Lỗi phiên' });
    req.session.userId = dev.id;
    res.json({ ok: true });
  });
});

// POST /api/logout
router.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

// GET /api/config — cấu hình công khai cho trang login (tên bot + cờ dev)
router.get('/api/config', (req, res) => {
  res.json({
    botUsername: process.env.TELEGRAM_BOT_USERNAME || null,
    dev: !isProd,
  });
});

// GET /api/me — thông tin user hiện tại
router.get('/api/me', (req, res) => {
  const uid = req.session && req.session.userId;
  if (!uid) return res.json({ authenticated: false });
  const u = stmtGetUser.get(uid);
  if (!u) return res.json({ authenticated: false });
  res.json({ authenticated: true, user: { name: u.name, username: u.username, photo_url: u.photo_url } });
});

module.exports = { router, requireAuth, upsertUser };
