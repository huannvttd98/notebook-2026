'use strict';

const path = require('path');
const fs = require('fs');
const multer = require('multer');

// Thư mục lưu ảnh upload (dùng chung cho ảnh bìa và ảnh trong ghi chú)
const uploadDir = path.join(__dirname, '..', 'public', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// Giới hạn kích thước ảnh. Để đủ lớn cho ảnh chụp từ điện thoại (iPhone/Android
// thường 4–12MB). Lưu ý: nginx (client_max_body_size) phải đặt CAO HƠN giá trị này
// để app tự trả lỗi JSON thân thiện thay vì nginx trả trang HTML 413.
const MAX_FILE_MB = 12;
const MAX_FILE_SIZE = MAX_FILE_MB * 1024 * 1024;

// Tạo middleware multer với tiền tố tên file, giới hạn 3MB, chỉ nhận ảnh
function createUpload(prefix) {
  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
      const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
      const rand = Math.round(Math.random() * 1e9);
      cb(null, `${prefix}_${Date.now()}_${rand}${ext}`);
    },
  });
  return multer({
    storage,
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (req, file, cb) => {
      if (/^image\//.test(file.mimetype)) cb(null, true);
      else cb(new Error('Chỉ chấp nhận file ảnh'));
    },
  });
}

module.exports = { uploadDir, createUpload, MAX_FILE_MB };
