# TODO – Điều khiển OpenThread Border Router (OTBR) qua D-Bus

Phần đã triển khai được mô tả trong [README.md](./README.md). Dưới đây chỉ liệt kê **việc còn lại**.

---

## Backend

- [ ] **Bảo mật**: Auth cho API/WebSocket, HTTPS, giới hạn IP nếu chạy trong mạng nội bộ. *(nếu cần)*

---

## Frontend

- [ ] **Shortcut lệnh**: Nút nhanh cho các lệnh thường dùng (state, scan, ...).
- [ ] **Lịch sử lệnh**: Lưu và chọn lại lệnh đã gửi (localStorage).
- [ ] **Live terminal**: Hiển thị mọi byte UART realtime.

---

## Tích hợp & vận hành

- [ ] **WebSocket log 2 lần khi dev**: Do React Strict Mode mount 2 lần — không phải lỗi, nhưng cần lưu ý khi debug.

---

Chi tiết đã triển khai: **xem README.md**, [docs/otbr/dbus_backend.md](./docs/otbr/dbus_backend.md) (OTBR D-Bus).
