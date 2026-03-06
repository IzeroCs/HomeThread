# Progress — Dashboard-Thread

Version notation in this file uses Semantic Versioning `MAJOR.MINOR.PATCH` (no leading `v`). Examples: `0.8.0`, `0.9.0`, `1.0.0`. If only major/minor are known, use `PATCH = 0`.

## Release history

*(Các mốc trước 0.9.0 suy từ migration/progress; repo không có git tag/CHANGELOG. Chỉnh sửa nếu bạn có mốc chính xác.)*

| Version | Notes |
|---------|--------|
| 0.1.0   | Thời CLI: giao tiếp OpenThread qua CLI text (trước migration frame). |
| 0.5.0   | Frame protocol: bỏ CLI, raw serial, parser/builder/CRC8, CMD_ACK/NACK, pull state, dataset parse, set config cơ bản. |
| 0.8.0   | Tables + Commissioner: CMD_ROUTER_TABLE/CHILD_TABLE/JOINER_TABLE, CMD_COMMISSIONER_JOINER, Reset/Factory, leader highlight, age/expiration countdown, Thread start/stop. |
| 0.9.0   | Shared package, Memory Bank, polish. |
| 1.0.0   | Migration BR: chi TCP, bo Serial. TransportTcp, BrConnectionConfigService, BrConnectionForm, Settings BR Connection. CMD_DATA da bo. UI: dark theme, ThreadDash; Status connected/disconnected (ghost grid + overlay); version tu frontend/package.json. Nav: Status, Nodes, Settings (bo Console, Topology). Trang Nodes: Router Table + Child Table + Joiner List; Commission Node modal (khong con trang Commissioner rieng). Toast dark (thanh doc trai, title theo type). Stable React keys (joiner, router/child row, modal, LqBarsCell). Joiner countdown local (initialSeconds + receivedAt). |
| 1.1.0   | UI dark navy: Modal/ConfirmModal dark theme (overlay blur, card-dark, ghost cancel, danger/warning buttons + glow). Settings/System: action cards (Restart + Factory Reset), image panel, danger divider "Vung nguy hiem". Sidebar Settings sub-items: icons `lan`, `device_hub`, `warning`. OpenThread card: header full-bleed, footer same width as body, overflow hidden. |
| 1.2.0   | Child data (CoAP): Backend CoAP server UDP 5683 (CoapChildDataServer), resources /child/register, /child/update, /child/ping; nhan full CBOR, parse, emit subset (CHILD_DATA) len frontend. Frontend Status section "Child data (CoAP)". Shared CHILD_DATA, ChildDataPayload. Doc Thread-Node: docs/coap/thread_node_coap.md. |
| 1.3.0   | SRP register qua frame: CMD_SRP_REGISTER (0x44), DATA hostname_len+hostname+backend_ipv6(16)+port(2 BE). Backend tu dong gui khi BR la leader (pullState); IPv6 tu env hoac getPreferredBackendIPv6(). Status: bo "Child data (CoAP)"; them section **System** (bang giong OpenThread): IPv4/IPv6 backend tu SYSTEM_INFO (getBackendAddresses()). Events SRP_REGISTER, SRP_REGISTER_RESULT, SYSTEM_INFO. Bo STATE_FAKE_PAYLOAD; sendState(undefined) = payload rong. |
| 1.4.0   | CoAP device: Doi ten CoapChildDataServer → CoapDeviceServer; path chi /device/ (register, update, ping). Bo EVENTS.CHILD_DATA, ChildDataPayload; backend khong emit len frontend. CoAP server udp6 listen [::]:5683 (nhan IPv6 Thread-Node). Parse CBOR (cbor2), log "CoAP CBOR -> JSON: ...". Migration 006: DROP TABLE serial_config. |
| 1.5.0   | CoAP: CBOR decode **noi bo** (backend/src/cbor), bo dependency cbor2. GET /device/ping → 2.05 Content, payload 4 byte timestamp uint32 LE (gia tri luc khoi tao server; restart = timestamp moi). Thread-Node so sanh timestamp → neu doi goi lai register. Payload register: role la **so** (0=child, 1=router, 2=leader). Log structure: device_id, device_name, device_type, rloc16, role, entities. |


## What Works (Completed)

### Infrastructure

- npm workspaces monorepo (backend + frontend + shared)
- SQLite database (WAL mode, 6 migrations: app_settings, br_connection_config; migration 006 drop serial_config)
- Shared package: types, events, constants, validation
- pino logging voi child loggers (transportLogger, frameLogger, wsLogger)
- Table log filtering (ROUTER/CHILD/JOINER TX + ACK bi an)
- Cursor Memory Bank (memory-bank/)
- Symlink docs → HomeThread/Documents/ (Dashboard-Thread + ESP-Thread/Thread-Host)

### Backend — Frame Protocol

- Frame parser (state machine, streaming)
- Frame builder + CRC8-Maxim
- CommandManager: pending map, frameId rotation, timeout, ACK/NACK routing
- CommunicateManager: orchestrates TransportTcp + frame (khong con Serial)
- TransportTcp: TCP client (open/close/writeRaw/onRawData/setOnDisconnect)
- BrConnectionConfigService: SQLite br_host, br_port, use_mdns
- PollingManager: poll 6s (chi khi frontend connected + state active)
- BR auto-reconnect (3s interval)
- Consecutive failure guard (5 lan → close + reconnect)
- TCP KHONG dong khi server shutdown

### Backend — Commands

- CMD_STATE (poll 5s, device role parse)
- CMD_DATASET_ACTIVE (fetch khi state thay doi, parse TLV)
- CMD_IP_ADDR (fetch khi state active, extract leaderRloc16 tu byte 14-15)
- CMD_THREAD_VERSION (fetch 1 lan)
- CMD_SET_PANID, SET_CHANNEL, SET_NETWORK_NAME, SET_EXTENDED_PANID, SET_NETWORK_KEY
- CMD_THREAD_START, CMD_THREAD_STOP
- CMD_ROUTER_TABLE, CMD_CHILD_TABLE, CMD_JOINER_TABLE (binary parse)
- CMD_COMMISSIONER_JOINER (EUI64 + PSKd Thread Base32 + timeout)
- CMD_SRP_REGISTER (0x44) — dang ky _dashboard._udp len SRP server qua BR (hostname, backend IPv6, port)
- CMD_RESET, CMD_FACTORY
- Auto-start Thread (thread_run_on_connect + portClosedWhileRunning flag)
- SRP register khi BR chuyen sang leader (BACKEND_IPV6 hoac getPreferredBackendIPv6()); log "SRP register: IPv6=... hostname=... port=..." truoc khi gui

### Backend — WebSocket

- Toan bo EVENTS dung constant tu shared/src/events.ts
- Relay OtConfig, OtThreadState, tables den frontend
- Handle set config commands tu frontend
- Commissioner joiner command

### Backend — CoAP device & System

- CoapDeviceServer: listen UDP 5683 on [::] (udp6). **GET /device/ping**: tra 2.05 Content, payload 4 byte timestamp uint32 LE (gia tri luc khoi tao server; backend restart = timestamp moi; node so sanh va gui lai register). **POST /device/register**, update: parse CBOR bang thu vien noi bo (backend/src/cbor), log "CoAP CBOR -> JSON" + structure (device_id, rloc16, role, entities); role la so 0=child 1=router 2=leader; tra 2.01; khong emit len frontend.
- System info: getBackendAddresses() (utils/ipv6); gui SYSTEM_INFO khi CONFIG_GET/CONFIG_CURRENT. Frontend Status section System (IPv4/IPv6).

### Frontend — Pages

- Status: BR connection (host:port), OT config, thread state, version (package.json); section **System** (IPv4/IPv6 backend tu systemInfo)
- Nodes: Router Table + Child Table + Joiner List (pending commissioning); nut "Commission Node" mo CommissionNodeModal; leader badge, age counter, empty states; overlay khi BR disconnect (blur, khong boc box)
- Settings / BR Connection: host + port + test connect
- Settings / OpenThread: cau hinh network + toggle Thread + nut "Lay lai"
- Settings / System: action cards (Khoi dong lai, Factory Reset) voi image panel, danger divider "Vung nguy hiem"; nut Reset/Factory Reset; ConfirmModal countdown 5s

Console da bo. Commissioner gop vao Nodes (modal + Joiner List).

### Frontend — Common Components

- Toast: dark theme, thanh doc trai theo type, title (Thanh cong/Loi/Canh bao/Tro giup), message muted, nut dong; slide-in phai, fade-out exit
- Modal / ConfirmModal: dark navy (overlay blur, card-dark, border brand-border; Cancel ghost, Confirm danger/warning voi hover glow); ConfirmModal countdown 5s
- Sidebar: brand "OpenThread", nav Status / Nodes / Settings (icon `speed` / `account_tree` / `settings`); Settings dropdown sub-items voi icon `lan` (BR Connection), `device_hub` (OpenThread), `warning` (System); status dot mau theo thread state + BR connection
- Toggle switch custom

### Documentation

- HomeThread/Documents/protocol/usb_cdc_frame_structure.md
- HomeThread/Documents/protocol/table_data_format.md
- HomeThread/Documents/dashboard/migration_to_frame_protocol.md
- docs/coap/thread_node_coap.md — huong dan Thread-Node gui du lieu (CoAP + CBOR) len backend
- README.md + TODO.md cap nhat

## What's Left to Build

### Frame Protocol

- **CMD_DATA**: Da bo. Child gui register/update/ping thang backend qua **CoAP** (UDP 5683, payload CBOR). BR chi route IP. Xem docs/coap/thread_node_coap.md.

### Backend

- **Bao mat** *(neu can)*: Auth cho API/WebSocket, HTTPS, IP restriction

### Frontend

- **Optional**: Shortcut commands, command history (neu lam lai Console hoac terminal)

### Integration & Operations

- **mDNS browse** *(tuy chon)*: Backend browse `_thread-frame._tcp`, frontend nut "Tim BR" chon instance
- **Docker**: Build backend + frontend thanh rieng docker image (chua thuc hien)

## Known Issues / Notes

- **React Strict Mode double mount**: Dev mode → double WebSocket connection → backend log "Client connected" 2 lan. Expected behavior, khong phai bug.
- **CMD_DATA da bo**: Child gui thang backend qua CoAP (port 5683, CBOR). BR chi route IP. Thread-Node doc: docs/coap/thread_node_coap.md.
- **Log filter**: TABLE commands bi filter khoi console. Can xem log file de debug table data.
- **Channel la uint8_t**: 1 byte (11-26), KHONG phai 3 byte. Da sua trong CommandManager.

