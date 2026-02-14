# Dashboard Thread - Monorepo

Monorepo chứa cả Backend và Frontend cho Thread Network Dashboard.

## 📁 Cấu trúc Project

```
Dashboard-Thread/
├── backend/              # Backend WebSocket server
├── frontend/             # Frontend React dashboard
├── package.json          # Root package.json với workspaces
└── README.md
```

## 🚀 Quick Start

### 1. Setup Frontend Project (Nếu chưa có)

Frontend cần được khởi tạo trước:

```bash
cd frontend
npm create vite@latest . -- --template react-ts
cd ..
```

### 2. Install Dependencies

```bash
# Install dependencies cho cả backend và frontend
# npm workspaces sẽ tự động install dependencies cho các workspace có package.json
npm install
```

**Lưu ý**: npm workspaces chỉ install dependencies cho các workspace có `package.json`. Nếu frontend chưa có `package.json`, cần setup trước (xem bước 1).

### 2. Chạy Development Mode

```bash
# Chạy cả backend và frontend cùng lúc
npm run dev
```

Hoặc chạy riêng từng phần:

```bash
# Chỉ chạy backend
npm run dev:backend

# Chỉ chạy frontend
npm run dev:frontend
```

### 3. Build Production

```bash
# Build cả backend và frontend
npm run build

# Hoặc build riêng
npm run build:backend
npm run build:frontend
```

## 📦 Workspaces

Project sử dụng npm workspaces để quản lý monorepo:

- **backend**: WebSocket server (Node.js + TypeScript)
- **frontend**: React dashboard (Vite + TypeScript)

## 🔧 Development Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Chạy cả backend và frontend cùng lúc |
| `npm run dev:backend` | Chỉ chạy backend |
| `npm run dev:frontend` | Chỉ chạy frontend |
| `npm run build` | Build cả hai projects |
| `npm run install:all` | Install dependencies cho tất cả workspaces |
| `npm run lint` | Lint code cho tất cả workspaces |

## 📝 Requirements

- **Node.js >= 20.0.0** (Recommended: Node.js 20.x LTS hoặc 22.x LTS)
- **npm >= 10.0.0**
- ot-daemon đang chạy trên Linux
- ot-ctl command available (có thể cần sudo)

### Node.js Version Recommendation

- **Minimum**: Node.js 20.x (Iron LTS) - Stable và được hỗ trợ đến 2026
- **Recommended**: Node.js 22.x (Jod LTS) hoặc 24.x (Krypton LTS) - Active LTS mới nhất
- **Not Recommended**: Node.js 18.x đã end-of-life (March 2025)

## 🔌 Ports

- **Backend WebSocket**: `8080` (default, configurable via env)
- **Frontend Dev Server**: `5173` (Vite default, configurable)

## 🔍 IDE Indexing & TypeScript

Monorepo này sử dụng **TypeScript Project References** để IDE (Cursor/VSCode) có thể index và hiểu cấu trúc project đúng cách.

### Cấu trúc TypeScript:

- **Root `tsconfig.json`**: Reference đến các sub-projects
- **backend/tsconfig.json**: Config riêng cho backend
- **frontend/tsconfig.json**: Config riêng cho frontend

### IDE Indexing:

1. **Tự động**: Khi mở workspace ở root (`Dashboard-Thread/`), IDE sẽ tự động index cả backend và frontend
2. **TypeScript Language Server**: Sử dụng project references để hiểu dependencies
3. **Go to Definition**: Hoạt động across workspaces
4. **IntelliSense**: Auto-complete và type checking hoạt động đúng

### Nếu cần share types giữa Backend và Frontend:

Có thể tạo thêm workspace `shared-types` hoặc đặt shared types trong một trong hai projects và import từ đó.

### Troubleshooting Indexing:

- Reload IDE window: `Cmd/Ctrl + Shift + P` → "Reload Window"
- Restart TypeScript Server: `Cmd/Ctrl + Shift + P` → "TypeScript: Restart TS Server"
- Đảm bảo đã chạy `npm install` ở root để install dependencies

## 📚 Documentation

- [Backend TODO](./backend/TODO.md)
- [Frontend TODO](./frontend/TODO.md)
- [Main TODO](./TODO.md)
