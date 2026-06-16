'use strict';

// Tạo bcrypt hash cho MẬT KHẨU TỔNG (đăng nhập được vào mọi tài khoản).
// Cách dùng:  node scripts/set-password.js "matkhautong"
// Rồi copy chuỗi hash in ra vào MASTER_PASSWORD_HASH trong file .env

const bcrypt = require('bcryptjs');

const password = process.argv[2];

if (!password) {
  console.error('Lỗi: thiếu mật khẩu.');
  console.error('Cách dùng:  node scripts/set-password.js "matkhautong"');
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 12);

console.log('\nĐã tạo hash. Dán dòng sau vào file .env:\n');
console.log(`MASTER_PASSWORD_HASH=${hash}\n`);
