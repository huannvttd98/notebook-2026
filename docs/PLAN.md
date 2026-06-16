# Kế hoạch: Ứng dụng Memory cá nhân (Node.js) + Deploy lên VPS

## Bối cảnh

Xây dựng một web app **1 trang** để ghi chép trên Memory, deploy lên server nhỏ
(**1 core CPU / 1GB RAM / 20GB ổ cứng**).

Quyết định đã chốt:
- **Cá nhân, 1 người** → bảo vệ bằng 1 mật khẩu, không cần hệ thống đăng ký user.
- **SQLite** → file DB nhẹ, không tốn RAM cho DB server riêng, hoàn hảo cho 1GB RAM.
- **Linux VPS (Ubuntu/Debian)** → deploy bằng PM2 + Nginx reverse proxy + SSL Let's Encrypt.

## Lựa chọn kỹ thuật (tối ưu cho server 1 core / 1GB)

| Hạng mục | Lựa chọn | Lý do hợp với server nhỏ |
|---|---|---|
| Backend | Node.js (LTS) + **Express** | Nhẹ, quen thuộc, ít phụ thuộc |
| Database | **better-sqlite3** (SQLite) | Đồng bộ, nhanh, KHÔNG cần process DB riêng → tiết kiệm RAM |
| Frontend | **HTML + Vanilla JS + CSS** (không build) | Không React/webpack → không tốn RAM build |
| Auth | 1 mật khẩu (bcrypt hash trong `.env`) + `express-session` cookie | Đơn giản, đủ cho 1 người |
| Process | **PM2** (1 instance, không cluster) | Chỉ 1 core nên không chạy cluster |
| Reverse proxy | **Nginx** + Let's Encrypt (certbot) | HTTPS, gzip, phục vụ ổn định |
| Bảo mật | `helmet`, `express-rate-limit`, `compression` (gzip) | Bảo vệ + giảm băng thông |

## Cấu trúc thư mục

```
notebook/
├── server.js                 # Khởi tạo Express app, mount routes, serve static
├── package.json
├── .env.example              # PORT, SESSION_SECRET, APP_PASSWORD_HASH
├── .gitignore
├── ecosystem.config.js       # Cấu hình PM2
├── src/
│   ├── db.js                 # Khởi tạo better-sqlite3 + migration (tạo bảng)
│   ├── auth.js               # Middleware kiểm tra session + route login/logout
│   └── routes/
│       └── entries.js        # CRUD API cho ghi chú
├── public/                   # Frontend tĩnh (1 trang)
│   ├── index.html
│   ├── login.html
│   ├── app.js
│   └── style.css
├── scripts/
│   └── set-password.js       # Tạo bcrypt hash từ mật khẩu
├── db/                        # Chứa file notebook.db (gitignored)
└── deploy/
    └── nginx.conf            # Mẫu cấu hình reverse proxy
```

## Database schema (`src/db.js`)

```sql
CREATE TABLE IF NOT EXISTS entries (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT,
  content    TEXT NOT NULL,
  mood       TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_entries_created ON entries(created_at DESC);
```
Bật `PRAGMA journal_mode = WAL`.

## API endpoints

| Method | Path | Mô tả |
|---|---|---|
| POST | `/api/login` | Nhận mật khẩu, so bcrypt hash, tạo session. Có rate-limit. |
| POST | `/api/logout` | Hủy session |
| GET | `/api/entries?search=&page=` | Danh sách (mới nhất trước, phân trang, tìm từ khóa) |
| POST | `/api/entries` | Tạo entry `{title, content, mood}` |
| GET | `/api/entries/:id` | Xem chi tiết |
| PUT | `/api/entries/:id` | Cập nhật |
| DELETE | `/api/entries/:id` | Xóa |

Tất cả `/api/entries*` qua middleware `requireAuth`. Dùng prepared statements chống SQL injection.

## Quy trình Deploy lên Ubuntu VPS

```bash
# 1. Cài Node LTS + Nginx
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs nginx

# 2. Upload code rồi:
cd /var/www/notebook
npm install --production
node scripts/set-password.js   # tạo hash → dán vào .env
cp .env.example .env           # điền SESSION_SECRET, APP_PASSWORD_HASH, PORT=3000

# 3. PM2
sudo npm install -g pm2
pm2 start ecosystem.config.js
pm2 save && pm2 startup

# 4. Nginx reverse proxy
sudo cp deploy/nginx.conf /etc/nginx/sites-available/notebook
sudo ln -s /etc/nginx/sites-available/notebook /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 5. SSL
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com

# 6. Firewall
sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw enable
```

**Backup**: cron copy `db/notebook.db` (`sqlite3 notebook.db ".backup backup.db"`).

## Kiểm thử

1. `npm start` → mở `http://localhost:3000` → đăng nhập.
2. Tạo/sửa/xóa/tìm entry → kiểm tra `db/notebook.db`.
3. Gọi `/api/entries` khi chưa đăng nhập → 401.
4. Sai mật khẩu nhiều lần → rate-limit 429.
5. Trên server: HTTPS hoạt động, `pm2 logs` sạch, reboot → app tự chạy lại.
