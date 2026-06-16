'use strict';

// Giới hạn kích thước ảnh (MB) — server nhúng vào data-max-mb của <body>
const MAX_FILE_MB = Number(document.body.dataset.maxMb) || 12;

// Định dạng dung lượng file cho dễ đọc: 850KB / 3.4MB
function formatSize(bytes) {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)}MB`;
  return `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

// Kiểm tra ảnh quá lớn ngay tại client (khỏi tốn băng thông upload rồi mới báo lỗi).
// Trả về thông báo lỗi nếu vượt giới hạn, hoặc '' nếu hợp lệ.
function oversizeError(file) {
  if (file.size > MAX_FILE_MB * 1024 * 1024) {
    return `Ảnh ${formatSize(file.size)} vượt giới hạn ${MAX_FILE_MB}MB`;
  }
  return '';
}

// Đọc JSON an toàn. Trên iOS Safari, res.json() với thân rỗng / HTML (vd nginx
// trả 413 khi ảnh quá lớn) ném "The string did not match the expected pattern".
// Hàm này tự bắt và trả lỗi thân thiện theo HTTP status thay vì dòng khó hiểu đó.
async function readJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    if (res.status === 413) return { error: `Ảnh quá lớn (tối đa ${MAX_FILE_MB}MB)` };
    return { error: `Lỗi máy chủ (${res.status || 'mạng'})` };
  }
}

// ===== Trạng thái =====
let currentId = null;       // id ghi chú đang mở (null = bản nháp mới chưa lưu)
let currentRating = 0;
let searchTerm = '';
let saving = false;         // đang gọi API lưu
let dirty = false;          // có thay đổi chưa lưu
let saveTimer = null;

// ===== Phần tử DOM =====
const newBtn = document.getElementById('new-note');
const openCalBtn = document.getElementById('open-calendar');
const docEl = document.querySelector('.doc');
const calView = document.getElementById('calendar-view');
const calGrid = document.getElementById('cal-grid');
const calTitle = document.getElementById('cal-title');
const calPrev = document.getElementById('cal-prev');
const calNext = document.getElementById('cal-next');
const searchEl = document.getElementById('search');
const noteListEl = document.getElementById('note-list');
const idEl = document.getElementById('entry-id');
const titleEl = document.getElementById('title');
const contentEl = document.getElementById('content');
const dateEl = document.getElementById('entry-date');
const editedMark = document.getElementById('edited-mark');
const crumbEl = document.getElementById('doc-crumb');
const statusEl = document.getElementById('save-status');
const deleteBtn = document.getElementById('delete-note');
const ratingEl = document.getElementById('rating');
const ratingClearBtn = document.getElementById('rating-clear');
const faceEls = ratingEl ? Array.from(ratingEl.querySelectorAll('.face')) : [];
const noteImagesEl = document.getElementById('note-images');
const noteImageInput = document.getElementById('note-image-input');
const imageStatus = document.getElementById('image-status');
const coverSlider = document.getElementById('cover-slider');
const sliderPrev = document.getElementById('slider-prev');
const sliderNext = document.getElementById('slider-next');
const sliderDots = document.getElementById('slider-dots');
const musicToggle = document.getElementById('music-toggle');
const musicRow = document.getElementById('music-row');
const musicInput = document.getElementById('music-input');
const musicClear = document.getElementById('music-clear');
const musicPlayer = document.getElementById('music-player');

// Icon cảm xúc theo mức 1-5
const FACES = ['😢', '🙁', '😐', '🙂', '😄'];
function faceFor(rating) {
  return rating >= 1 && rating <= 5 ? FACES[rating - 1] : '';
}

// Ngày hôm nay dạng YYYY-MM-DD (cho ô chọn ngày)
function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Ảnh hiện tại của ghi chú đang mở
let currentImages = [];

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
  statusEl.className = 'save-status';
  if (!text) return;
  if (text.includes('✓')) statusEl.classList.add('is-saved');
  else if (text.includes('⚠') || text.includes('Lỗi') || text.includes('Cần')) statusEl.classList.add('is-error');
  else statusEl.classList.add('is-saving');
}

// ===== Đánh giá cảm xúc (chọn 1 icon) =====
function paintRating(value) {
  faceEls.forEach((f) => f.classList.toggle('active', Number(f.dataset.value) === value));
}
function setRating(value, save = true) {
  currentRating = value;
  paintRating(value);
  if (save) scheduleSave();
}
faceEls.forEach((f) => f.addEventListener('click', () => setRating(Number(f.dataset.value))));
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
        ${
          musicEmbed(e.music)
            ? `<span class="note-play" role="button" tabindex="0" title="Phát nhạc"
                 data-music="${escapeHtml(e.music)}" data-title="${escapeHtml(displayTitle(e))}">▶</span>`
            : ''
        }
        ${e.rating ? `<span class="note-face">${faceFor(e.rating)}</span>` : ''}
      </button>`
    )
    .join('');
}

noteListEl.addEventListener('click', (e) => {
  // Bấm nút ▶ -> phát nhạc tại chỗ, không mở ghi chú
  const play = e.target.closest('.note-play');
  if (play) {
    e.stopPropagation();
    openPlayer(play.dataset.music, play.dataset.title);
    return;
  }
  const id = e.target.closest('.note-item')?.dataset.id;
  if (id) selectNote(Number(id));
});
// Phát bằng phím Enter/Space khi focus nút ▶
noteListEl.addEventListener('keydown', (e) => {
  const play = e.target.closest('.note-play');
  if (play && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    openPlayer(play.dataset.music, play.dataset.title);
  }
});

// ===== Mở 1 ghi chú =====
async function selectNote(id) {
  await flushNow(); // lưu nốt ghi chú đang mở trước khi chuyển
  showDoc();
  closeSidebar();
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
  setRating(entry.rating || 0, false);
  dateEl.value = entry.created_at ? entry.created_at.split(' ')[0] : todayStr();
  editedMark.textContent = entry.updated_at ? '(đã sửa)' : '';
  crumbEl.textContent = displayTitle(entry);
  deleteBtn.hidden = false;
  renderImages(parseEntryImages(entry));
  loadMusic(entry.music);
  autoGrow();
  setStatus('');
  dirty = false;
}

// Đọc mảng images từ entry (cột images là chuỗi JSON)
function parseEntryImages(entry) {
  try {
    const arr = typeof entry.images === 'string' ? JSON.parse(entry.images) : entry.images;
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function highlightActive() {
  noteListEl.querySelectorAll('.note-item').forEach((el) => {
    el.classList.toggle('active', Number(el.dataset.id) === currentId);
  });
}

// ===== Tạo ghi chú mới (bản nháp) =====
function newNote() {
  flushNow();
  showDoc();
  closeSidebar();
  currentId = null;
  idEl.value = '';
  titleEl.value = '';
  contentEl.value = '';
  setRating(0, false);
  dateEl.value = todayStr();
  editedMark.textContent = '';
  crumbEl.textContent = 'Ghi chú mới';
  deleteBtn.hidden = true;
  renderImages([]);
  loadMusic('');
  autoGrow();
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
    rating: currentRating,
    date: dateEl.value || undefined,
    music: musicInput ? musicInput.value.trim() : '',
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
[titleEl, contentEl].forEach((el) => el.addEventListener('input', scheduleSave));
// Đổi ngày -> lưu (ảnh hưởng vị trí trên lịch)
dateEl.addEventListener('change', scheduleSave);
// Rời trang -> cố gắng lưu nốt
window.addEventListener('beforeunload', () => { clearTimeout(saveTimer); });

// ===== Ảnh trong ghi chú =====
function renderImages(images) {
  currentImages = images || [];
  if (!currentImages.length) {
    noteImagesEl.innerHTML = '';
    setupSlider();
    return;
  }
  noteImagesEl.innerHTML = currentImages
    .map(
      (url) => `
      <div class="cover-photo">
        <img src="${escapeHtml(url)}" alt="ảnh bìa" />
        <button type="button" class="note-img-del" data-url="${escapeHtml(url)}" title="Gỡ ảnh">✕</button>
      </div>`
    )
    .join('');
  setupSlider();
}

// ===== Slider ảnh (chỉ kích hoạt khi có >= 2 ảnh) =====
function setupSlider() {
  const n = currentImages.length;
  coverSlider.classList.toggle('has-multi', n > 1);
  sliderDots.innerHTML =
    n > 1
      ? currentImages
          .map((_, i) => `<button type="button" class="dot${i === 0 ? ' active' : ''}" data-i="${i}"></button>`)
          .join('')
      : '';
  noteImagesEl.scrollLeft = 0;
}

function currentSlide() {
  const w = noteImagesEl.clientWidth || 1;
  return Math.round(noteImagesEl.scrollLeft / w);
}
function scrollToSlide(i) {
  noteImagesEl.scrollTo({ left: i * noteImagesEl.clientWidth, behavior: 'smooth' });
}
if (sliderPrev) sliderPrev.addEventListener('click', () => scrollToSlide(Math.max(0, currentSlide() - 1)));
if (sliderNext) sliderNext.addEventListener('click', () => scrollToSlide(Math.min(currentImages.length - 1, currentSlide() + 1)));
if (sliderDots) sliderDots.addEventListener('click', (e) => {
  const i = e.target.closest('.dot')?.dataset.i;
  if (i != null) scrollToSlide(Number(i));
});
// Cập nhật chấm active khi vuốt/cuộn
if (noteImagesEl) noteImagesEl.addEventListener('scroll', () => {
  const active = currentSlide();
  sliderDots.querySelectorAll('.dot').forEach((d, i) => d.classList.toggle('active', i === active));
});

// Textarea tự giãn theo nội dung (cả trang cuộn, không cuộn riêng ô)
function autoGrow() {
  contentEl.style.height = 'auto';
  contentEl.style.height = contentEl.scrollHeight + 'px';
}
contentEl.addEventListener('input', autoGrow);

// ===== Xem ảnh phóng to (lightbox) =====
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightbox-img');
function openLightbox(url) {
  if (!url || !lightbox) return;
  lightboxImg.src = url;
  lightbox.hidden = false;
}
function closeLightbox() {
  if (!lightbox) return;
  lightbox.hidden = true;
  lightboxImg.removeAttribute('src');
}
if (lightbox) {
  // Bấm nền hoặc nút ✕ để đóng; bấm trực tiếp lên ảnh thì không đóng
  lightbox.addEventListener('click', (e) => {
    if (e.target !== lightboxImg) closeLightbox();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !lightbox.hidden) closeLightbox();
  });
}

// Bấm vào ảnh để xem phóng to; bấm ✕ để gỡ ảnh
noteImagesEl.addEventListener('click', async (e) => {
  const img = e.target.closest('.cover-photo img');
  if (img) {
    openLightbox(img.src);
    return;
  }
  const url = e.target.closest('.note-img-del')?.dataset.url;
  if (!url || !currentId) return;
  if (!confirm('Gỡ ảnh này?')) return;
  try {
    const res = await fetch(`/api/entries/${currentId}/images`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const data = await readJson(res);
    renderImages(data.images || []);
  } catch {
    imageStatus.textContent = '⚠ Lỗi khi gỡ ảnh';
  }
});

// Chèn ảnh: cần ghi chú đã được lưu (có id) trước
if (noteImageInput) {
  noteImageInput.addEventListener('change', async () => {
    const file = noteImageInput.files[0];
    if (!file) return;

    // Chặn sớm nếu ảnh quá lớn — hiện kích thước thực và giới hạn cho phép
    const tooBig = oversizeError(file);
    if (tooBig) {
      imageStatus.textContent = '⚠ ' + tooBig;
      noteImageInput.value = '';
      return;
    }

    // Đảm bảo ghi chú đã lưu để có id gắn ảnh
    await flushNow();
    if (!currentId) {
      imageStatus.textContent = 'Hãy viết nội dung (để tự lưu) trước khi chèn ảnh';
      noteImageInput.value = '';
      return;
    }

    imageStatus.textContent = 'Đang tải ảnh…';
    const fd = new FormData();
    fd.append('image', file);
    try {
      const res = await fetch(`/api/entries/${currentId}/images`, { method: 'POST', body: fd });
      const data = await readJson(res);
      if (!res.ok) throw new Error(data.error || 'Lỗi');
      renderImages(data.images || []);
      imageStatus.textContent = '✓ Đã thêm ảnh';
    } catch (err) {
      imageStatus.textContent = '⚠ ' + err.message;
    } finally {
      noteImageInput.value = '';
    }
  });
}

// ===== Nhạc gắn vào ghi chú (YouTube / Spotify) =====
// Chuyển link người dùng dán -> URL nhúng cho iframe. Trả '' nếu không nhận dạng được.
function musicEmbed(url) {
  const u = (url || '').trim();
  if (!u) return '';
  // YouTube: watch?v= / youtu.be/ / embed/ / music.youtube.com (id 11 ký tự)
  let m = u.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
  if (m) return `https://www.youtube.com/embed/${m[1]}`;
  // Spotify: track / album / playlist / episode / show
  m = u.match(/open\.spotify\.com\/(?:intl-\w+\/)?(track|album|playlist|episode|show)\/(\w+)/);
  if (m) return `https://open.spotify.com/embed/${m[1]}/${m[2]}`;
  return '';
}

// Vẽ player nhúng từ link hiện trong ô input
function renderMusic(url) {
  const embed = musicEmbed(url);
  if (!embed) {
    musicPlayer.innerHTML = '';
    musicPlayer.hidden = true;
    return;
  }
  const isSpotify = embed.includes('spotify');
  const frameStyle = isSpotify
    ? 'height:152px;width:100%'
    : 'aspect-ratio:16/9;width:100%;height:auto';
  musicPlayer.innerHTML =
    `<iframe src="${escapeHtml(embed)}" style="${frameStyle};border:0;border-radius:12px" ` +
    `loading="lazy" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" ` +
    `allow="autoplay; encrypted-media; clipboard-write; fullscreen; picture-in-picture"></iframe>`;
  musicPlayer.hidden = false;
}

// ===== Trang phát nhạc (modal toàn màn hình) =====
const musicModal = document.getElementById('music-modal');
const musicModalTitle = document.getElementById('music-modal-title');
const musicModalBody = document.getElementById('music-modal-body');
const musicModalClose = document.getElementById('music-modal-close');

function openPlayer(url, title) {
  const embed = musicEmbed(url);
  if (!embed || !musicModal) return;
  const isSpotify = embed.includes('spotify');
  // YouTube: tự phát; Spotify embed có nút play riêng (không tự phát)
  const src = isSpotify ? embed : embed + (embed.includes('?') ? '&' : '?') + 'autoplay=1';
  const frameStyle = isSpotify ? 'height:352px;width:100%' : 'aspect-ratio:16/9;width:100%;height:auto';
  musicModalBody.innerHTML =
    `<iframe src="${escapeHtml(src)}" style="${frameStyle};border:0" ` +
    `loading="lazy" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" ` +
    `allow="autoplay; encrypted-media; clipboard-write; fullscreen; picture-in-picture"></iframe>`;
  musicModalTitle.textContent = title || 'Đang phát';
  musicModal.hidden = false;
  document.body.classList.add('player-open');
  closeSidebar(); // đóng menu để xem trình phát rõ hơn (điện thoại)
}

function closePlayer() {
  if (!musicModal) return;
  musicModal.hidden = true;
  musicModalBody.innerHTML = ''; // gỡ iframe -> dừng nhạc
  document.body.classList.remove('player-open');
}

if (musicModalClose) musicModalClose.addEventListener('click', closePlayer);
if (musicModal) {
  // Bấm nền ngoài thẻ để đóng
  musicModal.addEventListener('click', (e) => {
    if (e.target === musicModal) closePlayer();
  });
  // Esc để đóng
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !musicModal.hidden) closePlayer();
  });
}

// Hiện/ẩn ô dán link nhạc (nút 🎵 sáng khi đang mở)
function showMusicRow(open) {
  musicRow.hidden = !open;
  musicToggle.classList.toggle('active', open);
}

// Đánh dấu nút 🎵 khi ghi chú có nhạc (kể cả lúc ô link đang ẩn)
function markHasMusic(url) {
  musicToggle.classList.toggle('has-music', !!(url && url.trim()));
}

// Nạp nhạc của ghi chú vào editor (gọi trong loadIntoEditor/newNote)
// Ô link luôn ẩn mặc định cho gọn; player vẫn hiện nếu có nhạc.
function loadMusic(url) {
  musicInput.value = url || '';
  renderMusic(url);
  showMusicRow(false);
  markHasMusic(url);
}

if (musicToggle) {
  musicToggle.addEventListener('click', () => {
    const open = musicRow.hidden;
    showMusicRow(open);
    if (open) musicInput.focus();
  });
}
if (musicInput) {
  // Gõ/dán -> lên lịch lưu; vẽ lại player khi rời ô hoặc dừng gõ
  musicInput.addEventListener('input', () => {
    renderMusic(musicInput.value);
    markHasMusic(musicInput.value);
    scheduleSave();
  });
  musicInput.addEventListener('change', () => renderMusic(musicInput.value));
}
if (musicClear) {
  musicClear.addEventListener('click', () => {
    musicInput.value = '';
    renderMusic('');
    markHasMusic('');
    scheduleSave();
    musicInput.focus();
  });
}

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

// ===== Chuyển đổi view: lịch / tài liệu =====
function showDoc() {
  if (calView) calView.hidden = true;
  if (docEl) docEl.hidden = false;
  document.body.classList.add('on-doc');
}
async function showCalendar() {
  await flushNow();
  closeSidebar();
  document.body.classList.remove('on-doc');
  if (docEl) docEl.hidden = true;
  if (calView) calView.hidden = false;
  await renderCalendar();
}
if (openCalBtn) openCalBtn.addEventListener('click', showCalendar);

// Nút ← quay lại màn lịch (chỉ hiện ở màn chi tiết trên điện thoại)
const backBtn = document.getElementById('back-btn');
if (backBtn) backBtn.addEventListener('click', showCalendar);

// ===== Menu điện thoại (drawer sidebar) =====
const menuToggle = document.getElementById('menu-toggle');
const sidebarBackdrop = document.getElementById('sidebar-backdrop');
function closeSidebar() { document.body.classList.remove('sidebar-open'); }
if (menuToggle) menuToggle.addEventListener('click', () => document.body.classList.toggle('sidebar-open'));
if (sidebarBackdrop) sidebarBackdrop.addEventListener('click', closeSidebar);

// ===== Lịch tháng =====
const now = new Date();
let calYear = now.getFullYear();
let calMonth = now.getMonth(); // 0-11

function pad2(n) { return String(n).padStart(2, '0'); }

async function renderCalendar() {
  // Lấy toàn bộ ghi chú, gom theo ngày (giữ bài mới nhất mỗi ngày)
  const res = await fetch('/api/entries?limit=200');
  const data = await res.json();
  const byDate = new Map();
  for (const e of data.entries) {
    const date = (e.created_at || '').split(' ')[0];
    if (!date) continue;
    const prev = byDate.get(date);
    if (!prev || e.id > prev.id) byDate.set(date, e);
  }

  calTitle.textContent = `Tháng ${calMonth + 1}, ${calYear}`;

  const firstDow = new Date(calYear, calMonth, 1).getDay(); // 0=CN..6=T7
  const lead = (firstDow + 6) % 7; // số ô trống đầu (tuần bắt đầu T2)
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const today = new Date();
  const isThisMonth = today.getFullYear() === calYear && today.getMonth() === calMonth;

  let html = '';
  for (let i = 0; i < lead; i++) html += '<div class="cal-cell empty"></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${calYear}-${pad2(calMonth + 1)}-${pad2(d)}`;
    const entry = byDate.get(dateStr);
    const isToday = isThisMonth && today.getDate() === d;
    html += `
      <div class="cal-cell${entry ? ' has-entry' : ''}${isToday ? ' today' : ''}"
           ${entry ? `data-id="${entry.id}"` : ''}
           ${entry ? `title="${escapeHtml(displayTitle(entry))}"` : ''}>
        <span class="cal-day">${d}</span>
        <span class="cal-face">${entry ? '🔥' : ''}</span>
      </div>`;
  }
  calGrid.innerHTML = html;
}

calGrid.addEventListener('click', (e) => {
  const id = e.target.closest('.has-entry')?.dataset.id;
  if (id) { showDoc(); selectNote(Number(id)); }
});
calPrev.addEventListener('click', () => {
  calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; }
  renderCalendar();
});
calNext.addEventListener('click', () => {
  calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; }
  renderCalendar();
});

// ===== Ảnh bìa (cột phải của lịch) =====
const coverImg = document.getElementById('cover-img');
const coverPlaceholder = document.getElementById('cover-placeholder');
const coverInput = document.getElementById('cover-input');
const coverStatus = document.getElementById('cover-status');

function showCover(url) {
  if (url) {
    coverImg.src = url;
    coverImg.hidden = false;
    coverPlaceholder.hidden = true;
  } else {
    coverImg.hidden = true;
    coverPlaceholder.hidden = false;
  }
}

// Bấm ảnh bìa để xem phóng to
if (coverImg) coverImg.addEventListener('click', () => openLightbox(coverImg.src));

async function loadCover() {
  try {
    const res = await fetch('/api/cover');
    const data = await res.json();
    showCover(data.url);
  } catch {
    showCover(null);
  }
}

if (coverInput) {
  coverInput.addEventListener('change', async () => {
    const file = coverInput.files[0];
    if (!file) return;

    // Chặn sớm nếu ảnh quá lớn — hiện kích thước thực và giới hạn cho phép
    const tooBig = oversizeError(file);
    if (tooBig) {
      coverStatus.textContent = '⚠ ' + tooBig;
      coverInput.value = '';
      return;
    }

    coverStatus.textContent = 'Đang tải lên…';
    const fd = new FormData();
    fd.append('image', file);
    try {
      const res = await fetch('/api/cover', { method: 'POST', body: fd });
      const data = await readJson(res);
      if (!res.ok) throw new Error(data.error || 'Lỗi');
      showCover(data.url);
      coverStatus.textContent = '✓ Đã cập nhật ảnh';
    } catch (err) {
      coverStatus.textContent = '⚠ ' + err.message;
    } finally {
      coverInput.value = '';
    }
  });
}

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

// ===== Xác thực =====
// Kiểm tra phiên đăng nhập; nếu chưa đăng nhập thì chuyển sang trang login.
async function ensureAuth() {
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();
    if (!data.authenticated) {
      window.location.href = '/login.html';
      return null;
    }
    return data;
  } catch {
    window.location.href = '/login.html';
    return null;
  }
}

function setupAuthUI(me) {
  const nameEl = document.getElementById('user-name');
  if (nameEl && me) nameEl.textContent = me.username;

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await fetch('/api/auth/logout', { method: 'POST' });
      } catch {
        /* vẫn chuyển về login dù lỗi mạng */
      }
      window.location.href = '/login.html';
    });
  }
}

// ===== Khởi động =====
(async function init() {
  const me = await ensureAuth();
  if (!me) return; // đã redirect sang login

  setupAuthUI(me);
  await loadNotes();
  await showCalendar(); // trang chính: hiển thị lịch tháng hiện tại
  loadCover();
  loadWeather();
})();
