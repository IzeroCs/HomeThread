# Tech Context — Dashboard-Thread

## Project Structure

```
Dashboard-Thread/          # npm workspaces root
├── package.json           # Root: scripts + workspaces config
├── backend/               # Node.js + TypeScript server
├── frontend/              # React + Vite + SCSS
├── shared/                # Pure TypeScript, shared by both
├── supervisor/            # Python stdlib daemon: socket + watch device (khong thuoc npm workspaces)
├── otbr/                  # OTBR Docker (Dockerfile, entrypoint, README)
└── memory-bank/           # Cursor Memory Bank files
```

## Tech Stack

### Backend

| Package | Version | Usage |
|---|---|---|
| Node.js | >=18 | Runtime |
| TypeScript | ^5.7.2 | Language |
| tsx | ^4.19.2 | Dev runner (watch mode) |
| socket.io | ^4.7.5 | WebSocket server |
| better-sqlite3 | ^11.7.0 | SQLite (WAL mode) |
| pino | ^9.5.0 | Structured logging |
| pino-pretty | latest | Pretty console output |

Transport: **D-Bus** (dbus-next) toi OTBR (otbr-agent); CoAP (UDP 5683, udp6 listen [::]) from Thread-Node. Dependencies: `dbus-next`, `coap`. CBOR payload decode bang **thu vien noi bo** `backend/src/cbor`. Thread-Node la ben **chu dong** (CoAP client); GET /device/ping nhan timestamp de phat hien backend restart va gui lai register. Response CoAP phai **routable** toi node: host backend can route toi prefix Thread (OMR) qua BR; BR phai forward packet tu backhaul vao Thread (border routing). Neu node bao ResponseTimeout → xem docs troubleshooting (routing/BR).

### Frontend

| Package | Version | Usage |
|---|---|---|
| React | ^19.0.0 | UI framework |
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
└── validation.ts   # validateSerialConfig(), validateOtSetConfig()
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

## Device Roles (backend/src/openthread/deviceRole.ts)

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
npm run dev:backend   # tsx watch
npm run dev:frontend  # vite

# Build
npm run build         # backend then frontend
```

## Database

SQLite (`better-sqlite3`, WAL mode). 6 migrations:
- 001–004: legacy serial_config (da xoa bang boi migration 006)
- `app_settings`: key-value (thread_run_on_connect)
- `br_connection_config`: bang van ton tai (migration 005) nhung khong dung — ket noi OTBR chi qua D-Bus; BrConnectionConfigService da xoa
- 006: DROP TABLE serial_config

## Supervisor (host daemon)

- **Vi tri:** `supervisor/` — Python 3 stdlib only (khong pip). `server.py`: Unix socket `/var/run/izerocs/supervisor.sock` + thread watch device (neu set `DEVICE_PATH`).
- **Socket:** Backend hoac supervisor (ai chay truoc) tao folder `/var/run/izerocs`; supervisor bind sock, nhan lenh `restart-otbr` / `health`, tra `ok` hoac `error: ...`. Xac thuc bang quyen file (khong token).
- **Watch device:** Env `DEVICE_PATH` (vd. /dev/ttyACM0), `INTERVAL` (giay), `OTBR_CONTAINER_NAME`, `DOCKER`. Device mat → `docker restart`.
- **Backend:** `backend/src/supervisor/socketClient.ts` — `restartOtbr()`, `requestSupervisor(cmd)`; env `SUPERVISOR_SOCK_DIR`. Backend khoi dong mkdir `/var/run/izerocs`. Backend Docker can volume `/var/run/izerocs:/var/run/izerocs`.
- **Systemd:** `sudo bash ./supervisor/install-supervisor-service.sh [container] [device]` → unit `dashboard-thread-supervisor.service` (ExecStartPre IP forwarding). Doc: `supervisor/README.md`.

## Docker (backend, OTBR)

- **Backend:** `Dockerfile.backend`, `docker-compose.yml` o thu muc goc. De backend **thay OTBR**: chay backend trong Docker voi volume `otbr-dbus:/run/dbus` (cung OTBR), env `DBUS_SYSTEM_BUS_ADDRESS=unix:path=/run/dbus/system_bus_socket`; `network_mode: host`, volume `./backend/data:/app/data`. Optional: mount source backend de dev khong can build lai. Backend chay **tren host** (`npm run dev:backend`) **khong** thay OTBR khi OTBR dung D-Bus trong container — da thu mount host /run/dbus vao OTBR container, otbr-agent khong dang ky tren host bus. Chi tiet: `backend/README.docker.md` (neu co).
- **OTBR:** Service `otbr` — entrypoint doi RCP (by-id) roi exec /init; mount /dev, volume `otbr-data`; volume `otbr-dbus:/run/dbus` khi can backend container ket noi. Rut RCP → supervisor (watch device) restart container. Doc: `otbr/README.md`.

## Configuration

- **Backend**: `.env` — PORT. Ket noi OTBR qua D-Bus (volume otbr-dbus); khi chay container set `DBUS_SYSTEM_BUS_ADDRESS=unix:path=/run/dbus/system_bus_socket`.
- **Frontend**: `vite.config.ts` proxy `/api` + `/socket.io` → backend. Override WS URL bang `VITE_WS_URL`

## Styling Convention

- **SCSS only** — không dùng Tailwind. Design theo mockup (ThreadDash) implement bằng SCSS; theme **dark navy** (card-dark, brand-border, text-dark).
- SCSS co-located với component (VD: `Nodes/Nodes.scss`, `Status.scss`); biến chung `frontend/src/styles/_variables.scss` (dark: $bg-dark, $card-dark, $primary-blue, $brand-border, $text-dark, $lq-good, $lq-warn).
- **Modal/ConfirmModal:** Dark navy — overlay blur, box $card-dark, nút Cancel ghost, Confirm danger/warning với hover glow.
- **Icons:** Material Symbols (Google Fonts); Sidebar nav dùng `speed`, `account_tree`, `settings`; Settings sub-items `lan`, `device_hub`, `warning`.
- Font: Inter hoặc IBM Plex Sans (Google Fonts link trong index.html); `_fonts.scss` nếu dùng local.
- Version: `frontend/package.json` → Vite `__APP_VERSION__`; hiển thị Status subtitle; khi release cập nhật package.json và progress.md.

## Logging (pino)

Backend dung pino voi child loggers:
- `transportLogger` — OTBR/D-Bus events
- `wsLogger` — WebSocket events
- `coapLog` (CoapDeviceServer) — CoAP request, path, CBOR→JSON log, 2.01 response

Log file: `backend/logs/` (neu cau hinh). Console: pino-pretty format.

## LAN Access

Frontend dev server: `host: true` → lang nghe `0.0.0.0:5173`. Tu may khac: `http://<IP>:5173`.

## Known Technical Constraints

- React Strict Mode → double mount → double WS connection trong dev (expected, khong phai bug)
- OtbrDbusClient dung ten method/property D-Bus theo ot-br-posix; neu image OTBR khac co the can dieu chinh
