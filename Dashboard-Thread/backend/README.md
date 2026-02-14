# Backend - Thread Network Dashboard

Backend WebSocket server để giao tiếp với ot-daemon/ot-ctl và quản lý Thread network.

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Setup Environment Variables

```bash
cp .env.example .env
# Edit .env với các giá trị phù hợp
```

### 3. Run Development Server

```bash
npm run dev
```

### 4. Build Production

```bash
npm run build
npm start
```

## 📝 Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | WebSocket server port | `8080` |
| `OT_CTL_PATH` | Path to ot-ctl binary | `ot-ctl` |
| `OT_CTL_USE_SUDO` | Use sudo for ot-ctl commands | `false` |
| `AUTH_TOKEN` | Optional authentication token | - |
| `LOG_LEVEL` | Logging level (error/warn/info/debug) | `info` |
| `NODE_ENV` | Environment (development/production) | `development` |

## 🏗️ Project Structure

```
backend/
├── src/
│   ├── handlers/        # WebSocket message handlers
│   ├── services/        # Business logic (ot-ctl wrapper)
│   ├── types/           # TypeScript types
│   ├── utils/           # Helper functions
│   └── server.ts        # WebSocket server setup
├── dist/                # Compiled JavaScript (generated)
├── .env                 # Environment variables (not in git)
├── .env.example         # Environment variables template
├── package.json
└── tsconfig.json
```

## 🔧 Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server với hot reload |
| `npm run build` | Build TypeScript to JavaScript |
| `npm start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Fix ESLint errors |
| `npm run type-check` | Type check without building |
| `npm run clean` | Remove dist folder |

## 📌 Requirements

- **Node.js >= 20.0.0** (Recommended: Node.js 20.x LTS hoặc 22.x LTS)
- **npm >= 10.0.0**
- ot-daemon đang chạy trên Linux
- ot-ctl command available (có thể cần sudo)

### Node.js Version Recommendation

- **Minimum**: Node.js 20.x (Iron LTS) - Stable và được hỗ trợ đến 2026
- **Recommended**: Node.js 22.x (Jod LTS) hoặc 24.x (Krypton LTS) - Active LTS mới nhất

## 🔌 WebSocket Protocol

Backend sử dụng WebSocket để giao tiếp với frontend. Xem [TODO.md](./TODO.md) để biết chi tiết về message protocol.

## 📚 Documentation

- [TODO List](./TODO.md)
- [Main Project README](../README.md)
