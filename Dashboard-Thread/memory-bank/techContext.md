# Tech Context — Dashboard-Thread

## Project Structure

```
Dashboard-Thread/          # npm workspaces root
├── package.json           # Root: scripts + workspaces config
├── backend/               # Node.js + TypeScript server
├── frontend/              # React + Vite + SCSS
├── shared/                # Pure TypeScript, shared by both
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

Transport: TCP only (net.Socket). Khong con serialport.

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
├── types.ts        # SerialConfig, SerialStatus, OtConfig, OtThreadState, OtTableData
├── events.ts       # EVENTS const (all WebSocket event name strings)
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

SQLite (`better-sqlite3`, WAL mode). 5 migrations:
- `serial_config` (legacy, co the khong dung)
- `app_settings`: key-value (thread_run_on_connect)
- `br_connection_config`: br_host, br_port, use_mdns (mac dinh Thread-Host.local:5000)

## Configuration

- **Backend**: `.env` — PORT. Cau hinh BR (brHost, brPort) luu SQLite qua Settings.
- **Frontend**: `vite.config.ts` proxy `/api` + `/socket.io` → backend. Override WS URL bang `VITE_WS_URL`

## Styling Convention

- SCSS co-located voi component (VD: `Dashboard.tsx` + `Dashboard.scss`)
- Import truc tiep: `import "./Dashboard.scss"`
- KHONG dung CSS modules hay styled-components — plain SCSS voi BEM-style class names

## Logging (pino)

Backend dung pino voi child loggers:
- `serialLogger` — transport/TCP events (ten file giu de tranh doi ref)
- `frameLogger` — frame TX/RX (TABLE commands bi filter khoi console)
- `wsLogger` — WebSocket events

Log file: `backend/logs/` (neu cau hinh). Console: pino-pretty format.

## LAN Access

Frontend dev server: `host: true` → lang nghe `0.0.0.0:5173`. Tu may khac: `http://<IP>:5173`.

## Known Technical Constraints

- React Strict Mode → double mount → double WS connection trong dev (expected, khong phai bug)
- TCP socket KHONG duoc dong khi server shutdown — BR van chay
- FrameID tu dong tang, wrap 0-0xFF; pending map giu Promise cho moi frameId
