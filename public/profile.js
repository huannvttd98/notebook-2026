'use strict';

// Trang hồ sơ: cập nhật ảnh đại diện + tên hiển thị. Cần đăng nhập.

const msgEl = document.getElementById('msg');
const avatarImg = document.getElementById('avatar-img');
const avatarPlaceholder = document.getElementById('avatar-placeholder');
const avatarInput = document.getElementById('avatar-input');
const avatarRemove = document.getElementById('avatar-remove');
const avatarStatus = document.getElementById('avatar-status');
const form = document.getElementById('profile-form');
const nameEl = document.getElementById('display_name');
const usernameEl = document.getElementById('username');
const emailEl = document.getElementById('email');
const submitBtn = document.getElementById('submit-btn');

function showMsg(text, type) {
  msgEl.textContent = text;
  msgEl.className = `auth-msg show ${type}`;
}

async function readJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { error: `Lỗi máy chủ (${res.status || 'mạng'})` };
  }
}

function showAvatar(url) {
  if (url) {
    avatarImg.src = url;
    avatarImg.hidden = false;
    avatarPlaceholder.hidden = true;
    avatarRemove.hidden = false;
  } else {
    avatarImg.hidden = true;
    avatarImg.removeAttribute('src');
    avatarPlaceholder.hidden = false;
    avatarRemove.hidden = true;
  }
}

async function loadProfile() {
  const res = await fetch('/api/profile');
  if (res.status === 401) {
    window.location.href = '/login.html';
    return;
  }
  const p = await readJson(res);
  nameEl.value = p.display_name || '';
  usernameEl.value = p.username || '';
  emailEl.value = p.email || '';
  showAvatar(p.avatar_url);
}

// Tải ảnh đại diện khi chọn file
avatarInput.addEventListener('change', async () => {
  const file = avatarInput.files && avatarInput.files[0];
  if (!file) return;
  avatarStatus.textContent = 'Đang tải ảnh…';
  const fd = new FormData();
  fd.append('avatar', file);
  try {
    const res = await fetch('/api/profile/avatar', { method: 'POST', body: fd });
    const data = await readJson(res);
    if (!res.ok) throw new Error(data.error || 'Lỗi');
    showAvatar(data.avatar_url);
    avatarStatus.textContent = '✓ Đã cập nhật ảnh';
  } catch (err) {
    avatarStatus.textContent = '⚠ ' + err.message;
  } finally {
    avatarInput.value = '';
  }
});

// Gỡ ảnh đại diện
avatarRemove.addEventListener('click', async () => {
  avatarStatus.textContent = 'Đang gỡ…';
  try {
    const res = await fetch('/api/profile/avatar', { method: 'DELETE' });
    const data = await readJson(res);
    if (!res.ok) throw new Error(data.error || 'Lỗi');
    showAvatar(null);
    avatarStatus.textContent = 'Đã gỡ ảnh';
  } catch (err) {
    avatarStatus.textContent = '⚠ ' + err.message;
  }
});

// Lưu tên hiển thị
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  submitBtn.disabled = true;
  msgEl.className = 'auth-msg';
  try {
    const res = await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ display_name: nameEl.value.trim() }),
    });
    const data = await readJson(res);
    if (!res.ok) throw new Error(data.error || 'Lưu thất bại');
    nameEl.value = data.display_name || '';
    showMsg('✓ Đã lưu thay đổi', 'ok');
  } catch (err) {
    showMsg('⚠ ' + err.message, 'error');
  } finally {
    submitBtn.disabled = false;
  }
});

loadProfile();
