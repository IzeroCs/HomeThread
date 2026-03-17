# Dashboard-Thread

Backend + Frontend điều khiển **OpenThread Border Router** qua **TCP** (frame protocol). Kết nối tới BR tại BR_IP:port (khi chạy trên host: Thread-Host.local:5000 nếu mDNS có; khi chạy Docker dùng IP vd. 192.168.31.3:5000 — mDNS trong container không hoạt động). Khuyến nghị dùng **IPv4** cho BR Host (nhiều BR chỉ listen IPv4); nếu dùng IPv6 link-local cần zone ID (vd. fe80::...%enp7s0). Một project chung cho cả API và giao diện web.

## Stack

| Phần       | Công nghệ              |
| ---------- | ---------------------- |
| Backend    | Node.js + TypeScript   |
| Frontend   | Lit + TypeScript + Vite |
| Monorepo   | npm workspaces         |

## Tính năng chính

- **Status**: Trạng thái kết nối BR (host:port), OpenThread (PAN ID, Channel, Network Name, Version, IP Address, dataset đầy đủ), thread state; **System**: IPv4 và IPv6 của backend (từ backend, dùng cho SRP/Thread-Node). Khi chưa kết nối BR: card compact (icon đỏ + DISCONNECTED), OpenThread ghost grid + overlay "No Network Data Available" và nút "Configure Border Router". Phiên bản hiển thị lấy từ `frontend/package.json`. Backend tự gửi SRP register (CMD 0x44) khi BR là leader để Thread-Node có thể discovery `_dashboard._udp`; khi gửi, backend log IPv6/hostname/port ra console (transportLogger).
- **Topology**: Bản đồ topology (pan/zoom, spotlight, node select, label box động, edge ẩn khi offline).
- **Nodes**: Router Table & Child Table. Click một dòng bảng → Modal chi tiết theo RLOC16. Dòng leader có badge "LEADER". Cột Age đếm lên realtime.
- **Joiner**: Trang Joiner (queue) hiển thị danh sách joiner pending với EUI64, **PSKD**, timeout countdown và trạng thái; nút action mở modal thêm joiner (EUI64, PSKd, timeout).
- **Settings**:
  - *BR Connection*: Cấu hình host (IPv4 khuyến nghị, vd. 192.168.31.3; hoặc Thread-Host.local khi mDNS có; IPv6 link-local cần zone ID %interface), port (5000), test connect trước khi lưu.
  - *OpenThread*: PAN ID, Channel, Network Name, Extended PAN ID, Network Key; toggle khởi động/dừng Thread; nút "Lấy lại" fetch config từ thiết bị.
  - *System*: Hai action cards (Khởi động lại, Factory Reset) với image panel và nút Reset/Factory Reset; divider "Vùng nguy hiểm"; modal xác nhận + đếm ngược 5 giây.

Giao diện: **dark navy** theme, SCSS only (không Tailwind). Sidebar trái brand **OpenThread** với chấm trạng thái BR/Thread. Nav: Status, Nodes, Settings (icon `speed`, `account_tree`, `settings`); dropdown Settings có 3 mục con với icon: BR Connection `lan`, OpenThread `device_hub`, System `warning`. Toast: dark card, thanh dọc trái màu theo type. **Modal / ConfirmModal**: dark navy (overlay blur, nền card-dark, nút Cancel ghost, Confirm danger/warning với hover glow). Component dùng chung: **Modal**, **ConfirmModal**, **Sidebar**, **ToastContainer** trong `frontend/src/shared/components/`. Frontend dùng **path alias** (`@/`, `@shared/`, `@nodes/`, `@settings/`, `@status/`) — cấu hình trong `tsconfig.json` và `vite.config.ts`.

**Sidebar status dot màu sắc**: Chấm trạng thái trên Sidebar đổi màu theo thread state:
- 🟢 **Xanh lá** — leader
- 🟣 **Tím** — router
- 🔵 **Xanh dương** — child
- 🟠 **Cam** — disabled/detached hoặc chưa bật "tự chạy Thread"
- ⚪ **Xám** — chưa kết nối BR

## Cấu trúc project

```
Dashboard-Thread/
├── package.json          # Root: workspaces, scripts chạy cả BE + FE
├── backend/               # Node.js + TypeScript (WebSocket, TCP frame protocol)
│   └── src/
│       ├── coap/         # CoAP server (decorator router), DeviceCoapController, path /device/
│       ├── communicate/  # TransportTcp, CommandManager, CommunicateManager, frame (parser/builder/constants)
│       ├── settings/     # BrConnectionConfigService, AppSettingsService
│       ├── thread/       # OtConfigManager, PollingManager, device-role
│       ├── websocket/     # WebSocketServer; handler/ (config, br, device, thread, commissioner, srp); @WsOn, getWsRoutes
│       ├── database/     # SQLite, migrations
│       ├── cbor/         # CBOR decode nội bộ
│       └── utils/        # logger, ipv6 (getPreferredBackendIPv6, getBackendAddresses)
├── frontend/
│   └── src/
│       ├── features/     # joiner, nodes, settings, status, topology (page + components)
│       ├── shared/       # components (Modal, ConfirmModal, Sidebar, ToastContainer), controllers, types, styles
│       ├── app-shell.ts
│       └── main.ts
├── shared/                # Package TypeScript chung (types, events, constants, validation)
├── docs/                  # coap/device_payload_spec.md (spec payload), thread_node_coap.md (flow Thread-Node)
├── TODO.md
└── README.md
```

## Chạy project

1. Cài dependency (một lần):

   ```bash
   npm run install:all
   ```

2. Chạy đồng thời backend + frontend (dev):

   ```bash
   npm run dev
   ```

3. Chạy riêng:
   - Backend: `npm run dev:backend`
   - Frontend: `npm run dev:frontend`

4. Build production:
   - `npm run build` — build cả hai (backend: `tsc && tsc-alias` để thay path alias trong dist; frontend: Vite)
   - `npm run build:backend` / `npm run build:frontend` — build từng phần

## Truy cập từ LAN

- Frontend dev server lắng nghe trên `0.0.0.0` (Vite `host: true`). Từ máy khác trong mạng mở: `http://<IP-máy-chạy-dev>:5173`.
- WebSocket/API dùng cùng host với trang (proxy Vite chuyển tiếp). Backend chỉ cần chạy trên máy host.

## Lưu ý khi development

- **Frontend dùng Lit (Web Components)** và hiện đang render **light DOM** (tắt Shadow DOM) để CSS global áp trực tiếp.
- **Modal API (light DOM):** `modal-dialog` không dùng `<slot>`; nội dung truyền qua property `.body` (TemplateResult). `confirm-modal` đã bọc sẵn theo API này.

## Cấu hình

- **Backend**: `backend/.env.example` — PORT. Cấu hình BR (host, port) lưu SQLite qua Settings.
- **Frontend**: Proxy trong `vite.config.ts` (`/api`, `/socket.io` → backend). Có thể set `VITE_WS_URL` nếu cần URL backend khác.

## Backend – TCP & frame protocol

- **Giao tiếp:** Frame protocol qua **TCP** tới BR (host:port, mặc định Thread-Host.local:5000). Cấu trúc frame: SOF, Frame ID, CMD, LEN, DATA, CRC8, EOF (xem `Documents/protocol/usb_cdc_frame_structure.md` ở thư mục gốc HomeThread).
- **Kiến trúc:** `CommunicateManager` điều phối TransportTcp + frame; `CommandManager` gửi/nhận frame, quản lý pending theo Frame ID + timeout; `BrConnectionConfigService` lưu cấu hình BR; `PollingManager` poll table định kỳ. `WebSocketServer` chỉ relay event.
- **Backend path alias:** tsconfig có `baseUrl` + `paths` (`@utils/*`, `@database`, `@communicate`, `@coap/*`, …). Dev dùng `tsx watch` (tự resolve alias); build: `tsc` rồi `tsc-alias` để thay alias trong dist bằng relative path.
- **Khi kết nối BR:** Pull state định kỳ (CMD_STATE, 5s). Dataset active + IP chỉ fetch khi state thay đổi hoặc lần đầu. Thread version (CMD_THREAD_VERSION) fetch một lần sau lần đầu nhận ACK state. Nếu `thread_run_on_connect` bật và state = disabled → tự gửi CMD_THREAD_START.
- **Polling tables:** Router/Child/Joiner table poll mỗi 6s (child delay 1.5s) — chỉ khi có frontend kết nối và state là leader/router/child.
- **CMD hỗ trợ:**

| Nhóm | CMD |
|---|---|
| Đọc trạng thái | CMD_STATE, CMD_DATASET_ACTIVE, CMD_IP_ADDR, CMD_THREAD_VERSION |
| Đọc tables | CMD_ROUTER_TABLE, CMD_CHILD_TABLE, CMD_JOINER_TABLE |
| Set config | CMD_SET_PANID, CMD_SET_CHANNEL, CMD_SET_NETWORK_NAME, CMD_SET_EXTENDED_PANID, CMD_SET_NETWORK_KEY |
| Thread | CMD_THREAD_START, CMD_THREAD_STOP |
| Commissioner | CMD_COMMISSIONER_JOINER (EUI64 + PSKd + timeout) |
| Hệ thống | CMD_RESET, CMD_FACTORY |

- **Database:** SQLite (BR connection config, app settings `thread_run_on_connect`). Migration 006 đã xóa bảng legacy `serial_config`.

**Thread-Node gửi dữ liệu:** CoAP UDP port 5683 (IPv6 [::]), path `/device/ping`, `/device/register/info`, `/device/register/entity`, `/device/update/info`, `/device/update/entity`, `/device/update/topology`, `/device/update/state`; payload CBOR (key 0 = mac mọi payload; **entity/state array dùng key 1**). Backend parse CBOR, lưu DB; không gửi lên frontend. Spec payload: [docs/coap/device_payload_spec.md](./docs/coap/device_payload_spec.md). Flow: [docs/coap/thread_node_coap.md](./docs/coap/thread_node_coap.md).

Chi tiết: [Documents/protocol/usb_cdc_frame_structure.md](../Documents/protocol/usb_cdc_frame_structure.md) · [Documents/dashboard/migration_to_frame_protocol.md](../Documents/dashboard/migration_to_frame_protocol.md) · Việc còn lại: [TODO.md](./TODO.md).
