'use strict';

// Trang quản lý user — chỉ admin. Guard bằng /api/auth/me, sau đó tải danh sách.

const rowsEl = document.getElementById('user-rows');
const countEl = document.getElementById('count');
let adminUsername = '';

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

function statusCell(u, isAdmin) {
  if (isAdmin) return '<span class="status-badge approved">đã duyệt</span>';
  return u.status === 'approved'
    ? '<span class="status-badge approved">đã duyệt</span>'
    : '<span class="status-badge pending">chờ duyệt</span>';
}

function actionCell(u, isAdmin) {
  if (isAdmin) return '<span class="admin-muted">—</span>';
  return u.status === 'approved'
    ? `<button type="button" class="status-btn revoke" data-id="${u.id}" data-to="pending">Hủy duyệt</button>`
    : `<button type="button" class="status-btn approve" data-id="${u.id}" data-to="approved">Duyệt</button>`;
}

function renderRows(users) {
  if (!users.length) {
    rowsEl.innerHTML = '<tr><td colspan="8" class="admin-empty">Chưa có người dùng nào.</td></tr>';
    return;
  }
  rowsEl.innerHTML = users
    .map((u) => {
      const isAdmin = adminUsername && u.username && u.username.toLowerCase() === adminUsername.toLowerCase();
      const badge = isAdmin ? '<span class="admin-badge">admin</span>' : '';
      const lastLogin = u.last_login_at
        ? escapeHtml(u.last_login_at)
        : '<span class="admin-muted">Chưa đăng nhập</span>';
      return `<tr>
        <td>${u.id}</td>
        <td>${escapeHtml(u.username)}${badge}</td>
        <td>${escapeHtml(u.email)}</td>
        <td>${statusCell(u, isAdmin)}</td>
        <td>${escapeHtml(u.created_at)}</td>
        <td>${lastLogin}</td>
        <td class="admin-num">${u.note_count}</td>
        <td>${actionCell(u, isAdmin)}</td>
      </tr>`;
    })
    .join('');
}

async function loadUsers() {
  try {
    const res = await fetch('/api/admin/users');
    if (res.status === 403) {
      window.location.href = '/';
      return;
    }
    const data = await res.json();
    const users = data.users || [];
    countEl.textContent = `Tổng cộng ${data.total} người dùng`;
    renderRows(users);
  } catch {
    rowsEl.innerHTML = '<tr><td colspan="8" class="admin-empty">Lỗi tải danh sách người dùng.</td></tr>';
  }
}

async function setStatus(id, status) {
  try {
    const res = await fetch(`/api/admin/users/${id}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) throw new Error('fail');
    await loadUsers();
  } catch {
    /* lỗi mạng — bỏ qua, người dùng có thể thử lại */
  }
}

rowsEl.addEventListener('click', (e) => {
  const btn = e.target.closest('.status-btn');
  if (btn) setStatus(Number(btn.dataset.id), btn.dataset.to);
});

(async function init() {
  let me;
  try {
    const res = await fetch('/api/auth/me');
    me = await res.json();
  } catch {
    window.location.href = '/login.html';
    return;
  }
  if (!me.authenticated) {
    window.location.href = '/login.html';
    return;
  }
  if (!me.isAdmin) {
    window.location.href = '/';
    return;
  }
  adminUsername = me.username;
  loadUsers();
})();
