'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { uploadDir, createUpload } = require('../upload');

const router = express.Router();
const upload = createUpload('cover');

// Helpers đọc/ghi settings
const getSetting = db.prepare(`SELECT value FROM settings WHERE key = ?`);
const setSetting = db.prepare(
  `INSERT INTO settings (key, value) VALUES (?, ?)
   ON CONFLICT(key) DO UPDATE SET value = excluded.value`
);

// GET /api/cover — trả URL ảnh hiện tại (null nếu chưa có)
router.get('/', (req, res) => {
  const row = getSetting.get('cover_image');
  res.json({ url: row ? row.value : null });
});

// POST /api/cover — upload ảnh mới (field 'image')
router.post('/', (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Ảnh quá lớn (tối đa 3MB)' : err.message;
      return res.status(400).json({ error: msg });
    }
    if (!req.file) return res.status(400).json({ error: 'Thiếu file ảnh' });

    const url = `/uploads/${req.file.filename}`;

    // Xóa ảnh cũ (nếu có) để không phình ổ đĩa
    const old = getSetting.get('cover_image');
    if (old && old.value) {
      const oldPath = path.join(uploadDir, path.basename(old.value));
      fs.promises.unlink(oldPath).catch(() => {});
    }

    setSetting.run('cover_image', url);
    res.json({ url });
  });
});

module.exports = router;
