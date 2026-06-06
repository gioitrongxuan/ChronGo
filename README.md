# ChronGo

Ứng dụng đếm ngược đa mục tiêu với thống kê thời gian làm việc.

**Live:** https://chrongo.streamdy.com

## Tính năng

- **Đa bộ đếm ngược** — tạo nhiều mục tiêu, mỗi mục có tên, thời gian và màu riêng
- **Thống kê** — biểu đồ cột, Gantt chart, breakdown theo mục tiêu, phân tích AI (DeepSeek)
- **Âm thanh báo giờ** — 5 tùy chọn: Tắt tiếng, Bíp, Ding, Chuông gió, Báo thức (Web Audio API)
- **Đăng nhập Google** — data sync lên Supabase, truy cập từ nhiều thiết bị
- **Offline-first** — hoạt động không cần đăng nhập, lưu vào localStorage

## Stack

| Thành phần | Công nghệ |
|-----------|-----------|
| Frontend | HTML/CSS/JS thuần (không framework) |
| Auth | Google Identity Services + Supabase Auth |
| Database | Supabase (Postgres + RLS) |
| AI | DeepSeek API qua Supabase Edge Function |
| Hosting | Nginx trên VPS (`/var/www/chrongo`) |

## Cấu trúc

```
chrongo/
├── index.html       # Toàn bộ markup
├── style.css        # Styles (dark theme)
├── app.js           # Logic chính
└── nginx/
    └── chrongo.conf # Nginx config cho chrongo.streamdy.com
```

## Deploy

Copy 3 file tĩnh lên server:

```bash
scp index.html style.css app.js user@server:/var/www/chrongo/
```

Nginx config đặt tại `/etc/nginx/sites-available/chrongo.conf`, SSL qua Let's Encrypt.

## Supabase

Hai bảng: `targets` và `sessions`, cả hai bật RLS với policy `auth.uid() = user_id`.

AI analysis chạy qua Edge Function `analyze-sessions` (gọi DeepSeek, không expose API key ra client).

## Data flow

- **Chưa đăng nhập**: lưu localStorage theo key `chrongo_v1` / `chrongo_sessions_v1`
- **Đăng nhập**: key đổi thành `chrongo_v1_<userId>`, sync hai chiều với Supabase
- **Lần đầu đăng nhập**: nếu Supabase rỗng, data local được backfill lên cloud tự động
