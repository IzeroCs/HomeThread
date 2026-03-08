# Dashboard-Thread

Backend + Frontend điều khiển **OpenThread Border Router (OTBR)** qua **D-Bus**. Backend giao tiếp với otbr-agent (trong container) qua socket D-Bus; khi chạy backend trong Docker dùng volume `otbr-dbus` chung với OTBR. Một project chung cho cả API và giao diện web.

## Stack

| Phần       | Công nghệ              |
| ---------- | ---------------------- |
| Backend    | Node.js + TypeScript   |
| Frontend   | React + TypeScript + Vite |
| Monorepo   | npm workspaces         |

## Tính năng chính

- **Status**: Trạng thái kết nối OTBR (D-Bus), OpenThread (PAN ID, Channel, Network Name, dataset, thread state); **System**: IPv4 và IPv6 của backend (dùng cho SRP/Thread-Node). Khi OTBR không có: card compact (icon đỏ + Disconnected), OpenThread ghost grid + overlay "No Network Data Available". Phiên bản hiển thị lấy từ `frontend/package.json`.
- **Nodes**: Router Table & Child Table; **Joiner List** (thiết bị đang chờ join) với TIMEOUT đếm ngược MM:SS. Nút "Commission Node" mở modal thêm joiner (EUI64, PSKd, timeout). Click một dòng bảng → Modal chi tiết theo RLOC16. Dòng leader có badge "LEADER". Cột Age đếm lên realtime.
- **Settings**:
  - *BR Connection*: Trạng thái "OTBR (D-Bus)" (Connected / Unavailable) và nút Test connection.
  - *OpenThread*: PAN ID, Channel, Network Name, Extended PAN ID, Network Key; toggle khởi động/dừng Thread; nút "Lấy lại" fetch config từ OTBR.
  - *System*: Hai action cards (Khởi động lại, Factory Reset) với image panel và nút Reset/Factory Reset; divider "Vùng nguy hiểm"; modal xác nhận + đếm ngược 5 giây.

Giao diện: **dark navy** theme, SCSS only (không Tailwind). Sidebar trái brand **OpenThread** với chấm trạng thái BR/Thread. Nav: Status, Nodes, Settings (icon `speed`, `account_tree`, `settings`); dropdown Settings có 3 mục con với icon: BR Connection `lan`, OpenThread `device_hub`, System `warning`. Toast: dark card, thanh dọc trái màu theo type. **Modal / ConfirmModal**: dark navy (overlay blur, nền card-dark, nút Cancel ghost, Confirm danger/warning với hover glow). Component dùng chung: **Modal**, **ConfirmModal**, **Sidebar**, **ToastContainer** trong `frontend/src/components/common/`.

**Sidebar status dot màu sắc**: Chấm trạng thái trên Sidebar đổi màu theo thread state:
- 🟢 **Xanh lá** — leader
- 🟣 **Tím** — router
- 🔵 **Xanh dương** — child
- 🟠 **Cam** — disabled/detached hoặc chưa bật "tự chạy Thread"
- ⚪ **Xám** — chưa kết nối OTBR

## Cấu trúc project

```
Dashboard-Thread/
├── package.json          # Root: workspaces, scripts chạy cả BE + FE
├── backend/              # Node.js + TypeScript (WebSocket, D-Bus OTBR)
│   ├── src/
│   │   ├── server/       # WebSocketServer, CoapDeviceServer (UDP 5683, Thread-Node CoAP+CBOR)
│   │   ├── otbr/         # OtbrManager, OtbrDbusClient, OtConfigManager, PollingManager
│   │   ├── supervisor/   # socketClient (restartOtbr qua Unix socket)
│   │   ├── database/     # SQLite (Database, migrations)
│   │   ├── services/     # AppSettings
│   │   └── utils/        # logger, ipv6 (getBackendAddresses)
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/   # Status, Nodes (Router/Child/JoinerList, CommissionNodeModal), Settings
│   │   │   └── common/   # Modal, ConfirmModal, Sidebar, ToastContainer
│   │   └── hooks/        # useWebSocket, useWebSocketContext
│   └── package.json
├── supervisor/            # Daemon Python (stdlib): Unix socket + watch RCP device → restart OTBR
├── otbr/                  # OTBR Docker (entrypoint đợi RCP, compose)
├── docs/                  # otbr/dbus_backend.md, otbr/otbr_config_from_backend.md, ...
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
   - `npm run build` — build cả hai
   - `npm run build:backend` / `npm run build:frontend` — build từng phần

## Truy cập từ LAN

- Frontend dev server lắng nghe trên `0.0.0.0` (Vite `host: true`). Từ máy khác trong mạng mở: `http://<IP-máy-chạy-dev>:5173`.
- WebSocket/API dùng cùng host với trang (proxy Vite chuyển tiếp). Backend chỉ cần chạy trên máy host.

## Lưu ý khi development

- **WebSocket log "Client connected" 2 lần:** Ở môi trường dev, frontend dùng React Strict Mode (trong `main.tsx`). Strict Mode cố ý mount → unmount → mount lại component để phát hiện side effect. Kết quả là `WebSocketProvider` (và hook `useWebSocket`) chạy hai lần: lần đầu tạo socket và kết nối (backend log lần 1), cleanup disconnect; lần hai tạo socket mới và kết nối (backend log lần 2). Đây là hành vi mong đợi của React, không phải lỗi; production build thường chỉ còn một connection mỗi lần mở trang.

## Cấu hình

- **Backend**: `backend/.env` — PORT. Kết nối OTBR qua D-Bus khi chạy backend trong Docker: volume `otbr-dbus:/run/dbus`, env `DBUS_SYSTEM_BUS_ADDRESS=unix:path=/run/dbus/system_bus_socket`.
- **Frontend**: Proxy trong `vite.config.ts` (`/api`, `/socket.io` → backend). Có thể set `VITE_WS_URL` nếu cần URL backend khác.

## Backend – OTBR qua D-Bus

- **Giao tiếp:** Backend gọi **otbr-agent** qua **D-Bus** (thư viện `dbus-next`). Service: `io.openthread.BorderRouter.wpan0`, interface `io.openthread.BorderRouter`. Chi tiết: [docs/otbr/dbus_backend.md](./docs/otbr/dbus_backend.md).
- **Backend thấy OTBR:** Backend chạy **trên host** (`npm run dev:backend`) **không** thấy OTBR khi OTBR dùng D-Bus trong container — đã thử mount D-Bus host vào container và set `DBUS_SYSTEM_BUS_ADDRESS`, otbr-agent không đăng ký trên host bus. Để backend nói chuyện với OTBR: chạy **backend trong Docker** với volume `otbr-dbus:/run/dbus` chung service OTBR và env `DBUS_SYSTEM_BUS_ADDRESS=unix:path=/run/dbus/system_bus_socket` (thêm service backend trong compose, mount source để dev không cần build lại mỗi lần).
- **Kiến trúc:** `OtbrManager` điều phối `OtbrDbusClient`; state cập nhật qua D-Bus signal (fallback 30s); `PollingManager` poll Router/Child/Joiner table khi có frontend và state active. `WebSocketServer` relay event.
- **Khi OTBR có trên D-Bus:** Pull state định kỳ; cập nhật dataset/config từ getActiveDataset; nếu `thread_run_on_connect` bật và state = disabled → tự gọi Attach.
- **Database:** SQLite (app settings `thread_run_on_connect`). Bảng `br_connection_config` (migration 005) vẫn tồn tại nhưng không dùng; BrConnectionConfigService đã bỏ.

**Thread-Node gửi dữ liệu:** CoAP UDP port 5683 (IPv6 [::]), path `/device/register`, `/device/update`, `/device/ping`, payload CBOR. Backend parse CBOR, log JSON, trả 2.01; không gửi lên frontend. Xem [docs/coap/thread_node_coap.md](./docs/coap/thread_node_coap.md) (nếu có).

**OTBR (Docker):** Compose có service `otbr`; entrypoint đợi RCP (by-id) rồi start. Volume `otbr-dbus:/run/dbus` để backend container gọi D-Bus. Rút RCP → **supervisor** trên host (socket + watch device) restart container. Cài service: `sudo bash ./supervisor/install-supervisor-service.sh`. Xem [supervisor/README.md](./supervisor/README.md), [otbr/README.md](./otbr/README.md).

Việc còn lại: [TODO.md](./TODO.md).
