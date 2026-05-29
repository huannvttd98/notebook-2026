'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { uploadDir, createUpload } = require('../upload');

const router = express.Router();
const upload = createUpload('cover');

// Ảnh bìa lưu theo từng user (cột users.cover_image)
const getCover = db.prepare(`SELECT cover_image FROM users WHERE id = ?`);
const setCover = db.prepare(`UPDATE users SET cover_image = ? WHERE id = ?`);

// GET /api/cover — ảnh bìa của user hiện tại (null nếu chưa có)
router.get('/', (req, res) => {
  const row = getCover.get(req.userId);
  res.json({ url: row && row.cover_image ? row.cover_image : null });
});

// POST /api/cover — upload ảnh bìa mới (field 'image')
router.post('/', (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Ảnh quá lớn (tối đa 3MB)' : err.message;
      return res.status(400).json({ error: msg });
    }
    if (!req.file) return res.status(400).json({ error: 'Thiếu file ảnh' });

    const url = `/uploads/${req.file.filename}`;

    // Xóa ảnh bìa cũ của chính user này (nếu có)
    const old = getCover.get(req.userId);
    if (old && old.cover_image) {
      fs.promises.unlink(path.join(uploadDir, path.basename(old.cover_image))).catch(() => {});
    }

    setCover.run(url, req.userId);
    res.json({ url });
  });
});

module.exports = router;
