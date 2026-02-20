# Dashboard-Thread

Backend + Frontend điều khiển **OpenThread qua UART** (ESP32-H2 ot-br), dùng **frame protocol USB CDC** — không còn CLI. Một project chung cho cả API và giao diện web.

## Stack

| Phần       | Công nghệ              |
| ---------- | ---------------------- |
| Backend    | Node.js + TypeScript   |
| Frontend   | React + TypeScript + Vite |
| Monorepo   | npm workspaces         |

## Tính năng chính

- **Status**: Trạng thái serial, OpenThread (PAN ID, Channel, Network Name, IP, Dataset Active), thread state.
- **Dashboard**: Router Table & Child Table (số lượng trong nhãn). Click một dòng → Modal xem đầy đủ thông tin (kể cả cột ẩn), tiêu đề theo RLOC16.
- **Commissioner**: Thêm joiner (EUI64, PSK), tuỳ chọn timeout 30/60/120/180/500s; danh sách joiner với cột Expiration đếm ngược.
- **Console**: Xem dữ liệu serial realtime (hex); gửi lệnh qua frame khi firmware hỗ trợ.
- **Settings**: Cấu hình Serial (port, baud), OpenThread (PAN ID, Channel, Network Name, tự chạy Thread khi kết nối).

Component dùng chung: **Modal**, **TopNav** nằm trong `frontend/src/components/common/`.

**TopNav symbol màu sắc**: Symbol trạng thái trên TopNav đổi màu theo thread state:
- 🟢 **Xanh lá** — leader
- 🟣 **Tím** — router
- 🔵 **Xanh dương** — child
- 🟠 **Cam** — disabled/detached hoặc chưa bật "tự chạy Thread"
- ⚪ **Xám** — chưa kết nối serial

## Cấu trúc project

```
Dashboard-Thread/
├── package.json          # Root: workspaces, scripts chạy cả BE + FE
├── backend/              # Node.js + TypeScript (WebSocket, Serial frame protocol)
│   ├── src/
│   │   ├── server/       # WebSocketServer (chỉ emit, lấy data từ CommunicateManager)
│   │   ├── communicate/ # SerialPort, SerialConfig, frame (parser/builder/crc8), CommunicateManager, OtConfigManager, PollingManager
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
├── docs/                 # entity_model_schema, migration_to_frame_protocol, usb_cdc_frame_structure
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

## Cấu hình

- **Backend**: `backend/.env.example` — cổng serial, baud rate. Cấu hình serial lưu SQLite qua Settings.
- **Frontend**: Proxy trong `vite.config.ts` (`/api`, `/socket.io` → backend). Có thể set `VITE_WS_URL` nếu cần URL backend khác.

## Backend – Serial & frame protocol

- **Giao tiếp:** Backend dùng **frame protocol** (USB CDC) qua serial — không còn CLI. Cấu trúc frame: SOF, Frame ID, CMD, LEN, DATA, CRC8, EOF (xem `docs/usb_cdc_frame_structure.md`).
- **communicate/:** `SerialPort` (raw mode, `useFrameProtocol`), `SerialConfigService`, thư mục `frame/` (constants, crc8, frameBuilder, frameParser), **CommunicateManager** nắm dữ liệu (lastThreadState, lastOtConfig) và khởi tạo giao tiếp; **OtConfigManager**, **PollingManager**. Main truyền `onBroadcast => io.emit` để manager push event.
- **WebSocketServer:** Chỉ emit tới frontend; lấy dữ liệu qua `communicate.getStatus()`, `communicate.getLastOtConfig()`; không chứa logic serial/frame.
- **Khi mở serial:** Gửi CMD_STATE (keepalive, payload vài byte), nhận phản hồi; nếu đã có cấu hình serial trong DB thì tự `connectIfConfigured()` và polling OT config.
- **AUTO_FETCH_DATA** (`WebSocketServer.ts`): **false** — giảm polling, vẫn keepalive định kỳ; **true** — polling đầy đủ (Status, Router/Child, Commissioner).
- **Database:** SQLite (cấu hình serial, app settings); schema IoT entity (xem `docs/entity_model_schema.md`).

## Đã triển khai (tóm tắt)

- **Backend:** Serial raw + frame parse/build, CRC8/MAXIM, CMD_ACK/CMD_NACK → cache + emit `ot:config`; CMD_STATE (keepalive, payload vài byte), Pull (CMD_DATASET_ACTIVE, CMD_IP_ADDR), polling + keepalive; WebSocket events: `status`, `serial:connect`/`disconnect`, `serial:data` (hex), `ot:config`, `ot:threadState`, `ot:routerTable`, `ot:childTable`, `commissioner:connect`/`commissioner:connect:result`.
- **Frontend:** Status (Serial + OT config, Dataset Active bảng), Dashboard (Router/Child table với số lượng trong nhãn, click dòng → Modal RLOC16), Commissioner (EUI64/PSK, timeout 30/60/120/180/500s, chỉ khi leader), Console (log serial realtime hex, 320px), Settings (Serial + OT), form thống nhất (`_form.scss`), TopNav symbol màu theo thread state, truy cập LAN (Vite host true, proxy).

Chi tiết migration frame: [docs/migration_to_frame_protocol.md](docs/migration_to_frame_protocol.md). Việc còn lại: [TODO.md](./TODO.md).
