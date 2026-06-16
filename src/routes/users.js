'use strict';

const express = require('express');
const db = require('../db');
const { isAdminUsername } = require('../auth');

const router = express.Router();

const stmtAll = db.prepare(
  `SELECT id, username, status, display_name, avatar_url FROM users ORDER BY COALESCE(display_name, username)`
);

// GET /api/users — danh sách user để chia sẻ note nhanh (mọi người đăng nhập gọi được).
// Chỉ trả user ĐÃ ĐƯỢC DUYỆT (status='approved'); loại admin và chính mình.
router.get('/', (req, res) => {
  const users = stmtAll
    .all()
    .filter((u) => u.id !== req.userId && !isAdminUsername(u.username) && u.status === 'approved')
    .map((u) => ({
      id: u.id,
      username: u.username,
      displayName: u.display_name || u.username,
      avatarUrl: u.avatar_url || null,
    }));
  res.json({ users });
});

module.exports = router;
