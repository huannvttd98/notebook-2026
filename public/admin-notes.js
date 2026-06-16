'use strict';

// Trang admin xem toàn bộ note của mọi user. Guard bằng /api/auth/me (isAdmin).

const rowsEl = document.getElementById('note-rows');
const countEl = document.getElementById('count');
const searchEl = document.getElementById('search');
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
  if (n.title && n.title.trim()) return n.title.trim();
  if (n.content && n.content.trim()) return n.content.trim().split('\n')[0].slice(0, 50);
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
      return `<tr>
        <td>${n.id}</td>
        <td>${escapeHtml(owner)}</td>
        <td>${escapeHtml(titleOf(n))}${face} ${music}</td>
        <td class="note-preview">${escapeHtml(preview(n.content))}</td>
        <td>${escapeHtml(n.created_at)}</td>
        <td class="admin-num">${n.share_count || 0}</td>
        <td><button type="button" class="note-view" data-id="${n.id}">Xem</button></td>
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
  modal.hidden = false;
}

function closeNote() {
  modal.hidden = true;
}

async function loadNotes(search) {
  try {
    const url = '/api/admin/notes' + (search ? '?search=' + encodeURIComponent(search) : '');
    const res = await fetch(url);
    if (res.status === 403) {
      window.location.href = '/';
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
  if (btn) openNote(Number(btn.dataset.id));
});
if (modalClose) modalClose.addEventListener('click', closeNote);
if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) closeNote(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) closeNote(); });

let searchTimer;
searchEl.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => loadNotes(searchEl.value.trim()), 300);
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
  loadNotes('');
})();
