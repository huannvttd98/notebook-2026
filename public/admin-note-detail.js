'use strict';

const subtitleEl = document.getElementById('detail-subtitle');
const backLinkEl = document.getElementById('back-to-notes');
const ownerEl = document.getElementById('note-owner');
const createdEl = document.getElementById('note-created');
const updatedEl = document.getElementById('note-updated');
const shareCountEl = document.getElementById('note-share-count');
const titleEl = document.getElementById('note-title');
const tagsEl = document.getElementById('note-tags');
const mediaEl = document.getElementById('note-media');
const imagesWrapEl = document.getElementById('note-images-wrap');
const imagesEl = document.getElementById('note-images');
const musicWrapEl = document.getElementById('note-music-wrap');
const musicPlayerEl = document.getElementById('note-music-player');
const contentEl = document.getElementById('note-content');
const historyStatusEl = document.getElementById('history-status');
const historyListEl = document.getElementById('history-list');
const historyCountEl = document.getElementById('history-count');

const FACES = ['😢', '🙁', '😐', '🙂', '😄'];

// Các trường được theo dõi trong lịch sử + nhãn hiển thị
const HISTORY_FIELDS = [
  ['title', 'Tiêu đề'],
  ['content', 'Nội dung'],
  ['mood', 'Cảm xúc'],
  ['rating', 'Mức cảm xúc (cũ)'],
  ['music', 'Nhạc đính kèm'],
];

function noteTitle(note) {
  if (note.title?.trim()) return note.title.trim();
  if (note.content?.trim()) return note.content.trim().split('\n')[0].slice(0, 60);
  return '(không tiêu đề)';
}

function formatDate(value) {
  return value || '—';
}

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (char) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])
  );
}

function buildBackLink(params) {
  const query = new URLSearchParams();
  const search = params.get('search') || '';
  const userId = params.get('userId') || '';
  if (search) query.set('search', search);
  if (userId) query.set('userId', userId);
  return '/admin-notes.html' + (query.size ? '?' + query.toString() : '');
}

function renderTags(note) {
  const tags = [];
  if (note.mood && String(note.mood).trim()) {
    tags.push(`<span class="note-detail-tag">${escapeHtml(String(note.mood).trim())} Cảm xúc</span>`);
  } else if (note.rating >= 1 && note.rating <= 5) {
    tags.push(`<span class="note-detail-tag">${FACES[note.rating - 1]} Cảm xúc ${note.rating}/5</span>`);
  }
  if (note.music) {
    tags.push('<span class="note-detail-tag">🎵 Có nhạc đính kèm</span>');
  }
  if (note.images && note.images !== '[]') {
    tags.push('<span class="note-detail-tag">🖼 Có ảnh đính kèm</span>');
  }
  tagsEl.innerHTML = tags.join('');
}

function parseImages(images) {
  try {
    const parsed = typeof images === 'string' ? JSON.parse(images) : images;
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string' && item) : [];
  } catch {
    return [];
  }
}

function musicEmbed(url) {
  const value = (url || '').trim();
  if (!value) return '';
  let match = value.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
  if (match) return `https://www.youtube.com/embed/${match[1]}`;
  match = value.match(/open\.spotify\.com\/(?:intl-\w+\/)?(track|album|playlist|episode|show)\/(\w+)/);
  if (match) return `https://open.spotify.com/embed/${match[1]}/${match[2]}`;
  return '';
}

function renderMedia(note) {
  const images = parseImages(note.images);
  const musicUrl = (note.music || '').trim();
  const embed = musicEmbed(musicUrl);

  mediaEl.hidden = !images.length && !musicUrl;

  if (images.length) {
    imagesWrapEl.hidden = false;
    imagesEl.innerHTML = images
      .map((url) => `<a class="note-detail-image-link" href="${escapeHtml(url)}" target="_blank" rel="noreferrer">
        <img class="note-detail-image" src="${escapeHtml(url)}" alt="Ảnh đính kèm" />
      </a>`)
      .join('');
  } else {
    imagesWrapEl.hidden = true;
    imagesEl.innerHTML = '';
  }

  if (musicUrl) {
    musicWrapEl.hidden = false;
    if (embed) {
      const isSpotify = embed.includes('spotify');
      const frameStyle = isSpotify
        ? 'height:152px;width:100%'
        : 'aspect-ratio:16/9;width:100%;height:auto';
      musicPlayerEl.innerHTML =
        `<iframe src="${escapeHtml(embed)}" style="${frameStyle};border:0;border-radius:12px" ` +
        'loading="lazy" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" ' +
        'allow="autoplay; encrypted-media; clipboard-write; fullscreen; picture-in-picture"></iframe>' +
        `<a class="note-detail-music-link" href="${escapeHtml(musicUrl)}" target="_blank" rel="noreferrer">Mở link nhạc gốc</a>`;
    } else {
      musicPlayerEl.innerHTML = `<a class="note-detail-music-link" href="${escapeHtml(musicUrl)}" target="_blank" rel="noreferrer">Mở nhạc đính kèm</a>`;
    }
  } else {
    musicWrapEl.hidden = true;
    musicPlayerEl.innerHTML = '';
  }
}

// Giá trị 1 trường ở dạng chuỗi hiển thị (cảm xúc hiện kèm mặt cười)
function fieldDisplay(field, value) {
  if (field === 'rating') {
    const n = Number.parseInt(value, 10) || 0;
    return n >= 1 && n <= 5 ? `${FACES[n - 1]} ${n}/5` : 'Không';
  }
  const str = String(value == null ? '' : value).trim();
  return str || '(trống)';
}

// So sánh 2 giá trị của cùng 1 trường (chuẩn hóa để bỏ qua null vs '')
function sameValue(field, a, b) {
  if (field === 'rating') return (Number.parseInt(a, 10) || 0) === (Number.parseInt(b, 10) || 0);
  return String(a == null ? '' : a) === String(b == null ? '' : b);
}

// Render 1 mốc lịch sử. `prev` là phiên bản cũ hơn liền kề (null nếu là bản đầu).
function renderRevision(rev, prev) {
  const isCreate = rev.action === 'create' || !prev;
  const badge = isCreate
    ? '<span class="history-badge history-badge-create">Tạo mới</span>'
    : '<span class="history-badge history-badge-update">Cập nhật</span>';
  const editor = rev.editor_username
    ? escapeHtml(rev.editor_username)
    : '<em>(người dùng đã xóa)</em>';

  let changesHtml;
  if (isCreate) {
    // Bản đầu tiên: liệt kê các trường có nội dung
    const rows = HISTORY_FIELDS.filter(([f]) => {
      if (f === 'rating') return (Number.parseInt(rev[f], 10) || 0) > 0;
      return String(rev[f] == null ? '' : rev[f]).trim() !== '';
    }).map(([f, label]) => `
        <div class="history-change">
          <span class="history-field">${label}</span>
          <div class="history-values">
            <span class="history-new">${escapeHtml(fieldDisplay(f, rev[f]))}</span>
          </div>
        </div>`);
    changesHtml = rows.length
      ? rows.join('')
      : '<p class="history-nochange">Ghi chú trống khi tạo.</p>';
  } else {
    const rows = HISTORY_FIELDS.filter(([f]) => !sameValue(f, prev[f], rev[f])).map(
      ([f, label]) => `
        <div class="history-change">
          <span class="history-field">${label}</span>
          <div class="history-values">
            <span class="history-old">${escapeHtml(fieldDisplay(f, prev[f]))}</span>
            <span class="history-arrow">→</span>
            <span class="history-new">${escapeHtml(fieldDisplay(f, rev[f]))}</span>
          </div>
        </div>`
    );
    changesHtml = rows.length
      ? rows.join('')
      : '<p class="history-nochange">Lưu lại nhưng nội dung không đổi.</p>';
  }

  return `
    <li class="history-item">
      <div class="history-item-head">
        ${badge}
        <span class="history-time">${escapeHtml(rev.created_at || '—')}</span>
        <span class="history-editor">bởi <strong>${editor}</strong></span>
      </div>
      <div class="history-changes">${changesHtml}</div>
    </li>`;
}

async function loadHistory(id) {
  try {
    const res = await fetch(`/api/admin/notes/${id}/history`);
    if (!res.ok) throw new Error('fail');
    const data = await res.json();
    const revisions = Array.isArray(data.revisions) ? data.revisions : [];

    if (!revisions.length) {
      historyStatusEl.textContent = 'Chưa có lịch sử thay đổi nào được ghi lại.';
      historyListEl.innerHTML = '';
      historyCountEl.hidden = true;
      return;
    }

    historyStatusEl.hidden = true;
    historyCountEl.hidden = false;
    historyCountEl.textContent = `${revisions.length} bản ghi`;
    // revisions: mới nhất -> cũ nhất. Bản cũ hơn liền kề là phần tử kế tiếp.
    historyListEl.innerHTML = revisions
      .map((rev, i) => renderRevision(rev, revisions[i + 1] || null))
      .join('');
  } catch {
    historyStatusEl.textContent = 'Không tải được lịch sử thay đổi.';
  }
}

async function loadNote() {
  const params = new URLSearchParams(globalThis.location.search);
  const id = Number.parseInt(params.get('id'), 10);
  backLinkEl.href = buildBackLink(params);

  if (!Number.isInteger(id) || id <= 0) {
    subtitleEl.textContent = 'Thiếu ID ghi chú hợp lệ';
    titleEl.textContent = 'Không thể tải ghi chú';
    contentEl.textContent = 'URL hiện tại không chứa ID ghi chú hợp lệ.';
    return;
  }

  try {
    const meRes = await fetch('/api/auth/me');
    const me = await meRes.json();
    if (!me.authenticated) {
      globalThis.location.href = '/login.html';
      return;
    }
    if (!me.isAdmin) {
      globalThis.location.href = '/';
      return;
    }

    const res = await fetch(`/api/admin/notes/${id}`);
    if (res.status === 404) {
      subtitleEl.textContent = 'Ghi chú không tồn tại';
      titleEl.textContent = 'Không tìm thấy ghi chú';
      contentEl.textContent = 'Ghi chú này có thể đã bị xóa hoặc không còn khả dụng.';
      return;
    }
    if (!res.ok) throw new Error('fail');

    const data = await res.json();
    const note = data.note;
    subtitleEl.textContent = 'Xem chi tiết đầy đủ nội dung, thông tin chủ sở hữu và trạng thái chia sẻ.';
    ownerEl.textContent = note.owner_username || '(không rõ)';
    createdEl.textContent = formatDate(note.created_at);
    updatedEl.textContent = formatDate(note.updated_at);
    shareCountEl.textContent = String(note.share_count || 0);
    titleEl.textContent = noteTitle(note);
    renderMedia(note);
    contentEl.textContent = note.content || '';
    renderTags(note);
    loadHistory(id);
  } catch {
    subtitleEl.textContent = 'Lỗi tải ghi chú';
    titleEl.textContent = 'Không thể hiển thị chi tiết';
    contentEl.textContent = 'Đã xảy ra lỗi khi tải ghi chú. Vui lòng thử lại.';
  }
}

loadNote();
