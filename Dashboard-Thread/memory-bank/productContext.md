# Product Context — Dashboard-Thread

## Why This Project Exists

OpenThread Border Router (OTBR) cần được điều khiển và giám sát từ xa. Project này kết nối tới OTBR qua **D-Bus** (otbr-agent trong container), cung cấp giao diện web trực quan để quản lý Thread network.

## Problems Solved

| Vấn đề cũ (CLI) | Giải pháp (D-Bus + WebSocket) |
|---|---|
| CLI text khó parse, dễ sai | D-Bus API otbr-agent (getState, dataset, attach, tables, …) |
| Không có real-time data | WebSocket push từ backend; OTBR PropertiesChanged signal → cập nhật khi có thay đổi |
| Phải SSH vào thiết bị | Giao diện web truy cập từ LAN |
| Polling thủ công | D-Bus signals + PollingManager tables khi cần |

## How It Should Work

### User Journey

1. Người dùng mở web app từ LAN (port 5173 dev / 3000 prod)
2. Backend kết nối OTBR qua D-Bus (khi chạy backend trong Docker: volume otbr-dbus chung với OTBR; backend trên host không thấy OTBR). Settings → BR Connection hiển thị trạng thái OTBR + nút Test
3. Khi OTBR có, backend đăng ký D-Bus signal (PropertiesChanged); khi state thay đổi → pull state/dataset một lần; fallback poll chậm (vd. 30s) chỉ để kiểm tra OTBR còn sống
4. Nếu `thread_run_on_connect = true` và state = disabled → tự gọi Attach
5. Xem trạng thái real-time ở tab Status
6. Xem Router/Child Table ở Nodes (poll 6s khi đang active và có frontend)
7. Quản lý Commissioner → thêm joiner với EUI64 + PSKd
8. Điều chỉnh config ở Settings → OpenThread → Apply

### UX Goals

- **Không cần reload** — tất cả data đến qua WebSocket
- **Feedback ngay lập tức** — Toast notification cho mọi action (success/error)
- **Modal xác nhận** — cho các action nguy hiểm (Reset, Factory Reset) với countdown 5s
- **Trực quan** — Sidebar trái với brand "OpenThread" và status dot đổi màu theo thread state (xanh/tím/xanh dương/cam/xám)
- **Status khi OTBR không có** — Card BR compact (icon đỏ + DISCONNECTED/Unavailable), OpenThread hiển thị ghost grid + overlay "No Network Data Available" và nút "Configure Border Router" dẫn tới Settings
- **Leader highlight** — Row của leader trong Router Table nổi bật màu xanh lá
- **Age counter** — Cột Age đếm lên realtime không cần backend poll liên tục

## Pages / Tabs

| Tab | Nội dung |
|---|---|
| Status | Kết nối OTBR (D-Bus), OT config (PAN ID, Channel, Network Name, …), thread state, version từ package.json; **System**: IPv4 và IPv6 của backend (để Thread-Node/SRP tham chiếu). |
| Nodes | Router Table + Child Table + Joiner List (thiết bị đang chờ join); nút "Commission Node" mở modal thêm joiner (EUI64/PSKd/timeout); leader badge, age counter, empty states |
| Settings / BR Connection | Trạng thái OTBR (D-Bus), nút Test connection |
| Settings / OpenThread | Cấu hình network + toggle khởi động Thread |
| Settings / System | Action cards (Khởi động lại, Factory Reset) + danger divider; modal xác nhận countdown 5s |

Console đã bỏ. Commissioner gộp vào Nodes (modal Commission Node + Joiner List).

## Thread-Node gửi dữ liệu

Thiết bị **Thread-Node** (router/child/endpoint) gửi dữ liệu **trực tiếp tới backend** qua IP: **CoAP** (UDP 5683, IPv6), path **/device/register**, **/device/update**, **/device/ping**, payload **CBOR**. BR chỉ route IP. Backend parse CBOR, log JSON ra console, trả CoAP 2.01; không gửi lên frontend. Hướng dẫn: [docs/coap/thread_node_coap.md](../docs/coap/thread_node_coap.md).
