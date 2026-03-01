# Dashboard-Thread

Backend + Frontend điều khiển **OpenThread Border Router** qua **TCP** (frame protocol). Kết nối tới BR tại BR_IP:port (mặc định Thread-Host.local:5000, mDNS). Một project chung cho cả API và giao diện web.

## Stack

| Phần       | Công nghệ              |
| ---------- | ---------------------- |
| Backend    | Node.js + TypeScript   |
| Frontend   | React + TypeScript + Vite |
| Monorepo   | npm workspaces         |

## Tính năng chính

- **Status**: Trạng thái serial, OpenThread (PAN ID, Channel, Network Name, Version, IP Address, Dataset Active đầy đủ các field), thread state.
- **Dashboard**: Router Table & Child Table (số lượng trong nhãn). Click một dòng → Modal chi tiết theo RLOC16. Row của leader được highlight xanh lá. Cột Age đếm lên realtime theo giây (reset về giá trị mới khi bảng cập nhật).
- **Commissioner**: Thêm joiner (EUI64, PSKd, timeout 30–500s); danh sách joiner với cột Expiration đếm ngược. Giao tiếp qua CMD_COMMISSIONER_JOINER (frame protocol).
- **Console**: Xem dữ liệu serial realtime (hex).
- **Settings**:
  - *BR Connection*: Cấu hình host (vd. Thread-Host.local), port (5000), test connect trước khi lưu.
  - *OpenThread*: PAN ID, Channel, Network Name, Extended PAN ID, Network Key; toggle khởi động/dừng Thread; nút "Lấy lại" fetch config từ thiết bị.
  - *System*: Nút Reset và Factory Reset với modal xác nhận + đếm ngược 5 giây.

Component dùng chung: **Modal**, **ConfirmModal**, **TopNav**, **ToastContainer** trong `frontend/src/components/common/`.

**TopNav symbol màu sắc**: Symbol trạng thái trên TopNav đổi màu theo thread state:
- 🟢 **Xanh lá** — leader
- 🟣 **Tím** — router
- 🔵 **Xanh dương** — child
- 🟠 **Cam** — disabled/detached hoặc chưa bật "tự chạy Thread"
- ⚪ **Xám** — chưa kết nối BR

## Cấu trúc project

```
Dashboard-Thread/
├── package.json          # Root: workspaces, scripts chạy cả BE + FE
├── backend/              # Node.js + TypeScript (WebSocket, TCP frame protocol)
│   ├── src/
│   │   ├── server/       # WebSocketServer (chỉ emit, lấy data từ CommunicateManager)
│   │   ├── communicate/ # TransportTcp, BrConnectionConfigService, frame (parser/builder/crc8), CommunicateManager, OtConfigManager, PollingManager
│   │   ├── database/     # SQLite (Database, migrations)
│   │   ├── services/     # AppSettings
│   │   └── utils/        # logger
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/   # Status, Dashboard, Commissioner, Console, Settings
│   │   │   └── common/   # Modal, TopNav
│   │   └── hooks/        # useWebSocket, useWebSocketContext
│   └── package.json
├── docs/                 # (đã chuyển sang HomeThread/Documents/)
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

- **Backend**: `backend/.env.example` — PORT. Cấu hình BR (host, port) lưu SQLite qua Settings.
- **Frontend**: Proxy trong `vite.config.ts` (`/api`, `/socket.io` → backend). Có thể set `VITE_WS_URL` nếu cần URL backend khác.

## Backend – TCP & frame protocol

- **Giao tiếp:** Frame protocol qua **TCP** tới BR (host:port, mặc định Thread-Host.local:5000). Cấu trúc frame: SOF, Frame ID, CMD, LEN, DATA, CRC8, EOF (xem `Documents/protocol/usb_cdc_frame_structure.md` ở thư mục gốc HomeThread).
- **Kiến trúc:** `CommunicateManager` điều phối TransportTcp + frame; `CommandManager` gửi/nhận frame, quản lý pending theo Frame ID + timeout; `BrConnectionConfigService` lưu cấu hình BR; `PollingManager` poll table định kỳ. `WebSocketServer` chỉ relay event.
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

- **Database:** SQLite lưu cấu hình serial và app settings (`thread_run_on_connect`).

Chi tiết: [Documents/protocol/usb_cdc_frame_structure.md](../Documents/protocol/usb_cdc_frame_structure.md) · [Documents/dashboard/migration_to_frame_protocol.md](../Documents/dashboard/migration_to_frame_protocol.md) · Việc còn lại: [TODO.md](./TODO.md).
