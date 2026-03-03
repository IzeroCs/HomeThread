# TODO – Điều khiển OpenThread qua TCP (frame protocol)

Phần đã triển khai được mô tả trong [README.md](./README.md). Dưới đây chỉ liệt kê **việc còn lại**.

---

## Frame protocol & kiến trúc

- [ ] **CMD_DATA (CBOR)**: Parse CBOR từ CMD_DATA để cập nhật thread state / router-child-joiner table khi firmware push.

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

- [ ] **mDNS browse** *(tùy chọn)*: Backend browse `_thread-frame._tcp`, frontend nút "Tìm BR (mDNS)".
- [ ] **WebSocket log 2 lần khi dev**: Do React Strict Mode mount 2 lần — không phải lỗi, nhưng cần lưu ý khi debug.

---

Chi tiết đã triển khai: **xem README.md** và [Documents/dashboard/migration_to_frame_protocol.md](../Documents/dashboard/migration_to_frame_protocol.md).
