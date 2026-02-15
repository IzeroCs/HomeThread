# Dashboard-Thread

Backend + Frontend điều khiển **OpenThread CLI qua UART** (ESP32-H2 ot-br). Một project chung cho cả API và giao diện web.

## Stack

| Phần       | Công nghệ              |
| ---------- | ---------------------- |
| Backend    | Node.js + TypeScript   |
| Frontend   | React + TypeScript + Vite |
| Monorepo   | npm workspaces         |

## Cấu trúc project

```
Dashboard-Thread/
├── package.json          # Root: workspaces, scripts chạy cả BE + FE
├── backend/              # Node.js + TypeScript (API, Serial/UART)
│   ├── src/
│   └── package.json
├── frontend/             # React + Vite + TypeScript
│   ├── src/
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

## Cấu hình

- **Backend**: xem `backend/.env.example` (cổng serial, baud rate, port API).
- **Frontend**: dev server dùng proxy tới backend (cấu hình trong `frontend/vite.config.ts` khi cần).

Chi tiết việc cần làm: xem [TODO.md](./TODO.md).
