# Product Context — Thread-Host

## Tại sao project này tồn tại

Thread-Host là firmware cho Border Router trong hệ thống **HomeThread** — một hệ thống IoT dùng Thread mesh network. BR là cầu nối giữa:
- **Thread network** (các child/router devices 802.15.4)
- **Backbone** (Ethernet) — BR có IP; **dashboard/backend** kết nối tới BR qua **TCP** (frame protocol), không qua USB/serial.

## Vấn đề giải quyết

- **Quản lý network từ xa:** Dashboard đọc network state (role, dataset, IP, tables) qua frame protocol trên TCP
- **Commissioning:** Dashboard add joiner qua CMD_COMMISSIONER_JOINER
- **Resilience:** State watchdog tự restart BR nếu mất kết nối; factory reset qua lệnh hoặc nút bấm
- **Child ↔ Backend:** Child gửi register/update/ping **trực tiếp tới backend** qua IP (CoAP/HTTP); BR chỉ **route** (border routing, prefix) và **quản lý** (dataset, Commissioner), không forward CMD_DATA.

## Cách hoạt động

### Dashboard ↔ BR (kênh quản lý — frame protocol trên TCP)
Dashboard kết nối tới **BR_IP:port** (mặc định 5000). Gửi/nhận frame (SOF/CMD/DATA/EOF). Dashboard pull state, dataset, tables; BR trả ACK/data. **Chỉ** quản lý BR — không push child data.

### Child ↔ Backend
Child (Thread-Node) sau khi join và có IPv6 routable gửi register/update/ping **trực tiếp** tới backend (IP:port). Backend listen trên IP; BR không làm proxy.

## UX Goals

- Dashboard control BR qua TCP (cùng mạng với BR)
- BR tự phục hồi khi mất kết nối (watchdog)
- Factory reset an toàn qua lệnh hoặc nút bấm
- LED hiển thị trạng thái network
- Backhaul: Chỉ Ethernet W5500 khi bật (chỉ LAN, không Wi‑Fi)
