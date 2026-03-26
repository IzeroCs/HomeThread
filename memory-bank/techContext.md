# Tech Context — Namorix Thread

**Cursor / agent:** `.cursor/rules/no-terminal.mdc` — không tự chạy terminal (`npm`, build, test) trong repo này; chỉ đọc/ghi file. Cần log hoặc `npm install` thì user chạy local hoặc cho phép rõ trong chat.

## Project Structure

```
namorix-thread/           # monorepo root (repo)
├── data/                 # SQLite + Drizzle migrations (runtime)
├── backend/              # Node.js + TypeScript server
│   └── src/
│       ├── coap/         # CoAP server (decorator), CoapStatus, coap.response, DeviceCoapController, device-coap.service, device.payload (…)
│       ├── communicate/
│       │   ├── frame/    # parser, builder, CRC, dataset/table parsers
│       │   ├── transport/ # TCP client (TransportTcp)
│       │   └── br/       # BrConnection, BrCommand, BrSession, BrManager
│       ├── settings/
│       ├── thread/
│       ├── websocket/
│       ├── database/     # Drizzle schema; migrations ở ../data/migrations (repo root)
│       ├── cbor/
│       └── utils/
├── frontend/             # Lit + Vite + SCSS
├── shared/
└── memory-bank/
```

## Tech Stack

### Backend

| Package | Version | Usage |
|---|---|---|
| Node.js | >=18 | Runtime |
| TypeScript | ^5.7.2 | Language |
| tsx | ^4.19.2 | Dev runner (watch mode); tự resolve path alias từ tsconfig |
| tsc-alias | ^1.8.10 | Sau build: thay alias trong dist/ bằng relative path (Node chạy được) |
| socket.io | ^4.7.5 | WebSocket server |
| better-sqlite3 | ^11.7.0 | SQLite (WAL mode) |
| pino | ^9.5.0 | Structured logging |
| pino-pretty | latest | Pretty console output |
| `@namorix/core-backend` | `file:` → `namorix/core/backend` | Logger (pino) + **`resolveNamorixRepoDataLayout(__dirname)`** cho SQLite/migrations (`<repo>/data/...`, override **`NAMORIX_DATA_DIR`**) + Full SDK `createAddonBackendServer` cho bootstrap Express/addon runtime. Khai báo ở **`backend/package.json`** (`file:../../namorix/core/backend`) và root **`package.json`** (`file:../namorix/core/backend`) để workspaces hoist — **sau đổi dependency chạy `npm install` tại root repo Thread**. |

Transport: TCP (net.Socket) to BR; CoAP (UDP 5683, udp6 listen [::]) from Thread-Node. Dependencies: `coap`. **Env layer:** `backend/src/env.ts` parse/load `.env` cho runtime constants hiện hành (`PORT`, `DESKTOP_ORIGIN`, `BACKEND_IPV6`, `SRP_HOSTNAME`, `SRP_PORT`). **Addon backend plumbing:** `backend/src/index.ts` dùng `createAddonBackendServer` để setup Express/CORS/static + `manifest`/`health`; không còn registration loop/control client. Thread giữ domain runtime riêng (BrManager/WebSocket/CoAP/SRP). CBOR decode/encode nội bộ (`backend/src/cbor`). Thread-Node là **CoAP client**: GET /device/ping?mac=, POST register/update theo spec `documents/coap/device_payload_spec.md`.

### Frontend

| Package | Version | Usage |
|---|---|---|
| Lit | ^3.x | UI framework (Web Components) |
| TypeScript | ~5.6.3 | Language |
| Vite | ^6.0.3 | Build tool + dev server |
| SCSS (sass) | ^1.83.0 | Styling |
| socket.io-client | ^4.7.5 | WebSocket client |

### Lint / style tooling

| Tool | Scope | Mục tiêu |
|---|---|---|
| ESLint + TypeScript ESLint | `frontend/src`, `backend/src` | import order/grouping, `semi: always`, `indent: 2`, hygiene khi sửa file |
| Stylelint (`stylelint-config-standard-scss`) | `frontend/src/**/*.{scss,css}` | thống nhất SCSS/CSS format + declaration semicolons |

Scripts chính:

- Root: `npm run lint`, `npm run lint:fix`
- Frontend: `lint`, `lint:fix`, `lint:watch`, `lint:styles`, `lint:styles:fix`, `lint:styles:watch`
- Backend: `lint`, `lint:fix`, `lint:watch`

Frontend: **AppBaseElement** (`core/AppBaseElement.ts`) extends **NmxStoreElement** (core): store qua `getStore()`, optional locale, `createStoreSlice()`, light DOM (kế thừa từ NmxBaseElement). Root: `index.html` mount `<nmx-main>` → nmx-app-container → **nmx-thread-app** (NmxThreadApp trong app.ts). **AppBar** qua Redux slice `appBar`; pages dispatch setAppBar/clearAppBar. i18n: `t(key, params?)` từ `core/i18n/`, locales trong `core/i18n/locales/`; locale trong store slice `i18n` (default `"en"`), set từ user settings bằng `setLocale` (không persist localStorage).

Core/shared integration (frontend):
- **Layout:** Repo `namorix-thread` nằm cạnh `namorix/` và `namorix-assets/` trong cùng workspace parent (vd. `namorix-workspace/`). `@namorix/core` resolve tới **`namorix/core/frontend/src`** qua Vite alias + `tsconfig` `paths` — **không** dùng `file:` dependency trong `frontend/package.json` (tránh npm workspace/`Invalid Version` và trùng với alias).
- **Vite:** `siblingReposRoot = resolve(__dirname, "../..")` trong `vite.config.ts` / `vite.addon.config.ts` → `join(siblingReposRoot, "namorix/core/frontend/src")` cho `@namorix/core` và các subpath (`/i18n`, `/store`, …); `@namorix/core-shared` → `namorix/core/shared/src/index.ts`; `@namorix/assets` → `namorix-assets` root.
- **Core shared package mode:** `@namorix/core-shared` ở repo host (`namorix/core/shared`) đang theo src-based exports (`src/index.ts`) để workflow dev/typecheck không cần build `dist` trước.
- When `dist/` is not built, Vite aliases `@namorix/core` → `namorix/core/frontend/src` (sibling layout) and the app imports SCSS sources:
  - `@namorix/core/styles/_tokens.scss`
  - `@namorix/core/styles/nmx-base.scss`
- Redux store uses `createAddonStore` from `@namorix/core/store`.
- i18n: `initI18n({ store, dicts, fallbackLocale })` từ `@namorix/core/i18n`; locale mặc định `"en"`, set từ user settings bằng `store.dispatch(setLocale(...))` (không detect/persist localStorage). Component cần locale: extend AppBaseElement (có sẵn locale subscription) hoặc dùng `createLocaleController` từ `@/core/i18n/locale-controller`.
- Base elements: **NmxBaseElement** (core, font + light DOM only), **NmxStoreElement** (core, abstract `getStore()`, locale subscription, `createStoreSlice`), **AppBaseElement** (frontend, extends NmxStoreElement, `getStore() { return store }`).
- Layout/pages: core provides `<nmx-content>` + `NmxPageBuilder`/`PageEntry` để host app render trang controlled theo `currentPage`; frontend maps `NavPage` -> `render()` callbacks và import side-effect feature components để custom elements được define trước khi render.
- WebSocket: **createWsBridge** từ `@namorix/core/ws` — builder `onConnect`/`onDisconnect`/`onConnectError`/`on(event, handler)`/`start()`/`stop()`/`getSocket()`; **onceWithTimeout** cùng package. Toast: **initToast**, **showToast** từ `@namorix/core`; dual mode (standalone → store, desktop → CustomEvent "nmx-action"). Chi tiết: `documents/namorix-core-usage.md`.
- `@namorix/assets` — sibling repo `namorix-assets` (Vite alias `file:` / path tới thư mục assets).

Assets usage (frontend):
- Ensure Vite alias `@namorix/assets` points to the assets repo root (or its `src/` if it uses that layout).
- Import SVG as URL: `import logoUrl from "@namorix/assets/logo/namorix-logo-dark.svg?url"` and pass it to components as a string (e.g. `<img src=${logoUrl}>`).

### Namorix Desktop (cross-repo)

- Repo **`namorix`** định nghĩa Desktop shell + backend (auth, gateway, addon registry). Spec: **`../namorix/documents/namorix-desktop-architecture.md`** (sibling trong workspace).
- Thread là **addon đầu tiên** trong spec; tích hợp runtime (manifest, bundle ES module, health URL) mô tả ở §8 Desktop — **không** trùng với tài liệu CoAP/device trong `namorix-thread/documents/`.
- **Addon HTTP server (Express):** CORS / Socket.io dùng biến **`DESKTOP_ORIGIN`** — phải khớp origin trang Namorix Desktop thực tế (mặc định `http://localhost:5173`; đổi port shell thì cập nhật `.env` Thread); nếu không, dynamic `import()` của `thread.js` bị chặn CORS.
- **Build lib addon** (`frontend/vite.addon.config.ts`, `npm run build:addon`): nên `define` **`process.env.NODE_ENV`** (hoặc tương đương) cho bundle browser nếu dependency (vd. RTK) còn tham chiếu `process` — tránh `ReferenceError: process is not defined` trong console.
- **Core components + shell:** `@namorix/core` 0.9.2+ đăng ký shared custom elements qua **`defineCustomElementOnce`** — xem `namorix/memory-bank/progress.md` (mục core alignment historical).
- **Cửa sổ shell:** Host `namorix` mount root addon (tag từ `manifest.element`) qua property **`addonBody`** trên `nmx-window` — light DOM không dùng `<slot>` cho vùng body; xem `namorix/memory-bank/progress.md` **0.9.3**.
- **Hợp đồng shell (core):** `@namorix/core/shell-api` — `AddonRuntimeStatus`, `ShellWindowEvent` (tên `CustomEvent` shell), `SHELL_APP_EMIT_PREFIX`; type `NmxCoreApi` gồm `onLocaleChange` (đăng ký đổi locale theo shell). Addon không cần hardcode chuỗi `nmx-shell-locale-changed` nếu dùng API trên.
- **Gateway → addon backend:** Proxy `/api/addons/:addonId/*` forward header **`Authorization`** chuẩn; API addon (HTTP) nên đọc `Authorization` / Bearer JWT — không phụ thuộc `x-forwarded-authorization`.
- **WS security limitation (current):** Thread Socket.IO backend currently has no end-user auth gate (`allowRequest` accepts connections). Runtime UI nay đi direct vào addon backend, nên backend port addon chỉ nên mở trong trusted LAN/VPN hoặc cần bổ sung security middleware chung.
- Runtime policy (current): addon frontend runtime đi direct tới addon backend Socket.IO; Desktop backend quản lý lifecycle qua Docker API và shell WS (`shell:addon:*`, `shell:addons`). Không còn addon control/register/sync channel.
- **Build/runtime shape (current):** `namorix-thread/Dockerfile` là file multi-target (`prod`/`dev`) và publish bộ image labels rời `namorix.addon.*` ở một chỗ duy nhất; compose dev dùng `target: dev`.
- **Backend Thread vs Desktop:** `namorix/backend` là **host** (auth, registry, gateway). Backend trong repo này là **addon** (OpenThread/CoAP/WS domain + Express mỏng cho static/manifest). **Không** có khối logic copy từ Desktop — trùng chủ yếu **stack** và **hợp đồng** tích hợp. Viết addon mới: ưu tiên đọc spec + `namorix/documents/thread-desktop-addon-integration.md`; **không** bắt buộc SDK trong core (xem `namorix/memory-bank/systemPatterns.md`).

### Shared Package (`shared/`)

```
shared/src/
├── index.ts        # Re-exports
├── types.ts        # ConnectionStatus, OtConfig, OtThreadState, OtTableData, ...
├── events.ts       # EVENTS (SRP_REGISTER, SRP_REGISTER_RESULT, SYSTEM_INFO, ...)
├── constants.ts    # Validation limits (channel 11-26, PAN ID 0x0000-0xFFFE, etc.)
└── validation.ts   # validateBrConnectionConfig(), validateOtSetConfig()
```

Referenced via `"file:../shared"` trong cả backend và frontend package.json.

## Key Types (shared/src/types.ts)

```typescript
interface OtConfig {
  // Dataset TLV fields
  activeTimestamp?, channel?, wakeUpChannel?, channelMask?,
  extendedPanId?, meshLocalPrefix?, networkKey?, networkName?,
  panid?,  // hex string, VD: "0x1234"
  pskc?, securityPolicy?,
  // Additional
  ipaddr?,          // Leader RLOC IPv6 string
  leaderRloc16?,    // VD: "0xfc00" (tu byte 14-15 cua 16-byte IPv6)
  datasetActive?,   // hex string TLV goc
  threadVersion?,
  error?
}

interface OtThreadState {
  running?: boolean;
  state?: "leader" | "router" | "child" | "detached" | "disabled";
  error?: string;
}

interface OtTableData {
  headers?: string[];
  rows?: string[][];
  error?: string;
}
```

## Device Roles (backend/src/thread/device-role.ts)

```typescript
enum DEVICE_ROLE { DISABLED=0, DETACHED=1, CHILD=2, ROUTER=3, LEADER=4 }
```

## Dev Setup

```bash
# Install (root)
npm run install:all

# Dev (backend + frontend concurrently)
npm run dev

# Individual
npm run dev:backend   # tsx watch src/index.ts — alias tự resolve
npm run dev:frontend  # vite

# Build
npm run build         # backend: tsc && tsc-alias (alias → relative trong dist/), rồi frontend
```

`npm run dev` ở root hiện chạy song song backend/frontend/addon-watch và lint watchers (`eslint --watch` backend/frontend + `stylelint --watch` frontend) để báo lỗi style/import realtime.

**Backend scripts (backend/package.json):**
- `dev`: `tsx watch src/index.ts` — tsx tự đọc baseUrl/paths trong tsconfig, không cần tsconfig-paths.
- `build`: `tsc && tsc-alias -p tsconfig.json` — tsc compile ra dist/ (giữ nguyên alias trong JS); tsc-alias thay alias bằng relative path để `node dist/index.js` chạy được.
- `start`: `node dist/index.js`

## Database

SQLite (`better-sqlite3`, WAL mode). Migrations:
- 001–004: legacy serial_config (da xoa bang boi migration 006)
- `app_settings`: key-value (thread_run_on_connect)
- `br_connection_config`: br_host, br_port, use_mdns (mac dinh 192.168.31.3:5000 — dung khi chay Docker; co the doi qua Settings)
- 006: DROP TABLE serial_config (BR chi dung TCP, khong con Serial)
- 007: device_info, device_entity (legacy register/entities)
- 008: doi ten coap_device → device_info, coap_entity → device_entity neu da chay 007 voi ten cu
- 009 / Drizzle: **schema 8 bang** (`database.schema.ts`, migrations `data/migrations/`): device_info, device_topology, **device_topology_neighbor**, device_topology_history, device_entity, device_entity_state, device_entity_state_history, **device_health_br** (UNIQUE(device_id), free_heap, minimum_free_heap, uptime, stack_hwm, mle_detach_count; upsert on CMD_BR_HEALTH). BR config gop vao app_settings (br_host, br_port, use_mdns). Migration 0001: add device_topology_neighbor.

## Docker (backend)

- **Vi tri:** `Dockerfile.backend`, `docker-compose.yml` o thu muc goc. Build: `docker compose up --build`.
- **Cau hinh:** `network_mode: host` (reply CoAP ve Thread-Node dung **bang route cua host** — backend khong can doc/cau hinh route trong code). Volume `./data:/app/data` (host: `namorix-thread/data`). Trong image: `NAMORIX_DATA_DIR=/app/data`. Container name: `namorix-thread-backend` (docker-compose).
- **Default BR:** 192.168.31.3:5000. **mDNS trong Docker khong dung duoc**; khi chay Docker phai dung IP. "Tim BR" sau co the lam bang quet dai IP (TCP 5000). Chi tiet: `backend/README.docker.md`.

## Configuration

- **Backend**: `.env` — PORT; BACKEND_IPV6 (tuy chon, cho SRP register; neu khong set thi tu lay IPv6 qua getPreferredBackendIPv6()). Cau hinh BR (brHost, brPort) luu SQLite qua Settings.
- **Frontend**: `vite.config.ts` proxy `/api` → Thread backend. Runtime WS dùng direct Socket.IO theo `data-addon-base-url` khi chạy trong shell.

## Path Aliases

### Frontend

- **tsconfig.json** `baseUrl` + `paths`: `@/*` → src, `@shared/*`, `@features/*`, `@nodes/*`, `@settings/*`, `@status/*`.
- **vite.config.ts** `resolve.alias`: cùng mapping (resolve(__dirname, "src/...")).
- **Core alias (dev):** Vite alias `@namorix/core` → sibling `namorix/core/frontend/src` (base `siblingReposRoot = resolve(__dirname, "../..")`); `@namorix/core-shared` → `namorix/core/shared/src`. `tsconfig.json` `paths`: `@namorix/core` / `@namorix/core/*` / `@namorix/assets` dùng `../../namorix/...` và `../../namorix-assets` từ `frontend/`.
- **SCSS:** `css.preprocessorOptions.scss.loadPaths: [resolve(__dirname, "src")]` — trong .scss dùng `@use "shared/styles/variables"` hoặc `@use "shared/styles/form"` (đường dẫn từ `src/`).
- Toàn bộ import TS/TSX dùng alias; không dùng relative `../../` qua nhiều cấp.
- **Form/button styles:** Core cung cấp `.nmx-form-*` và `.nmx-btn*` / `.nmx-form-btn*` trong `namorix/core/frontend/src/styles/base/_form.scss` và `_button.scss`; import qua `@namorix/core/styles/nmx-base.scss`. Addon dùng class `nmx-form-page`, `nmx-form-card`, `nmx-form-field`, `nmx-form-control`, `nmx-form-actions`, `nmx-form-btn`, v.v. Xem `documents/namorix-core-usage.md`.

### Backend

- **tsconfig.json** `baseUrl: "."` + `paths`: `@utils/*`, `@cbor`, `@cbor/*`, `@database`, `@database/*`, `@communicate`, `@communicate/*`, `@coap/*`, `@settings/*`, `@thread/*`, `@websocket/*` → `src/...`.
- **Dev:** tsx tự resolve alias (không cần tsconfig-paths).
- **Build:** tsc giữ nguyên alias trong dist; `tsc-alias -p tsconfig.json` thay alias bằng relative path trong các file dist trước khi chạy `node dist/index.js`.

## Styling Convention

- **Token-driven**: ưu tiên CSS variables (tokens) từ `@namorix/core` và base primitives trong `nmx-base.scss`. Các feature styles dùng `var(--nmx-*)` (hoặc legacy vars mapped từ tokens) thay vì Sass global tokens. Sass-only vẫn dùng cho layout rules và component-local styling.
- **Modal/ConfirmModal:** Dark navy — overlay/blur, box $card-dark, nút Cancel ghost, Confirm danger/warning với hover glow; màu qua RGB tokens + rgba($var, opacity). **modal-dialog** dùng portal (render overlay vào body); **spin-loader** (shared/components/spinner) cho trạng thái loading; ModalAction tone/style/icon/loading. **Form/button:** Core `.nmx-form-*` (nmx-form-page, nmx-form-card, nmx-form-field, nmx-form-control, nmx-form-radio-row, nmx-form-btn, …), `.nmx-btn*`; modal alert/info trong modal.style.scss.
- **Icons:** Material Symbols (Google Fonts); Sidebar nav dùng `speed`, `account_tree`, `settings`; Settings sub-items `lan`, `device_hub`, `warning`.
- Font: Inter hoặc IBM Plex Sans (Google Fonts link trong index.html); `_fonts.scss` nếu dùng local.
- Version: `frontend/package.json` → Vite `__APP_VERSION__`; hiển thị Status subtitle; khi release cập nhật package.json và progress.md.

## Logging (pino)

Backend dung pino voi child loggers:
- `transportLogger` — transport/TCP events; khi gui SRP register: log "SRP register: IPv6=... hostname=... port=..."
- `frameLogger` — frame TX/RX (TABLE commands bi filter khoi console)
- `wsLogger` — WebSocket events
- `coapLog` (CoapDeviceServer) — CoAP request, path, CBOR→JSON log, 2.01 response

Log file: `backend/logs/` (neu cau hinh). Console: pino-pretty format.

## LAN Access

Frontend dev server: `host: true` → lang nghe `0.0.0.0:5173`. Tu may khac: `http://<IP>:5173`.

## Known Technical Constraints

- Frontend **light DOM**: Base `AppLitElement` có `createRenderRoot() { return this; }`; components extend AppLitElement hoặc LitElement và override tương tự để CSS global áp trực tiếp.
- TCP socket KHONG duoc dong khi server shutdown — BR van chay
- FrameID tu dong tang, wrap 0-0xFF; pending map giu Promise cho moi frameId
