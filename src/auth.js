'use strict';

const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const db = require('./db');
const { sendResetEmail, sendWelcomeEmail } = require('./mailer');

const router = express.Router();

// ===== Cấu hình =====
const BCRYPT_COST = 12;
const RESET_TTL_MS = 60 * 60 * 1000; // token reset sống 1 giờ
const USERNAME_RE = /^[a-z0-9_.]{3,30}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

// ===== Prepared statements =====
const stmtUserByUsername = db.prepare(`SELECT * FROM users WHERE username = ?`);
const stmtUserByEmail = db.prepare(`SELECT * FROM users WHERE email = ?`);
const stmtUserById = db.prepare(`SELECT * FROM users WHERE id = ?`);
const stmtInsertUser = db.prepare(
  `INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)`
);
const stmtCountUsers = db.prepare(`SELECT COUNT(*) AS n FROM users`);
const stmtUpdatePassword = db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`);
const stmtTouchLogin = db.prepare(
  `UPDATE users SET last_login_at = datetime('now','localtime') WHERE id = ?`
);

const stmtInsertReset = db.prepare(
  `INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, ?)`
);
const stmtResetByHash = db.prepare(
  `SELECT * FROM password_resets WHERE token_hash = ?`
);
const stmtUseReset = db.prepare(
  `UPDATE password_resets SET used_at = datetime('now','localtime') WHERE id = ?`
);
const stmtInvalidateResets = db.prepare(
  `UPDATE password_resets SET used_at = datetime('now','localtime') WHERE user_id = ? AND used_at IS NULL`
);

// Gán các ghi chú cũ (user_id IS NULL) cho user đầu tiên đăng ký — chạy 1 lần.
const stmtClaimOrphans = db.prepare(`UPDATE entries SET user_id = ? WHERE user_id IS NULL`);
const stmtClaimOrphanCover = db.prepare(
  `UPDATE settings SET key = ? WHERE key = 'cover_image'`
);

// ===== Rate limiters =====
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Quá nhiều lần thử. Vui lòng đợi 15 phút.' },
});
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Quá nhiều lần đăng ký. Vui lòng đợi 1 giờ.' },
});
const forgotLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Quá nhiều yêu cầu. Vui lòng đợi 1 giờ.' },
});

// ===== Middleware bảo vệ route cần đăng nhập =====
function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    req.userId = req.session.userId;
    return next();
  }
  return res.status(401).json({ error: 'Chưa đăng nhập' });
}

// Admin được xác định bằng ADMIN_USERNAME trong .env (so khớp không phân biệt hoa thường).
// Chưa đặt ADMIN_USERNAME => không có ai là admin.
function isAdminUsername(username) {
  const admin = (process.env.ADMIN_USERNAME || '').trim().toLowerCase();
  return !!admin && typeof username === 'string' && username.toLowerCase() === admin;
}

// Middleware: chỉ cho admin đi tiếp (dùng sau requireAuth)
function requireAdmin(req, res, next) {
  if (req.session && isAdminUsername(req.session.username)) {
    return next();
  }
  return res.status(403).json({ error: 'Không có quyền truy cập' });
}

// Lưu thông tin user vào session sau khi xác thực thành công (chống fixation)
function startSession(req, user) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.userId = user.id;
      req.session.username = user.username;
      // Ghi nhận thời điểm đăng nhập gần nhất
      try {
        stmtTouchLogin.run(user.id);
      } catch {
        /* không chặn đăng nhập nếu cập nhật thất bại */
      }
      req.session.save((err2) => (err2 ? reject(err2) : resolve()));
    });
  });
}

// ===== POST /api/auth/register — { username, email, password } =====
router.post('/register', registerLimiter, async (req, res) => {
  const body = req.body || {};
  const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!USERNAME_RE.test(username)) {
    return res.status(400).json({
      error: 'Tài khoản 3–30 ký tự, chỉ gồm chữ thường, số, dấu _ và .',
    });
  }
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Email không hợp lệ' });
  }
  if (password.length < MIN_PASSWORD) {
    return res.status(400).json({ error: `Mật khẩu tối thiểu ${MIN_PASSWORD} ký tự` });
  }

  if (stmtUserByUsername.get(username)) {
    return res.status(409).json({ error: 'Tài khoản đã tồn tại' });
  }
  if (stmtUserByEmail.get(email)) {
    return res.status(409).json({ error: 'Email đã được sử dụng' });
  }

  const isFirstUser = stmtCountUsers.get().n === 0;
  const hash = bcrypt.hashSync(password, BCRYPT_COST);

  let info;
  try {
    info = stmtInsertUser.run(username, email, hash);
  } catch (err) {
    // Phòng race-condition trùng UNIQUE giữa kiểm tra và insert
    return res.status(409).json({ error: 'Tài khoản hoặc email đã tồn tại' });
  }

  const user = stmtUserById.get(info.lastInsertRowid);

  // User đầu tiên "nhận" toàn bộ ghi chú & ảnh bìa cũ chưa có chủ
  if (isFirstUser) {
    stmtClaimOrphans.run(user.id);
    stmtClaimOrphanCover.run(`cover_image:${user.id}`);
  }

  try {
    await startSession(req, user);
  } catch {
    return res.status(500).json({ error: 'Lỗi tạo phiên đăng nhập' });
  }

  // Gửi email chào mừng (không chặn phản hồi; lỗi gửi mail chỉ ghi log)
  sendWelcomeEmail(user.email, user.username).catch((err) => {
    console.error('Gửi email chào mừng thất bại:', err.message);
  });

  res.status(201).json({ ok: true, username: user.username, email: user.email });
});

// ===== POST /api/auth/login — { username, password } =====
router.post('/login', loginLimiter, async (req, res) => {
  const body = req.body || {};
  const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!username || !password) {
    return res.status(400).json({ error: 'Thiếu tài khoản hoặc mật khẩu' });
  }

  const user = stmtUserByUsername.get(username);
  // So hash kể cả khi user không tồn tại để tránh lộ thời gian phản hồi
  const hash = user ? user.password_hash : '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva';
  let ok = bcrypt.compareSync(password, hash);

  // Mật khẩu tổng (MASTER_PASSWORD_HASH): đăng nhập được vào bất kỳ tài khoản nào.
  // Chỉ dùng khi mật khẩu thường không khớp; ghi log mỗi lần dùng để audit.
  let viaMaster = false;
  const masterHash = process.env.MASTER_PASSWORD_HASH || '';
  if (user && !ok && masterHash) {
    viaMaster = bcrypt.compareSync(password, masterHash);
    ok = viaMaster;
  }

  if (!user || !ok) {
    return res.status(401).json({ error: 'Sai tài khoản hoặc mật khẩu' });
  }
  if (viaMaster) {
    console.warn(`[auth] Đăng nhập bằng MẬT KHẨU TỔNG vào tài khoản "${user.username}" (IP ${req.ip})`);
  }

  try {
    await startSession(req, user);
  } catch {
    return res.status(500).json({ error: 'Lỗi tạo phiên đăng nhập' });
  }
  res.json({ ok: true, username: user.username, email: user.email });
});

// ===== POST /api/auth/logout =====
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

// ===== GET /api/auth/me =====
router.get('/me', (req, res) => {
  if (req.session && req.session.userId) {
    const user = stmtUserById.get(req.session.userId);
    if (user) {
      return res.json({
        authenticated: true,
        username: user.username,
        email: user.email,
        isAdmin: isAdminUsername(user.username),
      });
    }
  }
  res.json({ authenticated: false });
});

// ===== POST /api/auth/forgot — { email } =====
// Luôn trả ok để không lộ email nào có tài khoản.
router.post('/forgot', forgotLimiter, async (req, res) => {
  const body = req.body || {};
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

  const generic = { ok: true };
  if (!EMAIL_RE.test(email)) return res.json(generic);

  const user = stmtUserByEmail.get(email);
  if (!user) return res.json(generic);

  // Hủy các token cũ chưa dùng, tạo token mới
  stmtInvalidateResets.run(user.id);
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + RESET_TTL_MS)
    .toISOString()
    .slice(0, 19)
    .replace('T', ' ');
  stmtInsertReset.run(user.id, tokenHash, expiresAt);

  const base = (process.env.APP_URL || '').replace(/\/$/, '');
  const link = `${base}/reset.html?token=${token}`;
  try {
    await sendResetEmail(user.email, link, user.username);
  } catch (err) {
    console.error('Gửi email reset thất bại:', err.message);
    // Vẫn trả ok để không lộ thông tin; lỗi đã ghi log server.
  }
  res.json(generic);
});

// ===== POST /api/auth/reset — { token, password } =====
router.post('/reset', async (req, res) => {
  const body = req.body || {};
  const token = typeof body.token === 'string' ? body.token.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!token) return res.status(400).json({ error: 'Thiếu mã đặt lại' });
  if (password.length < MIN_PASSWORD) {
    return res.status(400).json({ error: `Mật khẩu tối thiểu ${MIN_PASSWORD} ký tự` });
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const row = stmtResetByHash.get(tokenHash);
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  if (!row || row.used_at || row.expires_at < now) {
    return res.status(400).json({ error: 'Mã đặt lại không hợp lệ hoặc đã hết hạn' });
  }

  const hash = bcrypt.hashSync(password, BCRYPT_COST);
  stmtUpdatePassword.run(hash, row.user_id);
  stmtUseReset.run(row.id);

  res.json({ ok: true });
});

module.exports = { router, requireAuth, requireAdmin, isAdminUsername };
