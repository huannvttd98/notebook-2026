'use strict';

require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');

const entriesRouter = require('./src/routes/entries');
const weatherRouter = require('./src/routes/weather');
const coverRouter = require('./src/routes/cover');

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3100;

// Sau Nginx reverse proxy
app.set('trust proxy', 1);

app.use(helmet());
app.use(compression());
app.use(express.json({ limit: '1mb' }));

// API (không cần đăng nhập)
app.use('/api/entries', entriesRouter);
app.use('/api/weather', weatherRouter);
app.use('/api/cover', coverRouter);

// Frontend tĩnh (tắt index để route '/' bên dưới chèn được version)
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir, { index: false }));

// Version cache:
// - Production: dùng ASSET_VERSION trong .env (kiểm soát thủ công khi deploy)
// - Local/dev: dùng thời gian sửa file CSS/JS để LUÔN tải bản mới (khỏi cache)
function assetVersion() {
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd && process.env.ASSET_VERSION) return process.env.ASSET_VERSION;
  try {
    const css = fs.statSync(path.join(publicDir, 'style.css')).mtimeMs;
    const js = fs.statSync(path.join(publicDir, 'app.js')).mtimeMs;
    return String(Math.floor(Math.max(css, js)));
  } catch {
    return process.env.ASSET_VERSION || '1';
  }
}

// Trang chính — chèn version vào link CSS/JS
app.get('/', (req, res) => {
  let html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
  html = html.replaceAll('__V__', assetVersion());
  res.type('html').send(html);
});

app.listen(PORT, () => {
  console.log(`Notebook đang chạy tại http://localhost:${PORT}`);
});
