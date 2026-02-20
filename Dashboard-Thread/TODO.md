# TODO – Điều khiển OpenThread qua UART (ESP32-H2, frame protocol)

Phần đã triển khai được tóm tắt trong [README.md](./README.md). Dưới đây chỉ liệt kê **việc chưa làm** và gợi ý thứ tự.

---

## Frame protocol & kiến trúc

- [x] Bỏ CLI; giao tiếp chỉ còn frame USB CDC.
- [x] Thư mục `communicate/`: SerialPort, SerialConfigService, frame (constants, crc8, frameBuilder, frameParser), CommunicateManager, OtConfigManager, PollingManager.
- [x] Serial raw mode, parse/gửi frame, CMD_ACK/CMD_NACK → cache, Pull (CMD_PING, CMD_* config), polling + keepalive.
- [x] WebSocketServer chỉ emit; Main khởi tạo io + CommunicateManager, `connectIfConfigured()` khi listen.
- [ ] **CMD_DATA (CBOR)**: Parse CBOR từ CMD_DATA để cập nhật thread state / router-child-joiner table (khi firmware gửi).
- [ ] **Set config / commissioner qua frame**: Khi firmware hỗ trợ CMD tương ứng.

Chi tiết: [docs/migration_to_frame_protocol.md](docs/migration_to_frame_protocol.md).

---

## Backend

- [x] Serial/UART (serialport), WebSocket (socket.io), cấu hình (dotenv, .env.example), DB SQLite (Settings), CORS, commissioner event `commissioner:connect` / `commissioner:connect:result` (logic set config/joiner qua frame khi firmware hỗ trợ).
- [ ] **Bảo mật (nếu cần)**: Auth cho API, HTTPS, giới hạn IP nếu chạy trong mạng nội bộ.

---

## Frontend

- [x] Status, Dashboard (Router/Child table, Modal RLOC16), Commissioner (EUI64/PSK, timeout 30–500s), Console (log serial hex, 320px), Settings, form thống nhất, TopNav symbol màu, LAN (Vite host + proxy).
- [ ] **Settings – Khởi động Thread**: Checkbox "Khởi động Thread" chỉ áp dụng khi nhấn "Áp dụng"; checkbox chỉ cập nhật state form, gửi lệnh start/stop khi nhấn "Áp dụng".
- [ ] **Trang Status**: Giảm tần suất / debounce getOtConfig khi state leader (tránh gửi quá nhiều lệnh).
- [ ] **Lệnh thường dùng**: Nút shortcut (`state`, `scan`, `joiner start/stop`, `commissioner start/stop`, `networkname`, …).
- [ ] **Lịch sử lệnh**: Lưu và chọn lại lệnh đã gửi (localStorage hoặc session).
- [ ] **Live terminal**: Tab/mode hiển thị mọi dòng từ UART realtime, vẫn gửi lệnh từ cùng giao diện (khi backend hỗ trợ).

---

## Tích hợp & vận hành

- [x] Cách chạy (README), tài liệu cơ bản.
- [ ] **Quyền cổng serial (Linux)**: User trong group `dialout` hoặc rule udev cho USB serial ESP32-H2.
- [ ] **WebSocket**: Sửa lỗi kết nối 1 lần nhưng báo kết nối nhiều lần.

---

## Thứ tự làm gợi ý

1. [x] Backend: Serial + frame protocol, WebSocket, CommunicateManager, connectIfConfigured.
2. [x] Frontend: Status, Dashboard, Commissioner, Console, Settings, form thống nhất, Modal/TopNav.
3. [ ] CMD_DATA (CBOR) → cập nhật state/tables khi firmware gửi.
4. [ ] Set config / commissioner qua frame (khi firmware có CMD).
5. [ ] Settings checkbox "Khởi động Thread" chỉ áp dụng khi "Áp dụng".
6. [ ] Shortcut lệnh, lịch sử lệnh, Live terminal (tùy nhu cầu).

---

Chi tiết đã triển khai: **xem README.md**.
