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
// Chủ sở hữu note (dùng cho xóa & quản lý chia sẻ)
const stmtGetOwned = db.prepare(`SELECT * FROM entries WHERE id = ? AND user_id = ?`);
// Note mà user được phép xem/sửa: là chủ HOẶC được chia sẻ
const stmtGetAccessible = db.prepare(
  `SELECT * FROM entries e
   WHERE e.id = ?
     AND (e.user_id = ? OR EXISTS (SELECT 1 FROM note_shares s WHERE s.note_id = e.id AND s.user_id = ?))`
);
// Cập nhật/đổi ảnh: gọi SAU khi đã kiểm tra quyền truy cập (nên không lọc user_id ở đây)
const stmtUpdate = db.prepare(
  `UPDATE entries SET title = ?, content = ?, mood = ?, rating = ?, music = ?, updated_at = datetime('now','localtime') WHERE id = ?`
);
const stmtUpdateDated = db.prepare(
  `UPDATE entries SET title = ?, content = ?, mood = ?, rating = ?, music = ?, created_at = ?, updated_at = datetime('now','localtime') WHERE id = ?`
);
const stmtUpdateImages = db.prepare(`UPDATE entries SET images = ? WHERE id = ?`);
// Xóa: chỉ chủ note
const stmtDelete = db.prepare(`DELETE FROM entries WHERE id = ? AND user_id = ?`);

// ===== Chia sẻ note =====
const stmtFindUser = db.prepare(
  `SELECT id, username, email FROM users WHERE username = ? OR email = ?`
);
const stmtListShares = db.prepare(
  `SELECT u.id, u.username, u.email
   FROM note_shares s JOIN users u ON u.id = s.user_id
   WHERE s.note_id = ? ORDER BY u.username`
);
const stmtAddShare = db.prepare(
  `INSERT OR IGNORE INTO note_shares (note_id, user_id) VALUES (?, ?)`
);
const stmtRemoveShare = db.prepare(`DELETE FROM note_shares WHERE note_id = ? AND user_id = ?`);

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

// Gắn thêm cờ is_owner (1/0) vào entry trả về cho frontend
function withOwner(entry, uid) {
  if (!entry) return entry;
  return { ...entry, is_owner: entry.user_id === uid ? 1 : 0 };
}

// GET /api/entries?search=&page=&limit= — danh sách: ghi chú của mình + được chia sẻ
router.get('/', (req, res) => {
  const uid = req.userId;
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const limit = Math.min(200, Math.max(1, Number.parseInt(req.query.limit, 10) || PAGE_SIZE));
  const offset = (page - 1) * limit;

  // Điều kiện truy cập: là chủ HOẶC được chia sẻ
  const access = `(e.user_id = @uid OR EXISTS (SELECT 1 FROM note_shares s WHERE s.note_id = e.id AND s.user_id = @uid))`;
  const searchClause = search ? `AND (e.title LIKE @like OR e.content LIKE @like)` : '';
  const like = `%${search}%`;
  const countParams = search ? { uid, like } : { uid };
  const listParams = search ? { uid, like, limit, offset } : { uid, limit, offset };

  const total = db
    .prepare(`SELECT COUNT(*) AS n FROM entries e WHERE ${access} ${searchClause}`)
    .get(countParams).n;
  const rows = db
    .prepare(
      `SELECT e.*,
        CASE WHEN e.user_id = @uid THEN 1 ELSE 0 END AS is_owner,
        o.username AS owner_username
       FROM entries e
       LEFT JOIN users o ON o.id = e.user_id
       WHERE ${access} ${searchClause}
       ORDER BY e.created_at DESC, e.id DESC
       LIMIT @limit OFFSET @offset`
    )
    .all(listParams);

  res.json({
    entries: rows,
    page,
    pageSize: limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
});

// GET /api/entries/:id — chi tiết 1 entry (chủ hoặc được chia sẻ)
router.get('/:id', (req, res) => {
  const entry = stmtGetAccessible.get(req.params.id, req.userId, req.userId);
  if (!entry) return res.status(404).json({ error: 'Không tìm thấy' });
  res.json(withOwner(entry, req.userId));
});

// POST /api/entries — tạo mới (người tạo là chủ)
router.post('/', (req, res) => {
  const { title, content, mood, rating, date, music } = parseBody(req.body || {});
  if (!content) return res.status(400).json({ error: 'Nội dung không được để trống' });

  let info;
  if (date) {
    info = stmtInsertDated.run(title || null, content, mood || null, rating, music, req.userId, `${date} 12:00:00`);
  } else {
    info = stmtInsert.run(title || null, content, mood || null, rating, music, req.userId);
  }
  res.status(201).json(withOwner(stmtGetOwned.get(info.lastInsertRowid, req.userId), req.userId));
});

// PUT /api/entries/:id — cập nhật (chủ hoặc người được chia sẻ đều sửa được)
router.put('/:id', (req, res) => {
  const existing = stmtGetAccessible.get(req.params.id, req.userId, req.userId);
  if (!existing) return res.status(404).json({ error: 'Không tìm thấy' });

  const { title, content, mood, rating, date, music } = parseBody(req.body || {});
  if (!content) return res.status(400).json({ error: 'Nội dung không được để trống' });

  if (date) {
    stmtUpdateDated.run(title || null, content, mood || null, rating, music, `${date} 12:00:00`, req.params.id);
  } else {
    stmtUpdate.run(title || null, content, mood || null, rating, music, req.params.id);
  }
  res.json(withOwner(stmtGetAccessible.get(req.params.id, req.userId, req.userId), req.userId));
});

// POST /api/entries/:id/images — đính kèm 1 ảnh (chủ hoặc người được chia sẻ)
router.post('/:id/images', (req, res) => {
  const entry = stmtGetAccessible.get(req.params.id, req.userId, req.userId);
  if (!entry) return res.status(404).json({ error: 'Không tìm thấy ghi chú' });

  imgUpload.single('image')(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? `Ảnh quá lớn (tối đa ${MAX_FILE_MB}MB)` : err.message;
      return res.status(400).json({ error: msg });
    }
    if (!req.file) return res.status(400).json({ error: 'Thiếu file ảnh' });

    const images = parseImages(entry);
    images.push(`/uploads/${req.file.filename}`);
    stmtUpdateImages.run(JSON.stringify(images), req.params.id);
    res.json({ images });
  });
});

// DELETE /api/entries/:id/images — gỡ 1 ảnh (chủ hoặc người được chia sẻ)
router.delete('/:id/images', (req, res) => {
  const entry = stmtGetAccessible.get(req.params.id, req.userId, req.userId);
  if (!entry) return res.status(404).json({ error: 'Không tìm thấy ghi chú' });

  const url = (req.body || {}).url;
  let images = parseImages(entry);
  if (images.includes(url)) {
    images = images.filter((u) => u !== url);
    stmtUpdateImages.run(JSON.stringify(images), req.params.id);
    fs.promises.unlink(path.join(uploadDir, path.basename(url))).catch(() => {});
  }
  res.json({ images });
});

// ===== Quản lý chia sẻ — chỉ CHỦ note =====

// GET /api/entries/:id/shares — danh sách user đang được chia sẻ
router.get('/:id/shares', (req, res) => {
  const owned = stmtGetOwned.get(req.params.id, req.userId);
  if (!owned) return res.status(403).json({ error: 'Chỉ chủ ghi chú mới xem được chia sẻ' });
  res.json({ users: stmtListShares.all(req.params.id) });
});

// POST /api/entries/:id/shares — chia sẻ cho 1 user (body: { user: username|email })
router.post('/:id/shares', (req, res) => {
  const owned = stmtGetOwned.get(req.params.id, req.userId);
  if (!owned) return res.status(403).json({ error: 'Chỉ chủ ghi chú mới được chia sẻ' });

  const ident = typeof (req.body || {}).user === 'string' ? req.body.user.trim().toLowerCase() : '';
  if (!ident) return res.status(400).json({ error: 'Thiếu tài khoản hoặc email' });

  const target = stmtFindUser.get(ident, ident);
  if (!target) return res.status(404).json({ error: 'Không tìm thấy người dùng' });
  if (target.id === req.userId) {
    return res.status(400).json({ error: 'Không thể tự chia sẻ cho chính mình' });
  }

  stmtAddShare.run(req.params.id, target.id);
  res.status(201).json({ users: stmtListShares.all(req.params.id) });
});

// DELETE /api/entries/:id/shares — gỡ chia sẻ 1 user (body: { userId })
router.delete('/:id/shares', (req, res) => {
  const owned = stmtGetOwned.get(req.params.id, req.userId);
  if (!owned) return res.status(403).json({ error: 'Chỉ chủ ghi chú mới được gỡ chia sẻ' });

  const userId = Number.parseInt((req.body || {}).userId, 10);
  if (!userId) return res.status(400).json({ error: 'Thiếu userId' });

  stmtRemoveShare.run(req.params.id, userId);
  res.json({ users: stmtListShares.all(req.params.id) });
});

// DELETE /api/entries/:id — xóa ghi chú (chỉ chủ; kèm xóa file ảnh của nó)
router.delete('/:id', (req, res) => {
  const entry = stmtGetOwned.get(req.params.id, req.userId);
  if (!entry) return res.status(404).json({ error: 'Không tìm thấy' });

  for (const url of parseImages(entry)) {
    fs.promises.unlink(path.join(uploadDir, path.basename(url))).catch(() => {});
  }
  stmtDelete.run(req.params.id, req.userId);
  res.json({ ok: true });
});

module.exports = router;
