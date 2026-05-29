# 📔 Notebook — Nhật ký cá nhân

Web app 1 trang để ghi nhật ký. Nhẹ, chạy tốt trên server nhỏ (**1 core / 1GB RAM / 20GB**).

- **Backend:** Node.js + Express
- **Database:** SQLite (better-sqlite3) — file `db/notebook.db`, không cần DB server riêng
- **Frontend:** HTML + Vanilla JS (không cần build)
- **Bảo mật:** 1 mật khẩu (bcrypt), session cookie, helmet, rate-limit chống brute-force

## Tính năng

- Viết / sửa / xóa nhật ký (tiêu đề, nội dung, tâm trạng)
- Tìm kiếm theo từ khóa + phân trang
- Đăng nhập bằng mật khẩu

---

## Chạy ở máy local

```bash
npm install

# 1. Tạo mật khẩu đăng nhập (in ra hash)
node scripts/set-password.js "matkhaucuaban"

# 2. Tạo file .env từ mẫu, rồi điền giá trị
cp .env.example .env
#   - Dán APP_PASSWORD_HASH vừa tạo
#   - Đặt SESSION_SECRET = chuỗi ngẫu nhiên dài

# 3. Chạy
npm start
# Mở http://localhost:3000
```

> Trên Windows (không có `cp`): dùng `copy .env.example .env`.

---

## Deploy lên Ubuntu/Debian VPS

```bash
# 1. Cài Node LTS + Nginx
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs nginx

# 2. Đưa code lên server (git clone hoặc scp) vào /var/www/notebook
cd /var/www/notebook
npm install --production

# 3. Cấu hình
node scripts/set-password.js "matkhaumanh"
cp .env.example .env
nano .env        # điền APP_PASSWORD_HASH, SESSION_SECRET, đặt NODE_ENV=production

# 4. Chạy nền bằng PM2
sudo npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup      # chạy lệnh nó in ra để tự khởi động khi reboot

# 5. Nginx reverse proxy
sudo cp deploy/nginx.conf /etc/nginx/sites-available/notebook
sudo sed -i 's/yourdomain.com/TÊN-MIỀN-CỦA-BẠN/g' /etc/nginx/sites-available/notebook
sudo ln -s /etc/nginx/sites-available/notebook /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 6. SSL miễn phí (Let's Encrypt)
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d TÊN-MIỀN-CỦA-BẠN

# 7. Tường lửa
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

### Cập nhật code sau này

```bash
cd /var/www/notebook
git pull            # hoặc upload lại
npm install --production
pm2 restart notebook
```

---

## Sao lưu dữ liệu

Toàn bộ dữ liệu nằm trong `db/notebook.db`. Sao lưu an toàn (kể cả khi app đang chạy):

```bash
sqlite3 db/notebook.db ".backup '/backup/notebook-$(date +%F).db'"
```

Đặt vào crontab để backup hằng ngày:

```bash
0 2 * * * cd /var/www/notebook && sqlite3 db/notebook.db ".backup '/backup/notebook-$(date +\%F).db'"
```

---

## Cấu trúc dự án

```
server.js              # Điểm vào: Express app
src/db.js              # Kết nối SQLite + migration
src/auth.js            # Đăng nhập / đăng xuất / bảo vệ route
src/routes/entries.js  # API CRUD nhật ký
public/                # Frontend (index.html, login.html, app.js, style.css)
scripts/set-password.js
ecosystem.config.js    # PM2
deploy/nginx.conf      # Mẫu Nginx
docs/PLAN.md           # Kế hoạch
```
