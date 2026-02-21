# Product Context — Thread-Host

## Tại sao project này tồn tại

Thread-Host là firmware cho Border Router trong hệ thống **HomeThread** — một hệ thống IoT dùng Thread mesh network. BR là cầu nối giữa:
- **Thread network** (các child/router devices 802.15.4)
- **Backend/Node** (chạy trên máy tính hoặc gateway, kết nối qua USB CDC)

## Vấn đề giải quyết

- **Quản lý network từ xa:** Backend cần đọc network state (role, dataset, IP, tables) mà không cần CLI
- **Commissioning:** Backend add joiner vào network qua lệnh
- **Nhận dữ liệu từ child devices:** CoAP server trên BR nhận payload từ child và relay lên backend
- **Resilience:** State watchdog tự restart BR nếu mất kết nối backend; factory reset qua lệnh hoặc nút bấm

## Cách hoạt động

### Backend → BR (Pull model)
Backend định kỳ gửi `CMD_STATE` như heartbeat. BR trả role. Backend pull data khi cần (dataset, tables, IP...). BR không tự push trừ khi có IP addr pending retry.

### BR → Backend (Push — chưa hoàn thiện)
`CMD_DATA` dự kiến gửi CBOR từ child/router. CoAP device registry nhận payload từ child nhưng chưa forward qua frame.

### Child devices → BR (CoAP)
Child gửi POST đến `/device/register`, `/device/update`, `/device/ping`. BR nhận, log, enqueue — chưa forward lên backend.

## UX Goals

- Backend có thể control hoàn toàn BR qua USB (không cần SSH/CLI)
- BR tự phục hồi khi mất kết nối (watchdog)
- Factory reset an toàn qua lệnh hoặc nút bấm vật lý
- LED hiển thị trực quan trạng thái network
