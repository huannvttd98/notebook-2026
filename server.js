'use strict';

require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const session = require('express-session');
const SqliteStore = require('better-sqlite3-session-store')(session);

const db = require('./src/db');
const { router: authRouter, requireAuth, requireAdmin } = require('./src/auth');
const adminRouter = require('./src/routes/admin');
const usersRouter = require('./src/routes/users');
const entriesRouter = require('./src/routes/entries');
const weatherRouter = require('./src/routes/weather');
const coverRouter = require('./src/routes/cover');
const { MAX_FILE_MB } = require('./src/upload');

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3100;
const isProd = process.env.NODE_ENV === 'production';

// Sau Nginx reverse proxy
app.set('trust proxy', 1);

// Nới CSP để cho phép nhúng player nhạc (mặc định helmet chặn iframe ngoài origin)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        'frame-src': [
          "'self'",
          'https://www.youtube.com',
          'https://www.youtube-nocookie.com',
          'https://open.spotify.com',
        ],
      },
    },
    // Mặc định helmet đặt 'no-referrer' khiến YouTube báo lỗi 153 (không xác
    // thực được origin nhúng). Gửi origin khi sang domain khác để player chạy.
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  })
);
app.use(compression());

const publicDir = path.join(__dirname, 'public');

// Version cache:
// - Production: dùng ASSET_VERSION trong .env (kiểm soát thủ công khi deploy)
// - Local/dev: dùng thời gian sửa file CSS/JS để LUÔN tải bản mới (khỏi cache)
function assetVersion() {
  if (isProd && process.env.ASSET_VERSION) return process.env.ASSET_VERSION;
  try {
    const css = fs.statSync(path.join(publicDir, 'style.css')).mtimeMs;
    const js = fs.statSync(path.join(publicDir, 'app.js')).mtimeMs;
    return String(Math.floor(Math.max(css, js)));
  } catch {
    return process.env.ASSET_VERSION || '1';
  }
}

// Trả 1 trang HTML kèm chèn version (và giới hạn upload). Dùng cho mọi trang.
function sendPage(file) {
  return (req, res, next) => {
    fs.readFile(path.join(publicDir, file), 'utf8', (err, raw) => {
      if (err) return next();
      const html = raw
        .replaceAll('__V__', assetVersion())
        .replaceAll('__MAX_MB__', String(MAX_FILE_MB));
      res.type('html').send(html);
    });
  };
}

// Các trang HTML (đặt trước static để chèn được version) — không cần session
app.get('/', sendPage('index.html'));
app.get('/login.html', sendPage('login.html'));
app.get('/register.html', sendPage('register.html'));
app.get('/forgot.html', sendPage('forgot.html'));
app.get('/reset.html', sendPage('reset.html'));
app.get('/users.html', sendPage('users.html'));

// Frontend tĩnh (CSS/JS/ảnh) — không cần session, đặt trước session cho nhẹ
app.use(express.static(publicDir, { index: false }));

// Từ đây trở xuống cần thân request + phiên đăng nhập
app.use(express.json({ limit: '1mb' }));

// Phiên đăng nhập — lưu vào SQLite để giữ qua các lần restart server
app.use(
  session({
    store: new SqliteStore({
      client: db,
      expired: { clear: true, intervalMs: 15 * 60 * 1000 },
    }),
    secret: process.env.SESSION_SECRET || 'doi-secret-nay-trong-env',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd,
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 ngày
    },
  })
);

// API auth (đăng ký / đăng nhập / quên mật khẩu) — không cần đăng nhập trước
app.use('/api/auth', authRouter);

// API dữ liệu — bắt buộc đăng nhập, mỗi user chỉ thấy dữ liệu của mình
app.use('/api/entries', requireAuth, entriesRouter);
app.use('/api/cover', requireAuth, coverRouter);
app.use('/api/weather', weatherRouter);

// Danh sách user (cho mọi người đăng nhập) — dùng để chia sẻ note nhanh
app.use('/api/users', requireAuth, usersRouter);

// API quản trị — bắt buộc đăng nhập VÀ là admin
app.use('/api/admin', requireAuth, requireAdmin, adminRouter);

app.listen(PORT, () => {
  console.log(`Notebook đang chạy tại http://localhost:${PORT}`);
});
