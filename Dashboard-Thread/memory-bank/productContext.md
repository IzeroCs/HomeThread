# Product Context — Dashboard-Thread

## Why This Project Exists

OpenThread Border Router (BR) cần được điều khiển và giám sát từ xa. Project này kết nối tới BR qua **TCP** (frame protocol), cung cấp giao diện web trực quan để quản lý Thread network. BR có thể là hostname (vd. Thread-Host.local) hoặc IP, port mặc định 5000.

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
2. Vào Settings → BR Connection → nhập host (vd. Thread-Host.local) + port (5000) → Test Connect → Save
3. Backend tự động kết nối TCP tới BR và bắt đầu poll CMD_STATE mỗi 5s
4. Nếu `thread_run_on_connect = true` và state = disabled → tự khởi động Thread
5. Xem trạng thái real-time ở tab Status
6. Xem Router/Child Table ở Dashboard (tự poll 6s khi đang active)
7. Quản lý Commissioner → thêm joiner với EUI64 + PSKd
8. Điều chỉnh config ở Settings → OpenThread → Apply

### UX Goals

- **Không cần reload** — tất cả data đến qua WebSocket
- **Feedback ngay lập tức** — Toast notification cho mọi action (success/error)
- **Modal xác nhận** — cho các action nguy hiểm (Reset, Factory Reset) với countdown 5s
- **Trực quan** — Sidebar trái với brand "OpenThread" và status dot đổi màu theo thread state (xanh/tím/xanh dương/cam/xám)
- **Status khi mất kết nối BR** — Card BR compact (icon đỏ + DISCONNECTED), OpenThread hiển thị ghost grid + overlay "No Network Data Available" và nút "Configure Border Router" dẫn tới Settings
- **Leader highlight** — Row của leader trong Router Table nổi bật màu xanh lá
- **Age counter** — Cột Age đếm lên realtime không cần backend poll liên tục

## Pages / Tabs

| Tab | Nội dung |
|---|---|
| Status | BR connection (host:port), OT config đầy đủ (PAN ID, Channel, Network Name, …), thread state, version từ package.json; **System**: IPv4 và IPv6 của backend (để Thread-Node/SRP tham chiếu). |
| Nodes | Router Table + Child Table + Joiner List (thiết bị đang chờ join); nút "Commission Node" mở modal thêm joiner (EUI64/PSKd/timeout); leader badge, age counter, empty states |
| Settings / BR Connection | Host, port, test connect |
| Settings / OpenThread | Cấu hình network + toggle khởi động Thread |
| Settings / System | Action cards (Khởi động lại, Factory Reset) + danger divider; modal xác nhận countdown 5s |

Console đã bỏ. Commissioner gộp vào Nodes (modal Commission Node + Joiner List).

## Thread-Node (child) gửi dữ liệu

Thiết bị child/endpoint (**Thread-Node**) gửi dữ liệu **trực tiếp tới backend** qua IP: **CoAP** (UDP 5683), payload **CBOR**. BR chỉ route IP. Backend parse CBOR, chỉ gửi subset (type, rloc16, timestamp, summary) lên frontend. Hướng dẫn cho firmware: [docs/coap/thread_node_coap.md](../docs/coap/thread_node_coap.md).
