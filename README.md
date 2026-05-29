# 📔 Notebook — Nhật ký cá nhân

Web app ghi nhật ký kiểu Notion. Nhẹ, chạy tốt trên server nhỏ (**1 core / 1GB RAM / 20GB**).

- **Backend:** Node.js + Express
- **Database:** SQLite (better-sqlite3) — file `db/notebook.db`, không cần DB server riêng
- **Frontend:** HTML + Vanilla JS (không cần build)
- **Đăng nhập:** Telegram (nhiều người dùng, mỗi người nhật ký riêng) + helmet + gzip

## Tính năng

- **Đăng nhập bằng Telegram**, mỗi user có nhật ký riêng (dữ liệu cách ly hoàn toàn)
- Sidebar liệt kê ghi chú + tìm kiếm; trang tài liệu tự động lưu (auto-save)
- Đánh giá cảm xúc bằng icon 😢🙁😐🙂😄
- **Lịch tháng**: ngày có ghi chú hiện 🔥; bên cạnh là **ảnh bìa** tải lên từ máy
- Widget **thời tiết** theo thành phố cấu hình (Open-Meteo, miễn phí)

> **Local (dev):** Telegram Widget không chạy trên localhost, nên khi `NODE_ENV=development`
> app tự đăng nhập một tài khoản "Local Dev" (có nút "Đăng nhập Local (dev)" ở trang login).
> Đăng nhập Telegram thật chỉ chạy trên server có tên miền HTTPS.

---

## Chạy ở máy local

```bash
npm install

# Tạo file .env từ mẫu rồi chỉnh nếu cần (PORT, WEATHER_CITY)
cp .env.example .env      # Windows: copy .env.example .env

npm start                 # Mở http://localhost:3100
```

---

## Deploy lên Ubuntu/Debian VPS

```bash
# 1. Cài Node LTS + Nginx
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs nginx

# 2. Đưa code lên server (git clone hoặc scp) vào /var/www/notebook
cd /var/www/notebook
npm install --production

# 3. Cấu hình môi trường
cp .env.example .env
nano .env                 # đặt NODE_ENV=production, WEATHER_CITY, SESSION_SECRET,
#                           TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME (xem mục Telegram bên dưới)

# 4. Đảm bảo thư mục dữ liệu tồn tại & ghi được (DB + ảnh upload)
mkdir -p db public/uploads
# Nếu chạy PM2 dưới user riêng, cấp quyền cho user đó:
# sudo chown -R $USER:$USER db public/uploads

# 5. Chạy nền bằng PM2
sudo npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup               # chạy lệnh nó in ra để tự khởi động khi reboot

# 6. Nginx reverse proxy
sudo cp deploy/nginx.conf /etc/nginx/sites-available/notebook
sudo sed -i 's/yourdomain.com/TÊN-MIỀN-CỦA-BẠN/g' /etc/nginx/sites-available/notebook
sudo ln -s /etc/nginx/sites-available/notebook /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 7. SSL miễn phí (Let's Encrypt)
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d TÊN-MIỀN-CỦA-BẠN

# 8. Tường lửa
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

> **Giới hạn upload:** app nhận ảnh tối đa **3MB**; Nginx đã đặt `client_max_body_size 5M` trong [deploy/nginx.conf](deploy/nginx.conf).

### Cập nhật code sau này

```bash
cd /var/www/notebook
git pull                  # hoặc upload lại — KHÔNG ghi đè db/ và public/uploads/
npm install --production
nano .env                 # tăng ASSET_VERSION (vd 1 -> 2) để trình duyệt tải CSS/JS mới
pm2 restart notebook --update-env
```

> `db/` và `public/uploads/` chứa dữ liệu người dùng, đã được `.gitignore` bỏ qua — đừng xóa khi cập nhật.

---

## Sao lưu dữ liệu

Dữ liệu gồm **CSDL** (`db/notebook.db`) và **ảnh đã tải** (`public/uploads/`).

```bash
# Sao lưu CSDL an toàn kể cả khi app đang chạy
sqlite3 db/notebook.db ".backup '/backup/notebook-$(date +%F).db'"

# Sao lưu ảnh
tar czf "/backup/uploads-$(date +%F).tgz" public/uploads
```

Crontab backup hằng ngày lúc 2h sáng:

```bash
0 2 * * * cd /var/www/notebook && sqlite3 db/notebook.db ".backup '/backup/notebook-$(date +\%F).db'" && tar czf "/backup/uploads-$(date +\%F).tgz" public/uploads
```

---

## Cấu trúc dự án

```
server.js                 # Điểm vào: Express app (session, auth, routes)
src/db.js                 # SQLite + migration (entries, settings, users)
src/auth.js               # Đăng nhập Telegram + upsertUser + requireAuth
src/routes/entries.js     # API CRUD nhật ký (cách ly theo user_id)
src/routes/weather.js     # Proxy thời tiết Open-Meteo (cache 10 phút)
src/routes/cover.js       # Ảnh bìa lịch theo từng user (multer)
public/                   # Frontend: index.html, app.js, style.css, login.html, login.js
public/uploads/           # Ảnh người dùng tải lên (gitignored)
ecosystem.config.js       # Cấu hình PM2
deploy/nginx.conf         # Mẫu Nginx reverse proxy
docs/PLAN.md              # Kế hoạch
```

---

## Đăng nhập Telegram (multi-user)

Mỗi người đăng nhập bằng Telegram và có nhật ký riêng (dữ liệu cách ly hoàn toàn).
**Bắt buộc tên miền HTTPS** (Telegram Widget không chạy localhost).

**Tạo bot:**
1. Nhắn [@BotFather](https://t.me/BotFather) → `/newbot` → đặt tên → nhận **bot token**.
2. `/setdomain` → chọn bot → nhập tên miền (vd `nhatky.example.com`). **Bắt buộc**, không có thì nút login không hiện.

**Cấu hình `.env` trên server:**
```
NODE_ENV=production
SESSION_SECRET=<openssl rand -hex 32>
TELEGRAM_BOT_TOKEN=<token từ BotFather>
TELEGRAM_BOT_USERNAME=<tên bot, không có @>
```

**Cơ chế:** Widget gửi dữ liệu kèm `hash` → server xác minh bằng HMAC-SHA256 với bot token
→ tạo/đăng nhập user theo `telegram_id` → session lưu trong SQLite (`better-sqlite3-session-store`,
không mất khi PM2 restart). Người đầu tiên đăng nhập **được gán toàn bộ nhật ký cũ**.

> Thêm **Zalo** sau này: chỉ cần viết route `/auth/zalo/*` + nút login; bảng `users` đã
> dùng `(provider, provider_id)` nên không phải đổi CSDL.

> Ghi chú: file ảnh trong `public/uploads/` phục vụ tĩnh (URL khó đoán nhưng không khóa theo user).
