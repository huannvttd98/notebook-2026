'use strict';

require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const compression = require('compression');
const SqliteStore = require('better-sqlite3-session-store')(session);

const db = require('./src/db');
const { router: authRouter, requireAuth, upsertUser } = require('./src/auth');
const entriesRouter = require('./src/routes/entries');
const weatherRouter = require('./src/routes/weather');
const coverRouter = require('./src/routes/cover');

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3100;
const isProd = process.env.NODE_ENV === 'production';

// Sau Nginx reverse proxy (để cookie secure hoạt động)
app.set('trust proxy', 1);

// Helmet + CSP mở cho Telegram Login Widget
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        'script-src': ["'self'", 'https://telegram.org'],
        'frame-src': ['https://oauth.telegram.org', 'https://telegram.org'],
        'img-src': ["'self'", 'data:', 'https://t.me', 'https://*.telegram.org'],
      },
    },
  })
);
app.use(compression());
app.use(express.json({ limit: '1mb' }));

// Frontend tĩnh (đặt trước session — file tĩnh không cần phiên). index:false để '/' tự xử lý.
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir, { index: false }));

// Session lưu trong SQLite (bền qua các lần restart)
app.use(
  session({
    store: new SqliteStore({
      client: db,
      expired: { clear: true, intervalMs: 15 * 60 * 1000 },
    }),
    secret: process.env.SESSION_SECRET || 'dev-secret-doi-trong-env',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 ngày
    },
  })
);

if (!process.env.SESSION_SECRET) {
  console.warn('[CẢNH BÁO] Thiếu SESSION_SECRET trong .env — dùng giá trị tạm (không an toàn).');
}

// Cửa sau dev: ở local tự đăng nhập "Local Dev" cho mọi request (Telegram không chạy localhost)
if (!isProd) {
  app.use((req, res, next) => {
    if (!req.session.userId) {
      req.session.userId = upsertUser('dev', '0', { name: 'Local Dev' }).id;
    }
    next();
  });
}

// Auth routes: /auth/telegram, /auth/dev-login, /api/me, /api/logout
app.use(authRouter);

// API dữ liệu — yêu cầu đăng nhập + cách ly theo user
app.use('/api/entries', requireAuth, entriesRouter);
app.use('/api/cover', requireAuth, coverRouter);
// Thời tiết công khai
app.use('/api/weather', weatherRouter);

// Version cache: prod dùng ASSET_VERSION; local dùng mtime để luôn tải bản mới
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

// Trang chính — yêu cầu đăng nhập, rồi chèn version vào link CSS/JS
app.get('/', (req, res) => {
  if (!req.session.userId) return res.redirect('/login.html');
  let html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
  html = html.replaceAll('__V__', assetVersion());
  res.type('html').send(html);
});

app.listen(PORT, () => {
  console.log(`Notebook đang chạy tại http://localhost:${PORT}`);
});
