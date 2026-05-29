'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../db');

const router = express.Router();

// Thư mục lưu ảnh upload
const uploadDir = path.join(__dirname, '..', '..', 'public', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// Helpers đọc/ghi settings
const getSetting = db.prepare(`SELECT value FROM settings WHERE key = ?`);
const setSetting = db.prepare(
  `INSERT INTO settings (key, value) VALUES (?, ?)
   ON CONFLICT(key) DO UPDATE SET value = excluded.value`
);

// Cấu hình multer: lưu vào public/uploads với tên duy nhất, giới hạn 3MB, chỉ nhận ảnh
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
    cb(null, `cover_${Date.now()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB — an toàn cho server nhỏ
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error('Chỉ chấp nhận file ảnh'));
  },
});

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
