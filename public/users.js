'use strict';

// Trang quản lý user — chỉ admin. Guard bằng /api/auth/me, sau đó tải danh sách.

const rowsEl = document.getElementById('user-rows');
const countEl = document.getElementById('count');

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

function renderRows(users, adminUsername) {
  if (!users.length) {
    rowsEl.innerHTML = '<tr><td colspan="6" class="admin-empty">Chưa có người dùng nào.</td></tr>';
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
        <td>${escapeHtml(u.created_at)}</td>
        <td>${lastLogin}</td>
        <td class="admin-num">${u.note_count}</td>
      </tr>`;
    })
    .join('');
}

(async function init() {
  // 1. Kiểm tra quyền
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
    // Không phải admin -> về trang chính
    window.location.href = '/';
    return;
  }

  // 2. Tải danh sách user
  try {
    const res = await fetch('/api/admin/users');
    if (res.status === 403) {
      window.location.href = '/';
      return;
    }
    const data = await res.json();
    const users = data.users || [];
    countEl.textContent = `Tổng cộng ${data.total} người dùng`;
    renderRows(users, me.username);
  } catch {
    rowsEl.innerHTML = '<tr><td colspan="5" class="admin-empty">Lỗi tải danh sách người dùng.</td></tr>';
  }
})();
