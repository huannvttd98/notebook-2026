'use strict';

require('dotenv').config();

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');

const entriesRouter = require('./src/routes/entries');
const weatherRouter = require('./src/routes/weather');
const coverRouter = require('./src/routes/cover');

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3000;

// Sau Nginx reverse proxy
app.set('trust proxy', 1);

app.use(helmet());
app.use(compression());
app.use(express.json({ limit: '1mb' }));

// API (không cần đăng nhập)
app.use('/api/entries', entriesRouter);
app.use('/api/weather', weatherRouter);
app.use('/api/cover', coverRouter);

// Frontend tĩnh
app.use(express.static(path.join(__dirname, 'public')));

// Trang chính
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Notebook đang chạy tại http://localhost:${PORT}`);
});
