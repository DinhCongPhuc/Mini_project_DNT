# VKU Field Survey PWA

Ứng dụng web tiến bộ (Progressive Web App) cho phép sinh viên/nhân viên khảo
sát tình trạng cơ sở vật chất trong khuôn viên trường, **hoạt động đầy đủ
ngay cả khi không có kết nối mạng**. Đây là Mini-Project 1 trong chuỗi bài
tập Phát triển ứng dụng đa nền tảng — bước tiếp theo sẽ đóng gói PWA này
thành APK Android bằng Capacitor.

## Vấn đề & giải pháp

Nhân viên kiểm tra cơ sở vật chất thường di chuyển tới các khu vực mạng yếu
hoặc không có mạng (tầng hầm, sân bãi ngoài trời, phòng thực hành cách ly
sóng...). Một ứng dụng phụ thuộc mạng sẽ mất dữ liệu nếu mất kết nối giữa
chừng. App này giải quyết bằng mô hình **offline-first**:

1. Mọi phiếu kiểm tra được lưu **ngay lập tức vào IndexedDB trên thiết bị**,
   không chờ phản hồi server.
2. Khi có mạng trở lại, dữ liệu được tự động đẩy lên server nền (Background
   Sync), hoặc người dùng có thể bấm "Đồng bộ ngay".
3. Giao diện ứng dụng (HTML/CSS/JS) được Service Worker cache lại, nên app
   mở được ngay cả khi thiết bị đang ở chế độ máy bay.

## Công nghệ sử dụng

| Thành phần | Công nghệ | Vai trò |
|---|---|---|
| Giao diện | HTML/CSS/JS thuần (không framework) | Dễ đọc, dễ port sang Capacitor ở bước tiếp theo |
| Lưu trữ offline | IndexedDB (`js/db.js`) | Lưu bản ghi có cấu trúc + ảnh (Blob), dung lượng lớn, bất đồng bộ |
| Vòng đời offline | Service Worker (`sw.js`) | Cache app shell, chặn/điều hướng request khi offline |
| Đồng bộ nền | Background Sync API | Tự động gửi dữ liệu khi có mạng trở lại, kể cả khi đã đóng tab |
| Khả năng cài đặt | Web App Manifest (`manifest.json`) | Cho phép "Thêm vào màn hình chính" như app gốc |

## Cấu trúc dự án

```
vku-field-survey-pwa/
├── public/                  # Toàn bộ nội dung được deploy
│   ├── index.html            # Giao diện: form khảo sát + nhật ký
│   ├── manifest.json          # Khai báo PWA (icon, tên, màu theme)
│   ├── sw.js                  # Service Worker: cache + background sync
│   ├── css/
│   │   └── style.css
│   ├── js/
│   │   ├── db.js              # Lớp bọc IndexedDB (CRUD bản ghi)
│   │   └── app.js             # Logic UI, form, đồng bộ
│   └── icons/                 # Icon cho manifest (192px, 512px, maskable)
├── gen_icons.py              # Script tạo icon (dev-only, không deploy)
├── wrangler.jsonc            # Cấu hình deploy Cloudflare
└── README.md
```

## Chạy thử ở máy local

Vì app dùng Service Worker, cần chạy qua HTTP server (không mở trực tiếp
file `index.html` bằng `file://`, Service Worker sẽ không hoạt động).

```bash
cd public
python3 -m http.server 8000
```

Sau đó mở **http://localhost:8000**.

(Nếu có Node.js, cũng có thể dùng `npx serve public`.)

## Cách kiểm tra tính năng offline

1. Mở app, chờ vài giây để Service Worker cài đặt xong (kiểm tra ở DevTools
   → Application → Service Workers, trạng thái "activated and is running").
2. Mở DevTools → Network → chọn **Offline**, hoặc bật chế độ máy bay trên
   điện thoại.
3. Tải lại trang — app vẫn mở được bình thường (được phục vụ từ cache).
4. Điền và lưu một phiếu kiểm tra — phiếu xuất hiện ngay trong tab "Nhật ký"
   với trạng thái **"Chờ đồng bộ"** (viền hổ phách).
5. Tắt chế độ Offline — trong vài giây, phiếu tự chuyển sang **"Đã đồng bộ"**
   (viền xanh lá), hoặc bấm nút "Đồng bộ ngay" để đồng bộ thủ công.

## Ghi chú kỹ thuật quan trọng

- **Endpoint đồng bộ demo**: app gửi dữ liệu tới `https://httpbin.org/post`
  chỉ để minh hoạ luồng đồng bộ (endpoint này chỉ echo lại, không lưu trữ
  thật). Khi triển khai thực tế, đổi hằng số `SYNC_ENDPOINT` trong
  `public/js/app.js` và `public/sw.js` sang API backend thật.
- **Background Sync API** hiện chỉ được hỗ trợ đầy đủ trên trình duyệt nền
  Chromium (Chrome, Edge, các trình duyệt Android). Trên Safari/iOS, app vẫn
  hoạt động offline bình thường nhờ IndexedDB + Service Worker, nhưng việc
  đồng bộ sẽ dựa vào sự kiện `online` và nút "Đồng bộ ngay" thay vì tự động
  chạy nền khi đã đóng tab.
- **Ảnh đính kèm** được lưu trực tiếp dưới dạng `Blob` trong IndexedDB (không
  chuyển sang base64), giúp tiết kiệm bộ nhớ và giữ hiệu năng đọc/ghi tốt.

## Deploy lên Cloudflare Pages

```bash
git init
git add .
git commit -m "Initial commit: VKU Field Survey PWA"
git branch -M main
git remote add origin https://github.com/<username>/vku-field-survey-pwa.git
git push -u origin main
```

Sau đó trên [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers &
Pages → Create → Pages → Connect to Git** → chọn repo này. Cloudflare sẽ đọc
`wrangler.jsonc` và tự phục vụ nội dung trong `public/` — không cần build
command vì đây là site tĩnh thuần HTML/CSS/JS.

## Bước tiếp theo

Tuần sau: đóng gói PWA này thành APK Android bằng **Capacitor**, cho phép
cài đặt như app gốc từ Play Store hoặc file APK trực tiếp, đồng thời truy
cập thêm các API thiết bị (camera gốc, GPS, thông báo đẩy...).
