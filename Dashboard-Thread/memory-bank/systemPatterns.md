# System Patterns — Dashboard-Thread

## High-Level Data Flow

```
BR (Thread-Host)   listen TCP port 5000
    ↓ TCP (binary frame protocol)
TransportTcp       (backend/src/communicate/transport-tcp.transport.ts)
    ↓ raw bytes stream
FrameParser        (backend/src/communicate/frame/frame.parser.ts)
    ↓ parsed Frame { frameId, cmd, data }
CommandManager     (backend/src/communicate/command.manager.ts)
    ↓ ACK/NACK resolved via pending map (frameId → Promise)
CommunicateManager (backend/src/communicate/communicate.manager.ts)
    ↓ OtConfigManager.update() + onBroadcast(event, data)
WebSocketServer    (backend/src/websocket/websocket.server.ts)
    ↓ io.emit(EVENTS.xxx, payload)
WebSocketController (frontend/src/shared/controllers/websocket.controller.ts)
    ↓ Lit reactive state update
UI Components (Lit custom elements)
  (frontend/src/features/*, frontend/src/shared/components/, app-shell)

Thread-Node  -- CoAP UDP 5683 (IPv6 [::]), path /device/
    ↓ GET /device/ping; POST /device/register/info (keys 0–6, key 0 = mac); POST /device/register/entity (key 0 = mac + key 1 array, ENTITY_KEYS 0–6, disabled); POST /device/update/topology (role-based: child 3,4,5; router/leader key 6 neighbors), /device/update/state (key 1 array, STATE_KEYS 0–6, không available)
CoAP server        (backend/src/coap/coap-device.server.ts) + DeviceCoapController + device-coap.service.ts + device.repository.ts + coap.response.ts
    ↓ registerCoapControllers(server, [DeviceCoapController]). GET ping: query ?mac= (16-char hex) → updateDeviceLastSeen; 2.05 + timestamp. POST register/info: upsert device_info (device_name_raw, COALESCE device_name), slug (device_name ?? device_name_raw ?? mac), soft-delete. POST register/entity: key 1 array (ENTITY_KEYS 0–6, disabled); merge device_entity (name_raw, COALESCE name); tra restore CBOR key 10. POST update/topology: payload role-based (child 3,4,5; router/leader key 6); device_topology_neighbor replace list. POST update/state: key 1 array (STATE_KEYS 0–6, không available). DB: device_info last_seen_at, device_name_raw; device_entity name_raw, disabled; device_entity_state không ghi available. Khong emit len frontend.

Backend (os.networkInterfaces) → getBackendAddresses() → io.emit(SYSTEM_INFO) khi CONFIG_CURRENT
    ↓
Frontend             subscribe SYSTEM_INFO → systemInfo → Status section "System" (IPv4, IPv6).

Backend (khi BR = leader) → log "SRP register: IPv6=... hostname=... port=..." (transportLogger.info) → sendSrpRegister() qua frame CMD_SRP_REGISTER (0x44) → BR dang ky _dashboard._udp len SRP server.
```

## Node Registration Patterns (Thread-Node → Backend)

- **Current model (implemented):** Thread-Node la **CoAP client** chu dong gui request len backend (CoapDeviceServer). Backend **khong** co kenh push xuong node.
- **Backend reboot / endpoint change:** Node khong co “event push” de biet backend vua reboot. Pattern khuyen nghi:
  - **Periodic refresh:** task goi discovery dinh ky (vd. 60s) + cache TTL de cap nhat endpoint.
  - **On failure:** neu CoAP timeout/ICMP unreachable → `force_refresh=true` → browse SRP lai → gui lai request.
- **GET /device/ping:** Node gui GET dinh ky; backend tra 2.05 voi payload 4 byte = timestamp (uint32 LE, server start). Node so sanh timestamp; neu khac lan truoc (backend restart) → callback trigger gui lai POST /device/register.
- **CoAP response path:** Backend (node-coap) tra response ve **rsinfo** (source IP:port cua request). Node gui request tu dia chi **OMR** (vd. fdb8:3795:e886:1:...) va port 5683; node con co **mesh-local** (fd18:... theo BR). Neu node bao **ResponseTimeout** = response khong toi node: kiem tra **route** tren host backend toi prefix Thread qua BR, va **BR forward** (border routing) tu backhaul vao Thread. BR ESP32-S3 + RCP: forward trong firmware; OTBR Linux: can IPv6 forwarding + ip6tables FORWARD.

## Backend Layer Responsibilities

| Module | File | Vai tro — TUYET DOI KHONG vi pham |
|---|---|---|
| `WebSocketServer` | `backend/src/websocket/websocket.server.ts` | CHỈ wire: tạo handler instances (handler/), on connection gọi sendCurrentConfig/sendBrStatus + emit last* data, đăng ký socket.on(event) từ getWsRoutes(handler.constructor). Không gọi CommunicateManager khi client connect/disconnect (đã bỏ frontend connection count). Business logic trong handler/*. |
| `CommunicateManager` | `backend/src/communicate/communicate.manager.ts` | Owner cua toan bo transport + frame. Dieu phoi TransportTcp, polling, broadcast |
| `TransportTcp` | `backend/src/communicate/transport-tcp.transport.ts` | TCP client: open(host, port), writeRaw, onRawData, setOnDisconnect |
| `BrConnectionService` | `backend/src/settings/br-connection.service.ts` | Cau hinh BR (brHost, brPort, useMdns) qua app-settings.repository (key-value trong app_settings) |
| `CommandManager` | `backend/src/communicate/command.manager.ts` | Frame TX/RX. Pending map (frameId → resolve/reject). ACK/NACK routing. Timeout; replyAck cho IP_ADDR. Log ẩn CMD STATE và ACK (RX + TX). |
| `OtConfigManager` | `backend/src/thread/ot-config.manager.ts` | In-memory store. `.update(partial)` de merge, `.get()` de doc, `.clear()` khi disconnect |
| `PollingManager` | `backend/src/thread/thread-polling.manager.ts` | Fallback table polling (notify-first); state poll 5s do CommunicateManager, tables theo CMD_NOTIFY + baseline on connect. Không gating theo số client frontend. |
| `AppSettingsService` | `backend/src/settings/app-settings.service.ts` | SQLite key-value cho app settings (thread_run_on_connect) |
| CoAP server | `backend/src/coap/coap-device.server.ts` + `device-coap.controller.ts` + `device-coap.service.ts` + `database/repositories/device.repository.ts` + `coap.response.ts` | CoAP UDP 5683 (udp6, [::]). Paths: /device/ping, register/info, register/entity, update/info, update/entity, update/topology, update/state. CoapStatus (coap.type.ts); sendCoapResponse/echoCoapToken (coap.response.ts); parseCborOrRespond (controller). GET ping → 2.05 + timestamp. POST register/info: upsert device_info (mac_address), slug (generateSlug); soft-delete; topology optional (rloc16, parent_rloc16, role, rssi, link_quality). POST register/entity: merge device_entity, tra restore CBOR (key 10). POST update/*: update info, entity def, topology (role-based; device_topology_neighbor cho router/leader), state. DB qua Drizzle type-safe (device.repository, app-settings.repository). SQLite 7 bang. Khong emit qua io |

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
| SRP_REGISTER | 0x44 | hostname_len(1) + hostname(N) + backend_ipv6(16) + port(2 BE) |
| NOTIFY | 0x45 | Thread-Host → Backend: push notify thay đổi (payload u32 BE changed_mask) |

### NACK Codes

`RESERVED=0x00, INVALID_CMD=0x01, NOT_READY=0x02, TIMEOUT=0x03, INVALID_PARAM=0x04, BUSY=0x05`

## Key Behavioral Patterns

### Polling Strategy

- **Keep polling STATE only:** `CMD_STATE` mỗi **5 giây** (health + role changes).
- **Notify-first:** dataset/ip/tables ưu tiên fetch theo `CMD_NOTIFY` (debounce + merge mask).
- **Baseline on connect:** mỗi lần TCP connect thành công sẽ pull baseline để UI không stale nếu missed notify.

### Auto-Start Thread

**Dieu kien:** `thread_run_on_connect = true` AND state poll tra ve `disabled`

Khong check lien tuc — tich hop vao pullState(). Khi port dong: set flag `portClosedWhileRunning`. Khi reconnect: pullState() check auto-start theo co do.

### BR Reconnect

Mat ket noi BR (TCP) → tu dong thu lai sau **3 giay**. Khi server dong: KHONG dong TCP (BR van chay).

### Consecutive Failure Guard

CMD_STATE that bai **5 lan lien tiep** → dong transport + bat dau reconnect.

## Frontend Patterns (Lit)

### State Management

- `WebSocketController` (`frontend/src/shared/controllers/websocket.controller.ts`) = **single source of truth** cho WS state + actions.
- Root `app-shell` tạo controller và truyền state/callback xuống các component qua property.
- Socket URL: `window.location.origin` (LAN-friendly via Vite proxy).
- **Path alias:** Import dùng `@shared/*`, `@nodes/*`, `@settings/*`, `@status/*`, `@/` (tsconfig + Vite alias). SCSS: `loadPaths: [src]` → `@use "shared/styles/variables"` / `shared/styles/form`.

### Backend path aliases

- Backend dung **path alias** trong tsconfig (`baseUrl` + `paths`): `@utils/*`, `@cbor`, `@database`, `@communicate`, `@coap/*`, `@settings/*`, `@thread/*`, `@websocket/*` → `src/...`. Dev: **tsx** tu resolve; build: **tsc** compile roi **tsc-alias** thay alias bang relative path trong dist/.

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

### Age Counter Pattern (Nodes)

Implemented trong `nodes.component.ts` (Lit): lưu `routerAgeOffsets` / `childAgeOffsets` và tick mỗi giây để age tăng client-side, reset offsets khi backend gửi rows mới (so sánh reference).

### Leader Row Highlight

- So sánh RLOC16 với `otConfig?.leaderRloc16`. Chỉ hiển thị badge "LEADER" trong cell (không nền xanh lá cả dòng).

### Nodes Page Structure

- Trang Nodes: header (title + subtitle + nút Commission Node), Router Table, Child Table, Joiner List (pending commissioning). Khi BR disconnect: overlay phủ main (backdrop blur), card "Border Router Disconnected" + Try Reconnecting; nội dung phía sau giống layout khi connect (ghost), không bọc trong box riêng.
- Stable list rendering: joiner card `joiner-${sharedId}-${expirationMs}`; router/child row theo RLOC16 (fallback theo index); modal detail dùng `fieldKey` (tên cột).

### Toast Notifications

- API: `showToast(type, message, duration?)` — type = success | error | warning | info.
- Title suy từ type (Thành công / Lỗi / Cảnh báo / Trợ giúp). Dark theme: card `$card-dark`, thanh dọc trái màu theo type, message muted, nút đóng góc trên-phải; slide-in từ phải, fade-out khi exit.
- Không dùng thư viện bên thứ ba — ToastContainer + ToastContext + SCSS.

### Sidebar Status Dot Colors

Status dot tren Sidebar (header) dung chung mapping mau:
`leader=green | router=purple | child=blue | disabled/detached=orange | disconnected=gray`

### Status Page — Connected vs Disconnected

- **Connected:** BR card với vùng icon lớn (router), badge Connected, Host Address, Uptime, nút Refresh; OpenThread grid 3×4 (label UPPERCASE, giá trị accent cho Network Name / IP), Channel có badge "2.4 GHz", Network Key có nút show/hide; **System** section (cùng style bảng): IPv4 (backend), IPv6 (backend) từ systemInfo.
- **Disconnected:** BR card layout ngang: icon tròn 48px đỏ (link_off) + label "BR Connection Status" + chữ "DISCONNECTED" + chấm đỏ pulse + nút Refresh. OpenThread: ghost grid (opacity 0.4, blur) + overlay card (backdrop-blur) "No Network Data Available" + nút "Configure Border Router" gọi `onConfigureBr` (App truyền `() => setPage("settings")`).

### Version Display

Version hiển thị trên Status subtitle lấy từ `frontend/package.json`: Vite `define { __APP_VERSION__: JSON.stringify(pkg.version) }`, `src/vite-env.d.ts` declare `__APP_VERSION__`. Cập nhật version khi release tại `frontend/package.json` (đồng bộ với progress.md).

### Modal & ConfirmModal (dark navy)

- **Modal:** Overlay dark navy `rgba(6,11,25,0.78)` + `backdrop-filter: blur(6px)`; box `$card-dark`, border `$brand-border`, shadow đậm; header border-bottom subtle; title/close dùng `$text-dark` / `$text-dark-subtle`.
- **ConfirmModal:** Message `$text-dark`; nút Cancel: transparent, border muted, hover nền navy; nút Confirm danger `#ef4444` / warning `#f97316` với hover glow. Countdown 5s không đổi.
- **Light DOM note:** `modal-dialog` không dùng `<slot>` nữa; nội dung được truyền qua property `.body` (TemplateResult) để render đúng khi tắt Shadow DOM.

### Sidebar Settings sub-items

- Dropdown Settings có 3 mục con với icon Material Symbols trước label: **BR Connection** `lan`, **OpenThread** `device_hub`, **System** `warning`. Class `sidebar-nav-nested-icon` font-size 16px.

### Settings / System page

- Layout: `form-page system-page`; header (title "Hệ thống", mô tả, hint khi chưa kết nối BR); hai **action cards** (image panel trái + content phải), danger divider giữa, ConfirmModal cho Reset và Factory Reset. Card Restart: nền #111827, icon cam; Card Factory: nền tối đỏ, border #3d1a1a, title đỏ. Nút dùng `.system-btn-orange` / `.system-btn-red`.

### OpenThread form card layout

- `.form-card.ot-card`: `padding: 0`, `overflow: hidden` để footer không lồi góc. `.ot-card-header` full-bleed (padding riêng). `.ot-card-footer` margin `20px 1.75rem 1.75rem` (cùng width với body), border-radius, nền #111722.
