'use strict';

const express = require('express');
const db = require('../db');

const router = express.Router();

const PAGE_SIZE = 10;

// Prepared statements (tái sử dụng, chống SQL injection)
const stmtInsert = db.prepare(
  `INSERT INTO entries (title, content, mood, rating) VALUES (?, ?, ?, ?)`
);
const stmtGetOne = db.prepare(`SELECT * FROM entries WHERE id = ?`);
const stmtUpdate = db.prepare(
  `UPDATE entries SET title = ?, content = ?, mood = ?, rating = ?, updated_at = datetime('now','localtime') WHERE id = ?`
);
const stmtDelete = db.prepare(`DELETE FROM entries WHERE id = ?`);

// Validate + chuẩn hóa input từ body
function parseBody(body) {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const content = typeof body.content === 'string' ? body.content.trim() : '';
  const mood = typeof body.mood === 'string' ? body.mood.trim() : '';
  let rating = Number.parseInt(body.rating, 10);
  if (Number.isNaN(rating) || rating < 0) rating = 0;
  if (rating > 5) rating = 5;
  return { title, content, mood, rating };
}

// GET /api/entries?search=&page= — danh sách, mới nhất trước, phân trang
router.get('/', (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  // limit tùy chọn: dùng cho sidebar kiểu Notion (liệt kê nhiều ghi chú)
  const limit = Math.min(200, Math.max(1, Number.parseInt(req.query.limit, 10) || PAGE_SIZE));
  const offset = (page - 1) * limit;

  let rows;
  let total;
  if (search) {
    const like = `%${search}%`;
    total = db
      .prepare(`SELECT COUNT(*) AS n FROM entries WHERE title LIKE ? OR content LIKE ?`)
      .get(like, like).n;
    rows = db
      .prepare(
        `SELECT * FROM entries WHERE title LIKE ? OR content LIKE ?
         ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`
      )
      .all(like, like, limit, offset);
  } else {
    total = db.prepare(`SELECT COUNT(*) AS n FROM entries`).get().n;
    rows = db
      .prepare(
        `SELECT * FROM entries ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`
      )
      .all(limit, offset);
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
  const entry = stmtGetOne.get(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Không tìm thấy' });
  res.json(entry);
});

// POST /api/entries — tạo mới
router.post('/', (req, res) => {
  const { title, content, mood, rating } = parseBody(req.body || {});
  if (!content) return res.status(400).json({ error: 'Nội dung không được để trống' });

  const info = stmtInsert.run(title || null, content, mood || null, rating);
  const entry = stmtGetOne.get(info.lastInsertRowid);
  res.status(201).json(entry);
});

// PUT /api/entries/:id — cập nhật
router.put('/:id', (req, res) => {
  const existing = stmtGetOne.get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Không tìm thấy' });

  const { title, content, mood, rating } = parseBody(req.body || {});
  if (!content) return res.status(400).json({ error: 'Nội dung không được để trống' });

  stmtUpdate.run(title || null, content, mood || null, rating, req.params.id);
  res.json(stmtGetOne.get(req.params.id));
});

// DELETE /api/entries/:id — xóa
router.delete('/:id', (req, res) => {
  const info = stmtDelete.run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Không tìm thấy' });
  res.json({ ok: true });
});

module.exports = router;
