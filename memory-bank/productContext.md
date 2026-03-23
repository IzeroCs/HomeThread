# Product Context — Namorix Thread

## Why This Project Exists

OpenThread Border Router (BR) cần được điều khiển và giám sát từ xa. Project này kết nối tới BR qua **TCP** (frame protocol), cung cấp giao diện web trực quan để quản lý Thread network. BR có thể là hostname (vd. Thread-Host.local) hoặc IP, port mặc định 5000.

## Problems Solved

| Vấn đề cũ (CLI) | Giải pháp (frame protocol) |
|---|---|
| CLI text khó parse, dễ sai | Binary frame với CRC8, ACK/NACK rõ ràng |
| Không có real-time data | WebSocket push từ backend khi có thay đổi |
| Phải SSH vào thiết bị | Giao diện web truy cập từ LAN |
| Không có error handling | Frame ID + pending map + timeout |
| Polling thủ công | State poll 5s + CMD_NOTIFY (notify-first) + baseline on connect |

## How It Should Work

### User Journey

1. Người dùng mở web app từ LAN (port 5173 dev / 3000 prod)
2. Vào Settings → BR Connection → nhập host (vd. Thread-Host.local) + port (5000) → Test Connect → Save
3. Backend tự động kết nối TCP tới BR và bắt đầu poll CMD_STATE mỗi 5s
4. Nếu `thread_run_on_connect = true` và state = disabled → tự khởi động Thread
5. Xem trạng thái real-time ở tab Status
6. Xem Router/Child Table ở Dashboard (cập nhật theo CMD_NOTIFY + baseline khi connect)
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

## Thread-Node gửi dữ liệu

Thiết bị **Thread-Node** (router/child/endpoint) gửi dữ liệu **trực tiếp tới backend** qua IP: **CoAP** (UDP 5683, IPv6), path **/device/** (ping, register/info, register/entity, update/info, update/entity, update/topology, update/state), payload **CBOR**. BR chỉ route IP. **GET /device/ping** nên gửi kèm query **?mac=** (16 ký tự hex) để backend cập nhật heartbeat (last_seen_at). Backend parse CBOR, lưu device/entity/topology/state vào SQLite (8 bảng, gồm device_topology_neighbor, device_health_br); có thể trả **restore state** CBOR trong response register/entity; không gửi lên frontend. **Tài liệu:** `documents/coap/device_payload_spec.md` (spec chính), `documents/coap/backend_discovery_srp.md` (SRP discovery), `documents/architecture/real_br_integration.md` (routing, troubleshooting).

## Namorix Desktop (plugin / shell)

Khi Thread chạy **trong shell** Namorix (không phải tab trình duyệt standalone):

- Shell cấp JWT và **`window.nmxCore`**; plugin frontend chỉ gọi API Desktop/gateway — xem `namorix/documents/namorix-desktop-architecture.md` §5–8 (auth, gateway, plugin loading, `isInShell`).
- Toast đã hỗ trợ dual mode (`window.nmxCore` → CustomEvent) — khớp hướng host render toast trong shell.
- Việc **build lib-mode** (`thread.js` / manifest) và **conditional layout** (`nmx-thread-app`) là hạng mục **M3** trên Desktop; roadmap nằm trong spec Desktop và `namorix/memory-bank/`, không thay thế tài liệu CoAP/BR của Thread.
- **CORS + core trùng tag:** Frontend Vite của Thread cho phép fallback CORS `origin: true` khi thiếu `DESKTOP_ORIGIN` (dev standalone không cần set thêm). Khi embed/plugin backend cần policy chặt hơn thì vẫn nên set `DESKTOP_ORIGIN` đúng origin Desktop. `@namorix/core` dùng `defineCustomElementOnce` (0.9.2+) để không crash khi shell đã đăng ký `nmx-sidebar` và các tag chrome khác trước plugin.
