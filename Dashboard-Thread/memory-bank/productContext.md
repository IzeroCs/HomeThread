# Product Context — Dashboard-Thread

## Why This Project Exists

OpenThread Border Router trên ESP32-H2 cần được điều khiển và giám sát từ xa. CLI text qua serial không đủ linh hoạt và khó tích hợp vào giao diện web. Project này thay thế hoàn toàn CLI bằng **binary frame protocol** qua USB CDC, cung cấp giao diện web trực quan để quản lý Thread network.

## Problems Solved

| Vấn đề cũ (CLI) | Giải pháp (frame protocol) |
|---|---|
| CLI text khó parse, dễ sai | Binary frame với CRC8, ACK/NACK rõ ràng |
| Không có real-time data | WebSocket push từ backend khi có thay đổi |
| Phải SSH vào thiết bị | Giao diện web truy cập từ LAN |
| Không có error handling | Frame ID + pending map + timeout |
| Polling thủ công | PollingManager tự động mỗi 6s |

## How It Should Work

### User Journey

1. Người dùng mở web app từ LAN (port 5173 dev / 3000 prod)
2. Vào Settings → Serial → nhập port + baud rate → Test Connect → Save
3. Backend tự động kết nối serial và bắt đầu poll CMD_STATE mỗi 5s
4. Nếu `thread_run_on_connect = true` và state = disabled → tự khởi động Thread
5. Xem trạng thái real-time ở tab Status
6. Xem Router/Child Table ở Dashboard (tự poll 6s khi đang active)
7. Quản lý Commissioner → thêm joiner với EUI64 + PSKd
8. Điều chỉnh config ở Settings → OpenThread → Apply

### UX Goals

- **Không cần reload** — tất cả data đến qua WebSocket
- **Feedback ngay lập tức** — Toast notification cho mọi action (success/error)
- **Modal xác nhận** — cho các action nguy hiểm (Reset, Factory Reset) với countdown 5s
- **Trực quan** — TopNav symbol đổi màu theo thread state (xanh/tím/xanh dương/cam/xám)
- **Leader highlight** — Row của leader trong Router Table nổi bật màu xanh lá
- **Age counter** — Cột Age đếm lên realtime không cần backend poll liên tục

## Pages / Tabs

| Tab | Nội dung |
|---|---|
| Status | Serial status, OT config đầy đủ (PAN ID, Channel, Network Name, Ext PAN ID, Mesh Local Prefix, Network Key, IP addr, Thread Version), thread state |
| Dashboard | Router Table + Child Table với modal chi tiết, leader highlight, age counter |
| Commissioner | Form thêm joiner (EUI64/PSKd/timeout), danh sách joiner + countdown expiration |
| Console | Raw hex data từ serial |
| Settings / Serial | Port, baud rate, test connect |
| Settings / OpenThread | Cấu hình network + toggle khởi động Thread |
| Settings / System | Reset + Factory Reset với countdown |
