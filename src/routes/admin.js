'use strict';

const express = require('express');
const db = require('../db');

const router = express.Router();

// Danh sách user kèm số ghi chú của mỗi người (mới nhất lên đầu)
const stmtListUsers = db.prepare(`
  SELECT
    u.id,
    u.username,
    u.email,
    u.status,
    u.created_at,
    u.last_login_at,
    (SELECT COUNT(*) FROM entries e WHERE e.user_id = u.id) AS note_count
  FROM users u
  ORDER BY u.id ASC
`);

// GET /api/admin/users — chỉ admin (đã bọc requireAuth + requireAdmin ở server.js)
router.get('/users', (req, res) => {
  const users = stmtListUsers.all();
  res.json({ users, total: users.length });
});

// POST /api/admin/users/:id/status — duyệt / hủy duyệt 1 user (body: { status })
const stmtSetStatus = db.prepare(`UPDATE users SET status = ? WHERE id = ?`);
router.post('/users/:id/status', (req, res) => {
  const status = (req.body || {}).status;
  if (status !== 'approved' && status !== 'pending') {
    return res.status(400).json({ error: 'Trạng thái không hợp lệ' });
  }
  const info = stmtSetStatus.run(status, req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Không tìm thấy user' });
  res.json({ ok: true, id: Number(req.params.id), status });
});

// Toàn bộ note của mọi user (kèm tên chủ và số người được chia sẻ)
const NOTES_CAP = 1000;
const stmtAllNotes = db.prepare(`
  SELECT
    e.id, e.title, e.content, e.created_at, e.updated_at, e.rating, e.music,
    e.user_id,
    o.username AS owner_username,
    (SELECT COUNT(*) FROM note_shares s WHERE s.note_id = e.id) AS share_count
  FROM entries e
  LEFT JOIN users o ON o.id = e.user_id
  ORDER BY e.created_at DESC, e.id DESC
  LIMIT ?
`);
const stmtSearchNotes = db.prepare(`
  SELECT
    e.id, e.title, e.content, e.created_at, e.updated_at, e.rating, e.music,
    e.user_id,
    o.username AS owner_username,
    (SELECT COUNT(*) FROM note_shares s WHERE s.note_id = e.id) AS share_count
  FROM entries e
  LEFT JOIN users o ON o.id = e.user_id
  WHERE e.title LIKE @like OR e.content LIKE @like OR o.username LIKE @like
  ORDER BY e.created_at DESC, e.id DESC
  LIMIT @cap
`);

// GET /api/admin/notes?search= — toàn bộ note của mọi user (chỉ admin)
router.get('/notes', (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const notes = search
    ? stmtSearchNotes.all({ like: `%${search}%`, cap: NOTES_CAP })
    : stmtAllNotes.all(NOTES_CAP);
  res.json({ notes, total: notes.length, capped: notes.length >= NOTES_CAP });
});

module.exports = router;
