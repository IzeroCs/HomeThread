# Dashboard-Thread

Backend + Frontend điều khiển **OpenThread Border Router (OTBR)** qua **REST API**. Backend giao tiếp với otbr-agent (port 8081, OTBR_REST=ON). Một project chung cho cả API và giao diện web.

## Stack

| Phần       | Công nghệ              |
| ---------- | ---------------------- |
| Backend    | Node.js + TypeScript   |
| Frontend   | React + TypeScript + Vite |
| Monorepo   | npm workspaces         |

## Tính năng chính

- **Status**: Trạng thái kết nối OTBR (REST), OpenThread (PAN ID, Channel, Network Name, dataset, thread state); **System**: IPv4 và IPv6 của backend (dùng cho SRP/Thread-Node). Khi OTBR không có: card compact (icon đỏ + Disconnected), OpenThread ghost grid + overlay "No Network Data Available". Phiên bản hiển thị lấy từ `frontend/package.json`.
- **Nodes**: Router Table & Child Table; **Joiner List** (thiết bị đang chờ join) với TIMEOUT đếm ngược MM:SS. Nút "Commission Node" mở modal thêm joiner (EUI64, PSKd, timeout). Click một dòng bảng → Modal chi tiết theo RLOC16. Dòng leader có badge "LEADER". Cột Age đếm lên realtime.
- **Settings**:
  - *BR Connection*: Trạng thái "OTBR (REST)" (Connected / Unavailable) và nút Test connection.
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
├── backend/              # Node.js + TypeScript (WebSocket, REST OTBR)
│   ├── src/
│   │   ├── server/       # websocket.server, coap-device.server (UDP 5683, Thread-Node CoAP+CBOR)
│   │   ├── otbr/         # otbr.manager, otbr-rest-client, ot-config.manager, polling.manager
│   │   ├── supervisor/   # socketClient (restartOtbr qua Unix socket)
│   │   ├── database/     # SQLite (Database, migrations)
│   │   ├── services/     # AppSettings
│   │   └── utils/        # logger, ipv6 (getBackendAddresses)
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/   # status/, nodes/, settings/ (.*.component.tsx + .*.style.scss), common/
│   │   └── hooks/        # use-websocket.hook, use-websocket-context.hook
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

- **Backend**: `backend/.env` — PORT. Kết nối OTBR qua **REST API**: env `OTBR_REST_URL` (mặc định `http://127.0.0.1:8081`). OTBR cần build với `OTBR_REST=ON` và listen 0.0.0.0:8081.
- **Frontend**: Proxy trong `vite.config.ts` (`/api`, `/socket.io` → backend). Có thể set `VITE_WS_URL` nếu cần URL backend khác.

## Backend – OTBR qua REST API

- **Giao tiếp:** Backend gọi **otbr-agent** qua **REST API** (HTTP, port 8081). Path theo OpenAPI ot-br-posix: `/node/state`, `/node/dataset/active`, `/node/commissioner/joiner`, `/api/devices`, v.v.
- **Backend thấy OTBR:** Backend (host hoặc container) cần HTTP tới OTBR:8081. Khi OTBR chạy với `network_mode: host`, backend trên host dùng `OTBR_REST_URL=http://127.0.0.1:8081`.
- **Kiến trúc:** `OtbrManager` điều phối `OtbrRestClient`; state poll định kỳ (30s); `PollingManager` poll Router/Child/Joiner table khi có frontend và state active. `WebSocketServer` relay event.
- **Khi OTBR có trên REST:** Pull state định kỳ; cập nhật dataset/config từ GET `/node/dataset/active`; nếu `thread_run_on_connect` bật và state = disabled → tự gọi PUT `/node/state` enable.
- **Database:** SQLite (app settings `thread_run_on_connect`). Bảng `br_connection_config` (migration 005) vẫn tồn tại nhưng không dùng.

**Thread-Node gửi dữ liệu:** CoAP UDP port 5683 (IPv6 [::]), path `/device/register`, `/device/update`, `/device/ping`, payload CBOR. Backend parse CBOR, log JSON, trả 2.01; không gửi lên frontend. Xem [docs/coap/thread_node_coap.md](./docs/coap/thread_node_coap.md) (nếu có).

**OTBR (Docker):** Compose có service `otbr`; entrypoint đợi RCP (by-id) rồi start. Rút RCP → **supervisor** trên host (socket + watch device) restart container. Cài service: `sudo bash ./supervisor/install-supervisor-service.sh`. Xem [supervisor/README.md](./supervisor/README.md), [otbr/README.md](./otbr/README.md).

Việc còn lại: [TODO.md](./TODO.md).
