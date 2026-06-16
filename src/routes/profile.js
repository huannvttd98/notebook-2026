'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { uploadDir, createUpload, MAX_FILE_MB } = require('../upload');

const router = express.Router();
const avatarUpload = createUpload('avatar');

const stmtGet = db.prepare(
  `SELECT id, username, email, display_name, avatar_url FROM users WHERE id = ?`
);
const stmtUpdateName = db.prepare(`UPDATE users SET display_name = ? WHERE id = ?`);
const stmtUpdateAvatar = db.prepare(`UPDATE users SET avatar_url = ? WHERE id = ?`);

// GET /api/profile — thông tin hồ sơ của chính mình
router.get('/', (req, res) => {
  res.json(stmtGet.get(req.userId));
});

// PUT /api/profile — cập nhật tên hiển thị (body: { display_name })
router.put('/', (req, res) => {
  const raw = typeof (req.body || {}).display_name === 'string' ? req.body.display_name.trim() : '';
  const name = raw.slice(0, 50);
  stmtUpdateName.run(name || null, req.userId);
  res.json(stmtGet.get(req.userId));
});

// POST /api/profile/avatar — tải ảnh đại diện (field 'avatar')
router.post('/avatar', (req, res) => {
  avatarUpload.single('avatar')(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? `Ảnh quá lớn (tối đa ${MAX_FILE_MB}MB)` : err.message;
      return res.status(400).json({ error: msg });
    }
    if (!req.file) return res.status(400).json({ error: 'Thiếu file ảnh' });

    const url = `/uploads/${req.file.filename}`;
    // Xóa ảnh cũ để khỏi phình ổ đĩa
    const old = stmtGet.get(req.userId);
    if (old && old.avatar_url) {
      fs.promises.unlink(path.join(uploadDir, path.basename(old.avatar_url))).catch(() => {});
    }
    stmtUpdateAvatar.run(url, req.userId);
    res.json({ avatar_url: url });
  });
});

// DELETE /api/profile/avatar — gỡ ảnh đại diện
router.delete('/avatar', (req, res) => {
  const old = stmtGet.get(req.userId);
  if (old && old.avatar_url) {
    fs.promises.unlink(path.join(uploadDir, path.basename(old.avatar_url))).catch(() => {});
  }
  stmtUpdateAvatar.run(null, req.userId);
  res.json({ avatar_url: null });
});

module.exports = router;
