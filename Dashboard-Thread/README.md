# Dashboard-Thread

Backend + Frontend điều khiển **OpenThread CLI qua UART** (ESP32-H2 ot-br). Một project chung cho cả API và giao diện web.

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
- **Console**: Gửi lệnh CLI tùy ý, xem output realtime.
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
├── backend/              # Node.js + TypeScript (WebSocket, Serial/UART)
│   ├── src/
│   │   ├── server/       # WebSocketServer
│   │   ├── communicate/  # SerialPort, SerialConfig (giao tiếp phần cứng)
│   │   └── services/     # AppSettings, Database
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/   # Status, Dashboard, Commissioner, Console, Settings
│   │   │   └── common/   # Modal, TopNav
│   │   └── hooks/        # useWebSocket, useWebSocketContext
│   └── package.json
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

- **Giao tiếp:** Backend dùng **frame protocol** (USB CDC) qua serial — không còn CLI hay command prefix. Cấu trúc frame: SOF, Frame ID, CMD, LEN, DATA, CRC8, EOF (xem `docs/usb_cdc_frame_structure.md`).
- **Khi mở serial:** Backend gửi CMD_PING, nhận ACK; nếu đã có cấu hình serial trong DB thì tự gọi `connectIfConfigured()` và polling OT config.
- **AUTO_FETCH_DATA** (trong `backend/src/server/WebSocketServer.ts`): Khi **false** — giảm polling (Status, Router/Child, Commissioner); vẫn keepalive định kỳ. Khi **true** — polling đầy đủ.

Chi tiết và TODO: [TODO.md](./TODO.md).
