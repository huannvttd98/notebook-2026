'use strict';

// Trang admin xem toàn bộ note của mọi user. Guard bằng /api/auth/me (isAdmin).

const rowsEl = document.getElementById('note-rows');
const countEl = document.getElementById('count');
const searchEl = document.getElementById('search');
const userFilterEl = document.getElementById('user-filter');
const modal = document.getElementById('note-modal');
const modalClose = document.getElementById('note-modal-close');
const modalTitle = document.getElementById('note-modal-title');
const modalMeta = document.getElementById('note-modal-meta');
const modalContent = document.getElementById('note-modal-content');

const FACES = ['😢', '🙁', '😐', '🙂', '😄'];
let allNotes = [];

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

function preview(text) {
  const t = (text || '').trim().replace(/\s+/g, ' ');
  return t.length > 80 ? t.slice(0, 80) + '…' : t;
}

function titleOf(n) {
  if (n.title?.trim()) return n.title.trim();
  if (n.content?.trim()) return n.content.trim().split('\n')[0].slice(0, 50);
  return '(không tiêu đề)';
}

function renderRows(notes) {
  if (!notes.length) {
    rowsEl.innerHTML = '<tr><td colspan="7" class="admin-empty">Không có ghi chú nào.</td></tr>';
    return;
  }
  rowsEl.innerHTML = notes
    .map((n) => {
      const face = n.rating >= 1 && n.rating <= 5 ? FACES[n.rating - 1] : '';
      const music = n.music ? ' 🎵' : '';
      const owner = n.owner_username || '(không rõ)';
      return `<tr class="admin-note-row" data-id="${n.id}" title="Bấm để xem chi tiết ghi chú">
        <td>${n.id}</td>
        <td>${escapeHtml(owner)}</td>
        <td>${escapeHtml(titleOf(n))}${face} ${music}</td>
        <td class="note-preview">${escapeHtml(preview(n.content))}</td>
        <td>${escapeHtml(n.created_at)}</td>
        <td class="admin-num">${n.share_count || 0}</td>
        <td><button type="button" class="note-view" data-id="${n.id}">Xem chi tiết</button></td>
      </tr>`;
    })
    .join('');
}

function openNote(id) {
  const n = allNotes.find((x) => x.id === id);
  if (!n) return;
  modalTitle.textContent = titleOf(n);
  modalMeta.textContent = `Chủ: ${n.owner_username || '(không rõ)'} · Tạo: ${n.created_at}` +
    (n.updated_at ? ` · Sửa: ${n.updated_at}` : '');
  modalContent.textContent = n.content || '';
  if (typeof modal.showModal === 'function' && !modal.open) modal.showModal();
}

function closeNote() {
  if (typeof modal.close === 'function' && modal.open) modal.close();
}

function currentFilters() {
  return {
    search: searchEl.value.trim(),
    userId: userFilterEl ? userFilterEl.value : '',
  };
}

async function loadUsers() {
  if (!userFilterEl) return;
  try {
    const res = await fetch('/api/admin/users');
    if (!res.ok) throw new Error('fail');
    const data = await res.json();
    const users = data.users || [];
    userFilterEl.innerHTML =
      '<option value="">Tất cả user</option>' +
      users
        .map((u) => `<option value="${u.id}">${escapeHtml(u.username)} (${escapeHtml(u.email)})</option>`)
        .join('');
  } catch {
    userFilterEl.innerHTML = '<option value="">Không tải được user</option>';
  }
}

async function loadNotes(filters = currentFilters()) {
  try {
    const params = new URLSearchParams();
    if (filters.search) params.set('search', filters.search);
    if (filters.userId) params.set('userId', filters.userId);
    const url = '/api/admin/notes' + (params.size ? '?' + params.toString() : '');
    const res = await fetch(url);
    if (res.status === 403) {
      globalThis.location.href = '/';
      return;
    }
    const data = await res.json();
    allNotes = data.notes || [];
    countEl.textContent = `${data.total} ghi chú` + (data.capped ? ' (hiển thị tối đa)' : '');
    renderRows(allNotes);
  } catch {
    rowsEl.innerHTML = '<tr><td colspan="7" class="admin-empty">Lỗi tải ghi chú.</td></tr>';
  }
}

rowsEl.addEventListener('click', (e) => {
  const btn = e.target.closest('.note-view');
  if (btn) {
    openNote(Number(btn.dataset.id));
    return;
  }

  const row = e.target.closest('.admin-note-row');
  if (row) openNote(Number(row.dataset.id));
});
if (modalClose) modalClose.addEventListener('click', closeNote);
if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) closeNote(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal?.open) closeNote(); });

let searchTimer;
searchEl.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => loadNotes(), 300);
});
if (userFilterEl) userFilterEl.addEventListener('change', () => loadNotes());

(async function init() {
  let me;
  try {
    const res = await fetch('/api/auth/me');
    me = await res.json();
  } catch {
    globalThis.location.href = '/login.html';
    return;
  }
  if (!me.authenticated) {
    globalThis.location.href = '/login.html';
    return;
  }
  if (!me.isAdmin) {
    globalThis.location.href = '/';
    return;
  }
  await loadUsers();
  loadNotes();
})();
