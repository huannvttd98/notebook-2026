'use strict';

// Tạo bcrypt hash cho mật khẩu đăng nhập.
// Cách dùng:  node scripts/set-password.js "matkhaucuaban"
// Rồi copy chuỗi hash in ra vào APP_PASSWORD_HASH trong file .env

const bcrypt = require('bcryptjs');

const password = process.argv[2];

if (!password) {
  console.error('Lỗi: thiếu mật khẩu.');
  console.error('Cách dùng:  node scripts/set-password.js "matkhaucuaban"');
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 12);

console.log('\nĐã tạo hash. Dán dòng sau vào file .env:\n');
console.log(`APP_PASSWORD_HASH=${hash}\n`);
