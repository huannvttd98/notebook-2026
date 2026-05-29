'use strict';

// ===== Trạng thái =====
let currentId = null;       // id ghi chú đang mở (null = bản nháp mới chưa lưu)
let currentRating = 0;
let searchTerm = '';
let saving = false;         // đang gọi API lưu
let dirty = false;          // có thay đổi chưa lưu
let saveTimer = null;

// ===== Phần tử DOM =====
const newBtn = document.getElementById('new-note');
const searchEl = document.getElementById('search');
const noteListEl = document.getElementById('note-list');
const idEl = document.getElementById('entry-id');
const titleEl = document.getElementById('title');
const contentEl = document.getElementById('content');
const moodEl = document.getElementById('mood');
const dateEl = document.getElementById('entry-date');
const crumbEl = document.getElementById('doc-crumb');
const statusEl = document.getElementById('save-status');
const deleteBtn = document.getElementById('delete-note');
const ratingEl = document.getElementById('rating');
const ratingClearBtn = document.getElementById('rating-clear');
const starEls = ratingEl ? Array.from(ratingEl.querySelectorAll('.star')) : [];

// ===== Tiện ích =====
function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatDate(iso) {
  if (!iso) return '';
  const [date, time] = iso.split(' ');
  if (!date) return iso;
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y}${time ? ' · ' + time.slice(0, 5) : ''}`;
}

// Tiêu đề hiển thị trong sidebar: tiêu đề, hoặc dòng đầu nội dung, hoặc mặc định
function displayTitle(e) {
  if (e.title && e.title.trim()) return e.title.trim();
  if (e.content && e.content.trim()) return e.content.trim().split('\n')[0].slice(0, 50);
  return 'Không có tiêu đề';
}

function setStatus(text) {
  statusEl.textContent = text;
}

// ===== Đánh giá sao =====
function paintRating(value) {
  starEls.forEach((s) => s.classList.toggle('active', Number(s.dataset.value) <= value));
}
function setRating(value, save = true) {
  currentRating = value;
  paintRating(value);
  if (save) scheduleSave();
}
starEls.forEach((s) => s.addEventListener('click', () => setRating(Number(s.dataset.value))));
if (ratingClearBtn) ratingClearBtn.addEventListener('click', () => setRating(0));

// ===== Sidebar: danh sách ghi chú =====
async function loadNotes() {
  const params = new URLSearchParams({ limit: 200 });
  if (searchTerm) params.set('search', searchTerm);
  const res = await fetch('/api/entries?' + params.toString());
  const data = await res.json();
  renderNoteList(data.entries);
  return data.entries;
}

function renderNoteList(entries) {
  if (!entries.length) {
    noteListEl.innerHTML = '<p class="note-empty">Chưa có ghi chú nào</p>';
    return;
  }
  noteListEl.innerHTML = entries
    .map(
      (e) => `
      <button type="button" class="note-item${e.id === currentId ? ' active' : ''}" data-id="${e.id}">
        <span class="note-icon">📄</span>
        <span class="note-name">${escapeHtml(displayTitle(e))}</span>
        ${e.rating ? `<span class="note-stars">${'★'.repeat(e.rating)}</span>` : ''}
      </button>`
    )
    .join('');
}

noteListEl.addEventListener('click', (e) => {
  const id = e.target.closest('.note-item')?.dataset.id;
  if (id) selectNote(Number(id));
});

// ===== Mở 1 ghi chú =====
async function selectNote(id) {
  await flushNow(); // lưu nốt ghi chú đang mở trước khi chuyển
  const res = await fetch(`/api/entries/${id}`);
  if (!res.ok) return;
  const entry = await res.json();
  loadIntoEditor(entry);
  highlightActive();
}

function loadIntoEditor(entry) {
  currentId = entry.id;
  idEl.value = entry.id;
  titleEl.value = entry.title || '';
  contentEl.value = entry.content || '';
  moodEl.value = entry.mood || '';
  setRating(entry.rating || 0, false);
  dateEl.textContent = entry.created_at
    ? formatDate(entry.created_at) + (entry.updated_at ? ' (đã sửa)' : '')
    : '';
  crumbEl.textContent = displayTitle(entry);
  deleteBtn.hidden = false;
  setStatus('');
  dirty = false;
}

function highlightActive() {
  noteListEl.querySelectorAll('.note-item').forEach((el) => {
    el.classList.toggle('active', Number(el.dataset.id) === currentId);
  });
}

// ===== Tạo ghi chú mới (bản nháp) =====
function newNote() {
  flushNow();
  currentId = null;
  idEl.value = '';
  titleEl.value = '';
  contentEl.value = '';
  moodEl.value = '';
  setRating(0, false);
  dateEl.textContent = '';
  crumbEl.textContent = 'Ghi chú mới';
  deleteBtn.hidden = true;
  setStatus('');
  dirty = false;
  highlightActive();
  titleEl.focus();
}
newBtn.addEventListener('click', newNote);

// ===== Tự động lưu =====
function scheduleSave() {
  dirty = true;
  setStatus('Đang chỉnh sửa…');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 700);
}

async function flush() {
  if (saving) return; // sẽ được gọi lại sau khi lưu xong
  const content = contentEl.value.trim();
  // Bản nháp rỗng (chưa có id, chưa có nội dung) thì không lưu
  if (!currentId && !content) {
    dirty = false;
    setStatus('');
    return;
  }
  if (!content) {
    setStatus('Cần có nội dung để lưu');
    return;
  }

  saving = true;
  dirty = false;
  setStatus('Đang lưu…');
  const payload = {
    title: titleEl.value,
    content: contentEl.value,
    mood: moodEl.value,
    rating: currentRating,
  };

  try {
    let entry;
    if (currentId) {
      const res = await fetch(`/api/entries/${currentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      entry = await res.json();
    } else {
      const res = await fetch('/api/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      entry = await res.json();
      currentId = entry.id;
      idEl.value = entry.id;
      deleteBtn.hidden = false;
    }
    crumbEl.textContent = displayTitle(entry);
    setStatus('✓ Đã lưu');
    await loadNotes();
    highlightActive();
  } catch {
    setStatus('⚠ Lỗi khi lưu');
    dirty = true;
  } finally {
    saving = false;
    if (dirty) scheduleSave(); // có thay đổi mới phát sinh trong lúc đang lưu
  }
}

// Lưu ngay lập tức (khi chuyển ghi chú / tạo mới)
async function flushNow() {
  clearTimeout(saveTimer);
  if (dirty && !saving) await flush();
}

// Gõ tiêu đề / nội dung / tâm trạng -> lên lịch lưu
[titleEl, contentEl, moodEl].forEach((el) => el.addEventListener('input', scheduleSave));
// Rời trang -> cố gắng lưu nốt
window.addEventListener('beforeunload', () => { clearTimeout(saveTimer); });

// ===== Xóa ghi chú đang mở =====
deleteBtn.addEventListener('click', async () => {
  if (!currentId) return;
  if (!confirm('Xóa ghi chú này?')) return;
  await fetch(`/api/entries/${currentId}`, { method: 'DELETE' });
  const entries = await loadNotes();
  if (entries.length) {
    selectNote(entries[0].id);
  } else {
    newNote();
  }
});

// ===== Tìm kiếm (debounce) =====
let searchTimer;
searchEl.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    searchTerm = searchEl.value.trim();
    loadNotes();
  }, 300);
});

// ===== Thời tiết =====
async function loadWeather() {
  const el = document.getElementById('weather');
  if (!el) return;
  try {
    const res = await fetch('/api/weather');
    if (!res.ok) throw new Error('fail');
    const w = await res.json();
    el.innerHTML = `
      <span class="weather-icon">${w.icon}</span>
      <span class="weather-temp">${Math.round(w.temperature)}°C</span>
      <span class="weather-meta">${escapeHtml(w.description)} · ${escapeHtml(w.city)}</span>
    `;
  } catch {
    el.innerHTML = '<span class="weather-meta">Không lấy được thời tiết</span>';
  }
}

// ===== Khởi động =====
(async function init() {
  const entries = await loadNotes();
  if (entries.length) {
    loadIntoEditor(entries[0]);
    highlightActive();
  } else {
    newNote();
  }
  loadWeather();
})();
