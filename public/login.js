'use strict';

const tgLogin = document.getElementById('tg-login');
const devLogin = document.getElementById('dev-login');
const errorEl = document.getElementById('login-error');

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.hidden = false;
}

async function init() {
  let cfg = {};
  try {
    const res = await fetch('/api/config');
    cfg = await res.json();
  } catch {
    showError('Không kết nối được máy chủ');
    return;
  }

  // Nút Telegram (dựng widget động — script ngoài được CSP cho phép)
  if (cfg.botUsername) {
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://telegram.org/js/telegram-widget.js?22';
    s.setAttribute('data-telegram-login', cfg.botUsername);
    s.setAttribute('data-size', 'large');
    s.setAttribute('data-auth-url', '/auth/telegram');
    s.setAttribute('data-request-access', 'write');
    tgLogin.appendChild(s);
  } else if (!cfg.dev) {
    showError('Server chưa cấu hình TELEGRAM_BOT_USERNAME');
  }

  // Cửa sau dev (local)
  if (cfg.dev) {
    devLogin.hidden = false;
    devLogin.addEventListener('click', async () => {
      try {
        const res = await fetch('/auth/dev-login', { method: 'POST' });
        if (res.ok) window.location.href = '/';
        else showError('Đăng nhập dev thất bại');
      } catch {
        showError('Lỗi kết nối');
      }
    });
  }
}

init();
