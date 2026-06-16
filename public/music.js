'use strict';

// ===== Tiện ích =====
function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

// Tiêu đề hiển thị: tiêu đề, hoặc dòng đầu nội dung, hoặc mặc định
function displayTitle(e) {
  if (e.title && e.title.trim()) return e.title.trim();
  if (e.content && e.content.trim()) return e.content.trim().split('\n')[0].slice(0, 60);
  return 'Không có tiêu đề';
}

// Ngày dạng dd/mm/yyyy từ chuỗi 'YYYY-MM-DD HH:MM:SS'
function formatDate(iso) {
  if (!iso) return '';
  const [date] = iso.split(' ');
  const [y, m, d] = (date || '').split('-');
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

// Đoạn xem trước nội dung ghi chú cho danh sách (gọn 1 dòng)
function notePreview(content) {
  const t = (content || '').trim().replace(/\s+/g, ' ');
  return t.length > 80 ? t.slice(0, 80) + '…' : t;
}

// Chuyển link người dùng -> URL nhúng iframe. Trả '' nếu không nhận dạng được.
function musicEmbed(url) {
  const u = (url || '').trim();
  if (!u) return '';
  let m = u.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
  if (m) return `https://www.youtube.com/embed/${m[1]}`;
  m = u.match(/open\.spotify\.com\/(?:intl-\w+\/)?(track|album|playlist|episode|show)\/(\w+)/);
  if (m) return `https://open.spotify.com/embed/${m[1]}/${m[2]}`;
  return '';
}

// ===== Trạng thái =====
let songs = []; // [{ id, title, url, embed, isSpotify }]
let current = -1;

// ===== Phần tử DOM =====
const playerTitle = document.getElementById('player-title');
const playerProvider = document.getElementById('player-provider');
const playerBody = document.getElementById('player-body');
const playerMeta = document.getElementById('player-meta');
const playerNote = document.getElementById('player-note');
const listEl = document.getElementById('song-list');
const listCount = document.getElementById('list-count');
const emptyState = document.getElementById('empty-state');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');

// ===== Tải danh sách bài nhạc từ các ghi chú =====
async function loadSongs() {
  let entries = [];
  try {
    const res = await fetch('/api/entries?limit=200');
    if (res.status === 401) {
      window.location.href = '/login.html';
      return;
    }
    const data = await res.json();
    entries = data.entries || [];
  } catch {
    entries = [];
  }

  songs = entries
    .map((e) => {
      const embed = musicEmbed(e.music);
      if (!embed) return null;
      return {
        id: e.id,
        title: displayTitle(e),
        content: e.content || '',
        date: e.created_at || '',
        url: e.music,
        embed,
        isSpotify: embed.includes('spotify'),
      };
    })
    .filter(Boolean);

  renderList();
  if (songs.length) {
    play(0, false); // tải sẵn bài đầu (không tự phát do trình duyệt chặn)
  } else {
    showEmpty();
  }
}

function renderList() {
  listCount.textContent = songs.length ? `(${songs.length} bài)` : '';
  listEl.innerHTML = songs
    .map(
      (s, i) => `
      <button type="button" class="song-item" data-i="${i}">
        <span class="song-index">${i + 1}</span>
        <span class="song-main">
          <span class="song-name">${escapeHtml(s.title)}</span>
          <span class="song-sub">
            <span class="song-provider">${s.isSpotify ? 'Spotify' : 'YouTube'}</span>
            ${notePreview(s.content) ? `<span class="song-note-preview">· ${escapeHtml(notePreview(s.content))}</span>` : ''}
          </span>
        </span>
        <span class="song-play">▶</span>
      </button>`
    )
    .join('');
}

function showEmpty() {
  emptyState.hidden = false;
  playerTitle.textContent = '—';
  playerProvider.hidden = true;
  playerBody.innerHTML = '<div class="player-empty"><span>Chưa có bài nào để phát</span></div>';
  playerMeta.hidden = true;
  playerNote.hidden = true;
  prevBtn.disabled = true;
  nextBtn.disabled = true;
}

// ===== Phát 1 bài =====
function play(i, auto = true) {
  if (i < 0 || i >= songs.length) return;
  current = i;
  const s = songs[i];

  const src = s.isSpotify
    ? s.embed
    : s.embed + (s.embed.includes('?') ? '&' : '?') + (auto ? 'autoplay=1' : 'autoplay=0');
  const frameStyle = s.isSpotify ? 'height:352px;width:100%' : 'aspect-ratio:16/9;width:100%;height:auto';

  playerBody.innerHTML =
    `<iframe src="${escapeHtml(src)}" style="${frameStyle}" ` +
    `loading="lazy" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" ` +
    `allow="autoplay; encrypted-media; clipboard-write; fullscreen; picture-in-picture"></iframe>`;

  playerTitle.textContent = s.title;
  playerProvider.textContent = s.isSpotify ? '🟢 Spotify' : '🔴 YouTube';
  playerProvider.hidden = false;

  // Hiển thị ghi chú của bài đang phát
  const dateStr = formatDate(s.date);
  playerMeta.textContent = dateStr ? `📅 ${dateStr}` : '';
  playerMeta.hidden = !dateStr;
  playerNote.textContent = s.content || '';
  playerNote.hidden = !s.content.trim();

  prevBtn.disabled = i <= 0;
  nextBtn.disabled = i >= songs.length - 1;

  highlight();
}

function highlight() {
  listEl.querySelectorAll('.song-item').forEach((el, i) => {
    el.classList.toggle('active', i === current);
  });
}

// ===== Sự kiện =====
listEl.addEventListener('click', (e) => {
  const item = e.target.closest('.song-item');
  if (item) play(Number(item.dataset.i), true);
});
prevBtn.addEventListener('click', () => play(current - 1, true));
nextBtn.addEventListener('click', () => play(current + 1, true));

loadSongs();
