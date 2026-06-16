'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { uploadDir, createUpload, MAX_FILE_MB } = require('../upload');

const router = express.Router();
const imgUpload = createUpload('note');

const PAGE_SIZE = 10;

// Prepared statements (tái sử dụng, chống SQL injection).
// Mọi câu lệnh đều gắn user_id để mỗi user chỉ thao tác trên ghi chú của mình.
const stmtInsert = db.prepare(
  `INSERT INTO entries (title, content, mood, rating, music, user_id) VALUES (?, ?, ?, ?, ?, ?)`
);
const stmtInsertDated = db.prepare(
  `INSERT INTO entries (title, content, mood, rating, music, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
);
const stmtGetOne = db.prepare(`SELECT * FROM entries WHERE id = ? AND user_id = ?`);
const stmtUpdate = db.prepare(
  `UPDATE entries SET title = ?, content = ?, mood = ?, rating = ?, music = ?, updated_at = datetime('now','localtime') WHERE id = ? AND user_id = ?`
);
const stmtUpdateDated = db.prepare(
  `UPDATE entries SET title = ?, content = ?, mood = ?, rating = ?, music = ?, created_at = ?, updated_at = datetime('now','localtime') WHERE id = ? AND user_id = ?`
);
const stmtUpdateImages = db.prepare(`UPDATE entries SET images = ? WHERE id = ? AND user_id = ?`);
const stmtDelete = db.prepare(`DELETE FROM entries WHERE id = ? AND user_id = ?`);

// Validate + chuẩn hóa input từ body
function parseBody(body) {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const content = typeof body.content === 'string' ? body.content.trim() : '';
  const mood = typeof body.mood === 'string' ? body.mood.trim() : '';
  let rating = Number.parseInt(body.rating, 10);
  if (Number.isNaN(rating) || rating < 0) rating = 0;
  if (rating > 5) rating = 5;
  // Ngày dạng YYYY-MM-DD (tùy chọn) -> dùng làm ngày của ghi chú trên lịch
  const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : null;
  // Link nhạc (YouTube/Spotify) — chỉ nhận http(s), giới hạn độ dài
  let music = typeof body.music === 'string' ? body.music.trim().slice(0, 500) : '';
  if (music && !/^https?:\/\//i.test(music)) music = '';
  return { title, content, mood, rating, date, music };
}

// Đọc mảng images (JSON) an toàn
function parseImages(entry) {
  try {
    const arr = JSON.parse(entry.images || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

// GET /api/entries?search=&page=&limit= — danh sách (chỉ ghi chú của user hiện tại)
router.get('/', (req, res) => {
  const uid = req.userId;
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const limit = Math.min(200, Math.max(1, Number.parseInt(req.query.limit, 10) || PAGE_SIZE));
  const offset = (page - 1) * limit;

  let rows;
  let total;
  if (search) {
    const like = `%${search}%`;
    total = db
      .prepare(`SELECT COUNT(*) AS n FROM entries WHERE user_id = ? AND (title LIKE ? OR content LIKE ?)`)
      .get(uid, like, like).n;
    rows = db
      .prepare(
        `SELECT * FROM entries WHERE user_id = ? AND (title LIKE ? OR content LIKE ?)
         ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`
      )
      .all(uid, like, like, limit, offset);
  } else {
    total = db.prepare(`SELECT COUNT(*) AS n FROM entries WHERE user_id = ?`).get(uid).n;
    rows = db
      .prepare(
        `SELECT * FROM entries WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`
      )
      .all(uid, limit, offset);
  }

  res.json({
    entries: rows,
    page,
    pageSize: limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
});

// GET /api/entries/:id — chi tiết 1 entry
router.get('/:id', (req, res) => {
  const entry = stmtGetOne.get(req.params.id, req.userId);
  if (!entry) return res.status(404).json({ error: 'Không tìm thấy' });
  res.json(entry);
});

// POST /api/entries — tạo mới
router.post('/', (req, res) => {
  const { title, content, mood, rating, date, music } = parseBody(req.body || {});
  if (!content) return res.status(400).json({ error: 'Nội dung không được để trống' });

  let info;
  if (date) {
    info = stmtInsertDated.run(title || null, content, mood || null, rating, music, req.userId, `${date} 12:00:00`);
  } else {
    info = stmtInsert.run(title || null, content, mood || null, rating, music, req.userId);
  }
  res.status(201).json(stmtGetOne.get(info.lastInsertRowid, req.userId));
});

// PUT /api/entries/:id — cập nhật
router.put('/:id', (req, res) => {
  const existing = stmtGetOne.get(req.params.id, req.userId);
  if (!existing) return res.status(404).json({ error: 'Không tìm thấy' });

  const { title, content, mood, rating, date, music } = parseBody(req.body || {});
  if (!content) return res.status(400).json({ error: 'Nội dung không được để trống' });

  if (date) {
    stmtUpdateDated.run(title || null, content, mood || null, rating, music, `${date} 12:00:00`, req.params.id, req.userId);
  } else {
    stmtUpdate.run(title || null, content, mood || null, rating, music, req.params.id, req.userId);
  }
  res.json(stmtGetOne.get(req.params.id, req.userId));
});

// POST /api/entries/:id/images — đính kèm 1 ảnh vào ghi chú
router.post('/:id/images', (req, res) => {
  const entry = stmtGetOne.get(req.params.id, req.userId);
  if (!entry) return res.status(404).json({ error: 'Không tìm thấy ghi chú' });

  imgUpload.single('image')(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? `Ảnh quá lớn (tối đa ${MAX_FILE_MB}MB)` : err.message;
      return res.status(400).json({ error: msg });
    }
    if (!req.file) return res.status(400).json({ error: 'Thiếu file ảnh' });

    const images = parseImages(entry);
    images.push(`/uploads/${req.file.filename}`);
    stmtUpdateImages.run(JSON.stringify(images), req.params.id, req.userId);
    res.json({ images });
  });
});

// DELETE /api/entries/:id/images — gỡ 1 ảnh khỏi ghi chú (body: { url })
router.delete('/:id/images', (req, res) => {
  const entry = stmtGetOne.get(req.params.id, req.userId);
  if (!entry) return res.status(404).json({ error: 'Không tìm thấy ghi chú' });

  const url = (req.body || {}).url;
  let images = parseImages(entry);
  if (images.includes(url)) {
    images = images.filter((u) => u !== url);
    stmtUpdateImages.run(JSON.stringify(images), req.params.id, req.userId);
    fs.promises.unlink(path.join(uploadDir, path.basename(url))).catch(() => {});
  }
  res.json({ images });
});

// DELETE /api/entries/:id — xóa ghi chú (kèm xóa file ảnh của nó)
router.delete('/:id', (req, res) => {
  const entry = stmtGetOne.get(req.params.id, req.userId);
  if (!entry) return res.status(404).json({ error: 'Không tìm thấy' });

  for (const url of parseImages(entry)) {
    fs.promises.unlink(path.join(uploadDir, path.basename(url))).catch(() => {});
  }
  stmtDelete.run(req.params.id, req.userId);
  res.json({ ok: true });
});

module.exports = router;
