'use strict';

const express = require('express');
const db = require('../db');
const { isAdminUsername } = require('../auth');

const router = express.Router();

const stmtAll = db.prepare(`SELECT id, username FROM users ORDER BY username`);

// GET /api/users — danh sách user cho mọi người đăng nhập (để chia sẻ note nhanh).
// Loại bỏ admin và chính người đang đăng nhập. Chỉ trả id + username (không lộ email).
router.get('/', (req, res) => {
  const users = stmtAll
    .all()
    .filter((u) => u.id !== req.userId && !isAdminUsername(u.username));
  res.json({ users });
});

module.exports = router;
