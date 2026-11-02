# Chùa Online

Trang "chùa online" lấy cảm hứng từ trào lưu đang nổi: bước vào chánh điện, được xếp một chỗ ngồi, lạy Phật (đếm đến 108), thắp hương, thỉnh chuông và ngồi yên. **Không có chat.**

```
chua-online/
├── index.html      ← toàn bộ trang (1 file, không cần thư viện)
└── server/         ← tùy chọn: máy chủ để người thật nhìn thấy nhau
    ├── server.js
    └── package.json
```

## Cách 1 — Chế độ demo (không cần máy chủ)

Chép `index.html` lên hosting tĩnh (GitHub Pages, Netlify, hosting thường…). Chạy ngay.

Ở chế độ này những người ngồi cạnh bạn là **mô phỏng**, trang có ghi rõ "Chế độ demo". Hợp để giới thiệu, thử giao diện.

Nhúng vào trang có sẵn của bạn:

```html
<iframe src="chua-online/index.html" title="Chùa online"
        style="width:100%;height:1150px;border:0;border-radius:22px"></iframe>
```

## Cách 2 — Có người thật (cần chạy máy chủ)

Muốn người thật nhìn thấy nhau thì phải có một máy chủ đang chạy, vì hosting tĩnh không giữ được kết nối.

```bash
cd server
npm install
SEATS=500 npm start        # mở http://localhost:8080 để thử
```

Khi đưa lên mạng:

1. Chạy `server.js` trên một máy chủ có Node 18+ (VPS, Render, Railway, Fly.io…). Cần hỗ trợ **WebSocket** và để tiến trình chạy liên tục.
2. Đặt `ALLOWED_ORIGINS=https://web-cua-ban.com` để chỉ trang của bạn mới kết nối được. Đứng sau nginx hoặc Cloudflare thì đặt thêm `TRUST_PROXY=1`.
3. Trong `index.html`, sửa `SERVER_URL: ""` thành `SERVER_URL: "wss://ten-mien-may-chu.com"`.

Hết chỗ thì người đến sau vào **hàng chờ** và tự có chỗ khi có người rời đi. Nếu trang không nối được máy chủ, nó tự chuyển về chế độ demo và ghi rõ trên màn hình.

## Tùy chỉnh

Phần `CONFIG` ở đầu thẻ `<script>` trong `index.html`:

| Tên | Ý nghĩa |
|---|---|
| `SERVER_URL` | `""` demo · `"auto"` cùng địa chỉ với trang · `"wss://…"` máy chủ riêng |
| `DEMO_SEATS` | số chỗ ngồi ở chế độ demo (mặc định 120) |
| `BOWS_PER_ROUND` | số lạy mỗi vòng (mặc định 108) |

Số chỗ của máy chủ đặt bằng biến môi trường `SEATS` (tối đa 20.000). Màu sắc nằm ở khối `:root` đầu file CSS, dùng cùng bảng màu với trang bài tập tiếng Anh.

## Lưu ý

- Âm thanh chuông và mõ được tạo ngay trong trình duyệt, không cần file âm thanh. Trình duyệt chỉ cho phát sau khi người dùng bấm nút "Vào chùa".
- Máy chủ không lưu gì: không tên, không tài khoản, không log nội dung. Chỉ giữ số thứ tự chỗ ngồi trong bộ nhớ.
- Nếu mở cho công chúng, nên đặt `ALLOWED_ORIGINS` và theo dõi `/health` để biết lượng người.
