'use strict';

const nodemailer = require('nodemailer');

// Tạo transport SMTP từ biến môi trường. Nếu chưa cấu hình SMTP_HOST thì
// transporter = null và sendResetEmail sẽ in link ra console (tiện dev).
let transporter = null;
if (process.env.SMTP_HOST) {
  const port = parseInt(process.env.SMTP_PORT, 10) || 587;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465, // 465 = SSL; 587/25 = STARTTLS
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
  });
}

const MAIL_FROM = process.env.MAIL_FROM || 'Notebook <no-reply@notebook.local>';

// Gửi email chứa link đặt lại mật khẩu.
async function sendResetEmail(to, link, username) {
  const subject = 'Đặt lại mật khẩu Notebook';
  const text =
    `Xin chào ${username},\n\n` +
    `Bạn (hoặc ai đó) đã yêu cầu đặt lại mật khẩu cho tài khoản Notebook.\n` +
    `Nhấn vào liên kết sau để đặt mật khẩu mới (hết hạn sau 1 giờ):\n\n` +
    `${link}\n\n` +
    `Nếu bạn không yêu cầu, hãy bỏ qua email này — mật khẩu sẽ không thay đổi.`;
  const html =
    `<p>Xin chào <b>${username}</b>,</p>` +
    `<p>Bạn (hoặc ai đó) đã yêu cầu đặt lại mật khẩu cho tài khoản Notebook.</p>` +
    `<p><a href="${link}">Nhấn vào đây để đặt mật khẩu mới</a> (hết hạn sau 1 giờ).</p>` +
    `<p>Nếu bạn không yêu cầu, hãy bỏ qua email này — mật khẩu sẽ không thay đổi.</p>`;

  // Chưa cấu hình SMTP: in link ra console để dev vẫn thử được luồng reset.
  if (!transporter) {
    console.log(`\n[mailer] Chưa cấu hình SMTP. Link reset cho ${to}:\n${link}\n`);
    return;
  }

  await transporter.sendMail({ from: MAIL_FROM, to, subject, text, html });
}

module.exports = { sendResetEmail };
