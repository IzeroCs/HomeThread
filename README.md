# Namorix Thread

Monorepo cho Thread dashboard/plugin gồm:

- `backend/` — Node.js + TCP frame protocol + CoAP ingest
- `frontend/` — Lit + Vite
- `shared/` — types/events/constants dùng chung

## Dev — cổng mặc định (`.env` ở root repo)

| Biến | Mặc định | Ý nghĩa |
|------|----------|---------|
| `PORT` | `4000` | Backend Thread (API, plugin static, Socket.io) |
| `THREAD_VITE_PORT` | `5180` | Vite dashboard (tránh đụng Desktop `5173` khi chạy cả hai) |
| `DESKTOP_ORIGIN` | `http://localhost:5173` | Origin shell Namorix Desktop (CORS); phải khớp `namorix/.env` |

Override cục bộ: tạo `.env.local` (gitignored).

## Quick Start

```bash
npm install
npm run dev
```

Chạy riêng:

- `npm run dev:backend`
- `npm run dev:frontend`

Build:

- `npm run build`
- `npm run build:plugin`
- `npm run build:plugin:watch`

## Tài liệu

- Mục lục docs: `documents/README.md`
- Memory bank: `memory-bank/*.md`
- Việc còn lại: `TODO.md`

## Security Notes

- Thread backend WebSocket currently accepts connections without user authentication.
- Do not expose port `4000` outside trusted LAN/dev environments.
- For wider deployment, add authentication/authorization at WebSocket layer (for example Desktop JWT validation or service token gate).
