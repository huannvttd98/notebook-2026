# 📔 Notebook — Memory

Web app ghi chép kiểu Notion mang tên Memory. Nhẹ, chạy tốt trên server nhỏ (**1 core / 1GB RAM / 20GB**).

- **Backend:** Node.js + Express
- **Database:** SQLite (better-sqlite3) — file `db/notebook.db`, không cần DB server riêng
- **Frontend:** HTML + Vanilla JS (không cần build)
- **Bảo mật:** helmet + nén gzip + **đăng nhập đa người dùng** (mỗi tài khoản có không gian Memory riêng)

## Tính năng

- **Tài khoản**: đăng ký (tài khoản + email + mật khẩu), đăng nhập, quên mật khẩu qua email
- Mỗi user chỉ thấy ghi chú & ảnh bìa của riêng mình
- Sidebar liệt kê ghi chú + tìm kiếm; trang tài liệu tự động lưu (auto-save)
- Đánh giá cảm xúc bằng icon 😢🙁😐🙂😄
- **Lịch tháng**: mỗi ngày hiện cảm xúc của ghi chú; bên cạnh là **ảnh bìa** tải lên từ máy
- **Nhạc theo ghi chú**: dán link YouTube/Spotify (nút 🎵) để nhúng trình phát ngay trong ghi chú
- Widget **thời tiết** theo thành phố cấu hình (Open-Meteo, miễn phí)

---

## Chạy ở máy local

```bash
npm install

# Tạo file .env từ mẫu rồi chỉnh nếu cần (PORT, WEATHER_CITY, SESSION_SECRET)
cp .env.example .env      # Windows: copy .env.example .env

npm start                 # Mở http://localhost:3100 → tự chuyển sang trang đăng nhập
```

> Mở app lần đầu sẽ vào **/login.html**. Bấm **Tạo tài khoản** để đăng ký user đầu tiên
> (tài khoản này sẽ "nhận" toàn bộ ghi chú & ảnh bìa cũ nếu DB đã có dữ liệu từ trước).
> Khi dev chưa cấu hình SMTP, link "Quên mật khẩu" được **in ra console** thay vì gửi email.

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
nano .env                 # đặt WEATHER_CITY, NODE_ENV=production (PORT mặc định 3100)

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

> **Giới hạn upload:** app nhận ảnh tối đa **50MB**; Nginx đã đặt `client_max_body_size 60M` trong [deploy/nginx.conf](deploy/nginx.conf).

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
server.js                 # Điểm vào: Express app (session + serve trang auth)
src/db.js                 # Kết nối SQLite + migration (entries, settings, users, password_resets)
src/auth.js               # API /api/auth/* : đăng ký, đăng nhập, quên/đặt lại mật khẩu
src/mailer.js             # Gửi email đặt lại mật khẩu (nodemailer)
src/routes/entries.js     # API CRUD ghi chú (lọc theo user_id)
src/routes/weather.js     # Proxy thời tiết Open-Meteo (cache 10 phút)
src/routes/cover.js       # Upload/lấy ảnh bìa theo từng user (multer)
public/                   # Frontend: index.html, app.js, style.css
public/login.html …       # Trang đăng nhập / đăng ký / quên & đặt lại mật khẩu (+ auth.js, auth.css)
public/uploads/           # Ảnh người dùng tải lên (gitignored)
ecosystem.config.js       # Cấu hình PM2
deploy/nginx.conf         # Mẫu Nginx reverse proxy
docs/PLAN.md              # Kế hoạch
```

---

## Tài khoản & đăng nhập

- **Đăng ký** tại `/register.html`: cần **tài khoản** (3–30 ký tự: chữ thường, số, `_`, `.`),
  **email** (để khôi phục mật khẩu) và **mật khẩu** (≥ 8 ký tự). Đăng nhập bằng **tài khoản**.
- Mỗi user chỉ truy cập ghi chú & ảnh bìa của mình; API dữ liệu yêu cầu đăng nhập (trả 401 nếu chưa).
- **Quên mật khẩu** (`/forgot.html`): nhập email → nhận link đặt lại (hết hạn **1 giờ**, dùng 1 lần).

### Cấu hình bắt buộc trong `.env`

| Biến | Ý nghĩa |
|---|---|
| `SESSION_SECRET` | Chuỗi ngẫu nhiên dài để ký cookie phiên (BẮT BUỘC đổi) |
| `APP_URL` | URL gốc của app, dùng dựng link reset trong email (vd `https://yourdomain.com`) |
| `SMTP_HOST/PORT/USER/PASS`, `MAIL_FROM` | Cấu hình gửi email reset. **Bỏ trống `SMTP_HOST`** khi dev → link reset in ra console. |

> Tạo `SESSION_SECRET`: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
