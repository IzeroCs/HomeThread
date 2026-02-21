# TODO – Điều khiển OpenThread qua UART (ESP32-H2, frame protocol)

Phần đã triển khai được mô tả trong [README.md](./README.md). Dưới đây chỉ liệt kê **việc còn lại**.

---

## Frame protocol & kiến trúc

- [ ] **CMD_DATA (CBOR)**: Parse CBOR từ CMD_DATA để cập nhật thread state / router-child-joiner table khi firmware push.
- [ ] **IP addr khi thread stop**: Khi state chuyển từ leader/router/child → disabled/detached, `ipaddr` không được clear khỏi OtConfig. Cần xử lý clear hoặc giữ nguyên có chủ đích. *(để sau)*
- [ ] **Dataset active trả NACK**: Đôi khi CMD_DATASET_ACTIVE trả NACK thay vì ACK — cần retry hoặc fallback. *(để sau)*

---

## Backend

- [ ] **Bảo mật**: Auth cho API/WebSocket, HTTPS, giới hạn IP nếu chạy trong mạng nội bộ. *(nếu cần)*

---

## Frontend

- [ ] **Settings – toggle "Khởi động Thread"**: Hiện tại toggle gửi start/stop ngay khi bật/tắt. Cân nhắc chỉ áp dụng khi nhấn "Áp dụng".
- [ ] **Shortcut lệnh**: Nút nhanh cho các lệnh thường dùng (state, scan, ...).
- [ ] **Lịch sử lệnh**: Lưu và chọn lại lệnh đã gửi (localStorage).
- [ ] **Live terminal**: Hiển thị mọi byte UART realtime.

---

## Tích hợp & vận hành

- [ ] **Quyền cổng serial (Linux)**: Thêm user vào group `dialout` hoặc tạo udev rule cho USB serial ESP32-H2.
- [ ] **WebSocket log 2 lần khi dev**: Do React Strict Mode mount 2 lần — không phải lỗi, nhưng cần lưu ý khi debug.

---

Chi tiết đã triển khai: **xem README.md** và [docs/migration_to_frame_protocol.md](docs/migration_to_frame_protocol.md).
