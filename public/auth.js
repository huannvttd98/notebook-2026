'use strict';

// Script chung cho login / register / forgot / reset.
// Tự nhận diện form nào có trên trang rồi gắn xử lý tương ứng.

const msgEl = document.getElementById('msg');

function showMsg(text, type) {
  if (!msgEl) return;
  msgEl.textContent = text;
  msgEl.className = `auth-msg show ${type}`;
}

function clearMsg() {
  if (msgEl) msgEl.className = 'auth-msg';
}

// Đọc JSON an toàn kể cả khi server trả thân rỗng / không phải JSON
async function readJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { error: `Lỗi máy chủ (${res.status || 'mạng'})` };
  }
}

// Gửi POST JSON; trả { ok, data }
async function postJson(url, payload) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await readJson(res);
  return { ok: res.ok, data };
}

// Khóa nút submit khi đang gửi để tránh double-submit
function withBusy(form, fn) {
  const btn = form.querySelector('button[type="submit"]');
  return async (e) => {
    e.preventDefault();
    clearMsg();
    if (btn) btn.disabled = true;
    try {
      await fn();
    } catch {
      showMsg('Lỗi kết nối. Vui lòng thử lại.', 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  };
}

// ===== Đăng nhập =====
const loginForm = document.getElementById('login-form');
if (loginForm) {
  loginForm.addEventListener(
    'submit',
    withBusy(loginForm, async () => {
      const username = document.getElementById('username').value.trim();
      const password = document.getElementById('password').value;
      const { ok, data } = await postJson('/api/auth/login', { username, password });
      if (!ok) return showMsg(data.error || 'Đăng nhập thất bại', 'error');
      window.location.href = '/';
    })
  );
}

// ===== Đăng ký =====
const registerForm = document.getElementById('register-form');
if (registerForm) {
  registerForm.addEventListener(
    'submit',
    withBusy(registerForm, async () => {
      const username = document.getElementById('username').value.trim();
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;
      const password2 = document.getElementById('password2').value;

      if (password !== password2) {
        return showMsg('Mật khẩu nhập lại không khớp', 'error');
      }
      const { ok, data } = await postJson('/api/auth/register', { username, email, password });
      if (!ok) return showMsg(data.error || 'Đăng ký thất bại', 'error');
      window.location.href = '/';
    })
  );
}

// ===== Quên mật khẩu =====
const forgotForm = document.getElementById('forgot-form');
if (forgotForm) {
  forgotForm.addEventListener(
    'submit',
    withBusy(forgotForm, async () => {
      const email = document.getElementById('email').value.trim();
      const { ok, data } = await postJson('/api/auth/forgot', { email });
      if (!ok) return showMsg(data.error || 'Có lỗi xảy ra', 'error');
      showMsg('Nếu email tồn tại, link đặt lại mật khẩu đã được gửi. Vui lòng kiểm tra hộp thư.', 'ok');
      forgotForm.reset();
    })
  );
}

// ===== Đặt lại mật khẩu =====
const resetForm = document.getElementById('reset-form');
if (resetForm) {
  const token = new URLSearchParams(window.location.search).get('token') || '';
  if (!token) {
    showMsg('Thiếu mã đặt lại. Vui lòng mở link từ email.', 'error');
  }
  resetForm.addEventListener(
    'submit',
    withBusy(resetForm, async () => {
      const password = document.getElementById('password').value;
      const password2 = document.getElementById('password2').value;
      if (password !== password2) {
        return showMsg('Mật khẩu nhập lại không khớp', 'error');
      }
      const { ok, data } = await postJson('/api/auth/reset', { token, password });
      if (!ok) return showMsg(data.error || 'Đặt lại thất bại', 'error');
      showMsg('Đổi mật khẩu thành công! Đang chuyển tới trang đăng nhập…', 'ok');
      setTimeout(() => (window.location.href = '/login.html'), 1500);
    })
  );
}
