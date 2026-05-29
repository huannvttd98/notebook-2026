'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');

const router = express.Router();

// Chặn brute-force: tối đa 10 lần thử login / 15 phút / IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Quá nhiều lần thử. Vui lòng đợi 15 phút.' },
});

// Middleware bảo vệ các route cần đăng nhập
function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) {
    return next();
  }
  return res.status(401).json({ error: 'Chưa đăng nhập' });
}

// POST /api/login — nhận { password }, so với bcrypt hash trong env
router.post('/login', loginLimiter, (req, res) => {
  const { password } = req.body || {};
  const hash = process.env.APP_PASSWORD_HASH;

  if (!hash) {
    return res.status(500).json({ error: 'Server chưa cấu hình mật khẩu (APP_PASSWORD_HASH)' });
  }
  if (typeof password !== 'string' || password.length === 0) {
    return res.status(400).json({ error: 'Thiếu mật khẩu' });
  }

  const ok = bcrypt.compareSync(password, hash);
  if (!ok) {
    return res.status(401).json({ error: 'Sai mật khẩu' });
  }

  // Đăng nhập thành công — tái tạo session để tránh fixation
  req.session.regenerate((err) => {
    if (err) {
      return res.status(500).json({ error: 'Lỗi tạo phiên đăng nhập' });
    }
    req.session.authenticated = true;
    res.json({ ok: true });
  });
});

// POST /api/logout — hủy session
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

// GET /api/me — kiểm tra trạng thái đăng nhập (cho frontend)
router.get('/me', (req, res) => {
  res.json({ authenticated: !!(req.session && req.session.authenticated) });
});

module.exports = { router, requireAuth };
