# Tech Context — Dashboard-Thread

## Project Structure

```
Dashboard-Thread/          # npm workspaces root
├── package.json           # Root: scripts + workspaces config
├── backend/               # Node.js + TypeScript server
│   └── src/
│       ├── coap/          # CoAP server (decorator), CoapStatus, coap.response, DeviceCoapController, device-coap.service, device.payload (DeviceInfoPayload, DeviceTopologyPayload, entity, state)
│       ├── communicate/   # TransportTcp, CommandManager, CommunicateManager, frame (parser/builder/constants)
│       ├── settings/      # BrConnectionConfigService, AppSettingsService
│       ├── thread/        # OtConfigManager, PollingManager, device-role, thread-data
│       ├── websocket/     # WebSocketServer; handler/ (config, br, device, thread, commissioner, srp); ws.type, ws.decorator (@WsOn, getWsRoutes)
│       ├── database/      # SQLite, Drizzle schema + migrations (data/migrations), repositories (device, app-settings)
│       ├── cbor/          # CBOR decode (noi bo)
│       └── utils/         # logger, ipv6
├── frontend/              # Lit + Vite + SCSS
│   └── src/
│       ├── features/      # nodes, settings, status (page + components)
│       ├── shared/        # components, controllers, types, styles
│       ├── app-shell.ts
│       └── main.ts
├── shared/                # Pure TypeScript package (types, events, constants, validation)
└── memory-bank/           # Cursor Memory Bank files
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

Transport: TCP (net.Socket) to BR; CoAP (UDP 5683, udp6 listen [::]) from Thread-Node. Dependencies: `coap`. CBOR decode/encode noi bo (`backend/src/cbor`). Thread-Node la **CoAP client**: GET /device/ping; POST /device/register/info (keys 0–6, key 0 = mac), /device/update/topology (payload flat key 0 = mac, 1–6), /device/register/entity, /device/update/entity, /device/update/state (key 0 = mac, **key 1** = array). ENTITY_KEYS 0–6 (disabled key 6); STATE_KEYS 0–6 (không available). Spec payload: docs/coap/device_payload_spec.md. Backend luu 6 bang (device_entity có disabled; device_entity_state không còn ghi available); tra qua sendCoapResponse. ResponseTimeout → docs troubleshooting.

### Frontend

| Package | Version | Usage |
|---|---|---|
| Lit | ^3.x | UI framework (Web Components) |
| TypeScript | ~5.6.3 | Language |
| Vite | ^6.0.3 | Build tool + dev server |
| SCSS (sass) | ^1.83.0 | Styling |
| socket.io-client | ^4.7.5 | WebSocket client |

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
- 009 / Drizzle: **schema 6 bang** (`database.schema.ts`, migrations `data/migrations/`): device_info (mac_address TEXT UNIQUE, device_slug), device_topology (rloc16, parent_rloc16, role, **rssi**, **link_quality**), device_topology_history (cung cac cot + recorded_at), device_entity (restore_mode, deleted_at), device_entity_state, device_entity_state_history. BR config gop vao app_settings (br_host, br_port, use_mdns).

## Docker (backend)

- **Vi tri:** `Dockerfile.backend`, `docker-compose.yml` o thu muc goc. Build: `docker compose up --build`.
- **Cau hinh:** `network_mode: host` (reply CoAP ve Thread-Node dung **bang route cua host** — backend khong can doc/cau hinh route trong code). Volume chi `./backend/data:/app/data`. Container name: `dashboard-thread-backend`.
- **Default BR:** 192.168.31.3:5000. **mDNS trong Docker khong dung duoc**; khi chay Docker phai dung IP. "Tim BR" sau co the lam bang quet dai IP (TCP 5000). Chi tiet: `backend/README.docker.md`.

## Configuration

- **Backend**: `.env` — PORT; BACKEND_IPV6 (tuy chon, cho SRP register; neu khong set thi tu lay IPv6 qua getPreferredBackendIPv6()). Cau hinh BR (brHost, brPort) luu SQLite qua Settings.
- **Frontend**: `vite.config.ts` proxy `/api` + `/socket.io` → backend. Override WS URL bang `VITE_WS_URL`

## Path Aliases

### Frontend

- **tsconfig.json** `baseUrl` + `paths`: `@/*` → src, `@shared/*`, `@features/*`, `@nodes/*`, `@settings/*`, `@status/*`.
- **vite.config.ts** `resolve.alias`: cùng mapping (resolve(__dirname, "src/...")).
- **SCSS:** `css.preprocessorOptions.scss.loadPaths: [resolve(__dirname, "src")]` — trong .scss dùng `@use "shared/styles/variables"` hoặc `@use "shared/styles/form"` (đường dẫn từ `src/`).
- Toàn bộ import TS/TSX dùng alias; không dùng relative `../../` qua nhiều cấp.

### Backend

- **tsconfig.json** `baseUrl: "."` + `paths`: `@utils/*`, `@cbor`, `@cbor/*`, `@database`, `@database/*`, `@communicate`, `@communicate/*`, `@coap/*`, `@settings/*`, `@thread/*`, `@websocket/*` → `src/...`.
- **Dev:** tsx tự resolve alias (không cần tsconfig-paths).
- **Build:** tsc giữ nguyên alias trong dist; `tsc-alias -p tsconfig.json` thay alias bằng relative path trong các file dist trước khi chạy `node dist/index.js`.

## Styling Convention

- **SCSS only** — không dùng Tailwind. Design theo mockup (ThreadDash) implement bằng SCSS; theme **dark navy** (card-dark, brand-border, text-dark).
- SCSS co-located với component (VD: `features/nodes/nodes.style.scss`, `shared/components/modal/modal.style.scss`); biến chung `frontend/src/shared/styles/variables` (dark: $bg-dark, $card-dark, $primary-blue, $brand-border, $text-dark, $lq-good, $lq-warn). Import trong SCSS: `@use "shared/styles/variables" as *`.
- **Modal/ConfirmModal:** Dark navy — overlay blur, box $card-dark, nút Cancel ghost, Confirm danger/warning với hover glow.
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

- Frontend đang render **light DOM** (tắt Shadow DOM) bằng `createRenderRoot() { return this; }` trong các Lit components để CSS global áp trực tiếp.
- TCP socket KHONG duoc dong khi server shutdown — BR van chay
- FrameID tu dong tang, wrap 0-0xFF; pending map giu Promise cho moi frameId
