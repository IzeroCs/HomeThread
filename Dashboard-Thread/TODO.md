# TODO – Điều khiển OpenThread qua TCP (frame protocol)

Phần đã triển khai được mô tả trong [README.md](./README.md). Dưới đây chỉ liệt kê **việc còn lại**.

---

## Frame protocol & kiến trúc

- [x] **Child data**: Đã triển khai — Thread-Node gửi trực tiếp tới backend qua **CoAP** (UDP 5683), payload **CBOR**. Backend parse, emit subset. Xem [docs/coap/thread_node_coap.md](./docs/coap/thread_node_coap.md).
- [x] **SRP register**: Backend gửi CMD_SRP_REGISTER (0x44) qua frame khi BR là leader; Thread-Node có thể discovery `_dashboard._udp`. Status section **System** (IPv4/IPv6 backend). Backend log IPv6/hostname/port khi gửi (transportLogger).

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

Chi tiết đã triển khai: **xem README.md**, [docs/coap/thread_node_coap.md](./docs/coap/thread_node_coap.md) (Thread-Node + SRP discovery), [docs/architecture/real_br_integration.md](./docs/architecture/real_br_integration.md) (SRP/DNS-SD), và [Documents/dashboard/migration_to_frame_protocol.md](../Documents/dashboard/migration_to_frame_protocol.md).
