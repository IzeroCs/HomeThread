# System Patterns — Dashboard-Thread

## High-Level Data Flow

```
BR (Thread-Host)   listen TCP port 5000
    ↓ TCP (binary frame protocol)
TransportTcp       (backend/src/communicate/TransportTcp.ts)
    ↓ raw bytes stream
FrameParser        (backend/src/communicate/frame/frameParser.ts)
    ↓ parsed Frame { frameId, cmd, data }
CommandManager     (backend/src/communicate/CommandManager.ts)
    ↓ ACK/NACK resolved via pending map (frameId → Promise)
CommunicateManager (backend/src/communicate/CommunicateManager.ts)
    ↓ OtConfigManager.update() + onBroadcast(event, data)
WebSocketServer    (backend/src/server/WebSocketServer.ts)
    ↓ io.emit(EVENTS.xxx, payload)
useWebSocket hook  (frontend/src/hooks/useWebSocket.ts)
    ↓ React state update
UI Components      (frontend/src/components/)
```

## Backend Layer Responsibilities

| Module | File | Vai tro — TUYET DOI KHONG vi pham |
|---|---|---|
| `WebSocketServer` | `backend/src/server/WebSocketServer.ts` | CHI relay socket events ↔ CommunicateManager. KHONG chua business logic hay transport logic |
| `CommunicateManager` | `backend/src/communicate/CommunicateManager.ts` | Owner cua toan bo transport + frame. Dieu phoi TransportTcp, polling, broadcast |
| `TransportTcp` | `backend/src/communicate/TransportTcp.ts` | TCP client: open(host, port), writeRaw, onRawData, setOnDisconnect |
| `BrConnectionConfigService` | `backend/src/communicate/BrConnectionConfigService.ts` | SQLite CRUD cho cau hinh BR (brHost, brPort, useMdns) |
| `CommandManager` | `backend/src/communicate/CommandManager.ts` | Frame TX/RX. Pending map (frameId → resolve/reject). ACK/NACK routing. Timeout |
| `OtConfigManager` | `backend/src/communicate/OtConfigManager.ts` | In-memory store. `.update(partial)` de merge, `.get()` de doc, `.clear()` khi disconnect |
| `PollingManager` | `backend/src/communicate/PollingManager.ts` | Poll table 6s (child +1.5s delay). CHI khi frontend connected + state = leader/router/child |
| `AppSettingsService` | `backend/src/services/AppSettingsService.ts` | SQLite key-value cho app settings (thread_run_on_connect) |

## Frame Protocol

**Format:** `SOF(0xAA) | FrameID(1) | CMD(1) | LEN_H(1) | LEN_L(1) | DATA(N) | CRC8(1) | EOF(0x55)`

**CRC8-Maxim** tinh tren `[FrameID, CMD, LEN_H, LEN_L, ...DATA]`

**Nguon chinh xac:** `backend/src/communicate/frame/constants.ts` — TUYET DOI KHONG hardcode hex literal.

### CMD Codes (quan trong)

| CMD | Hex | Mo ta |
|---|---|---|
| DATA | 0x01 | Firmware push (CBOR, chua xu ly) |
| ACK | 0x02 | ACK response |
| NACK | 0x03 | NACK response |
| STATE | 0x12 | Thread state (1 byte: 0=DISABLED..4=LEADER) |
| IP_ADDR | 0x13 | 16-byte binary IPv6 Leader RLOC. Byte 14-15 = RLOC16 |
| DATASET_ACTIVE | 0x14 | TLV hex string |
| SET_PANID..SET_NETWORK_KEY | 0x20-0x24 | Set config fields |
| ROUTER_TABLE..JOINER_TABLE | 0x30-0x32 | Table data (binary) |
| THREAD_START/STOP | 0x40-0x41 | Khoi dong/dung Thread |
| THREAD_VERSION | 0x42 | Phien ban OpenThread |
| COMMISSIONER_JOINER | 0x43 | EUI64(8) + PSKD_len(1) + PSKD(var) + Timeout(4) |

### NACK Codes

`RESERVED=0x00, INVALID_CMD=0x01, NOT_READY=0x02, TIMEOUT=0x03, INVALID_PARAM=0x04, BUSY=0x05`

## Key Behavioral Patterns

### Polling Strategy

- `CMD_STATE` poll moi **5 giay**
- Dataset active / IP addr: chi fetch khi **state thay doi**
- Thread version: chi fetch **1 lan** (`threadVersion == null`)
- Table polling: chi khi **co frontend connected + state = leader/router/child**

### Auto-Start Thread

**Dieu kien:** `thread_run_on_connect = true` AND state poll tra ve `disabled`

Khong check lien tuc — tich hop vao pullState(). Khi port dong: set flag `portClosedWhileRunning`. Khi reconnect: pullState() check auto-start theo co do.

### BR Reconnect

Mat ket noi BR (TCP) → tu dong thu lai sau **3 giay**. Khi server dong: KHONG dong TCP (BR van chay).

### Consecutive Failure Guard

CMD_STATE that bai **5 lan lien tiep** → dong transport + bat dau reconnect.

## Frontend Patterns

### State Management

- `useWebSocket` (`frontend/src/hooks/useWebSocket.ts`) = **source of truth duy nhat**
- Tat ca component dung `useWebSocketContext()` — KHONG tao socket rieng
- Socket URL: `window.location.origin` (LAN-friendly via Vite proxy)

### Event System

**TUYET DOI KHONG dung string literal** trong socket emit/on:

```typescript
// DUNG
import { EVENTS } from "shared";
socket.emit(EVENTS.OT_SET_CONFIG, payload);
socket.on(EVENTS.OT_CONFIG, handler);

// SAI
socket.emit("ot:setConfig", payload); // string literal
```

### Validation Strategy

- **Frontend**: CHI check "khong duoc de trong" — khong validate format/range
- **Backend**: Toan bo validation chi tiet (EUI64 format, PSKd alphabet, channel range...)
- **Error display**: Frontend hien thi message tu backend via WebSocket event result

### Age Counter Pattern (Dashboard)

```typescript
const [ageOffsets, setAgeOffsets] = useState<number[]>([]);
const lastRowsRef = useRef<string[][]>([]);
// Reset offset khi rows moi tu backend
useEffect(() => {
  if (data.rows !== lastRowsRef.current) {
    lastRowsRef.current = data.rows ?? [];
    setAgeOffsets(new Array(data.rows?.length ?? 0).fill(0));
  }
}, [data.rows]);
// Dem len moi giay
useEffect(() => {
  const interval = setInterval(() => setAgeOffsets(p => p.map(o => o + 1)), 1000);
  return () => clearInterval(interval);
}, []);
```

### Leader Row Highlight

```typescript
const isLeaderRow = leaderRloc16 != null &&
  row[rloc16ColIndex]?.toLowerCase() === leaderRloc16.toLowerCase();
// CSS class: dashboard-table-row-leader → background rgba(34,197,94,0.15)
```

### Toast Notifications

```typescript
import { useToast } from "../contexts/ToastContext";
const { showToast } = useToast();
showToast("message", "success" | "error" | "info" | "warning");
```

### TopNav State Colors

`leader=green | router=purple | child=blue | disabled/detached=orange | disconnected=gray`
