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
    u.created_at,
    (SELECT COUNT(*) FROM entries e WHERE e.user_id = u.id) AS note_count
  FROM users u
  ORDER BY u.id ASC
`);

// GET /api/admin/users — chỉ admin (đã bọc requireAuth + requireAdmin ở server.js)
router.get('/users', (req, res) => {
  const users = stmtListUsers.all();
  res.json({ users, total: users.length });
});

module.exports = router;
