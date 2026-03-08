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
| 1.6.0   | Docker backend: Dockerfile.backend + docker-compose o root (sau them frontend). network_mode: host, volume backend/data. Default BR 192.168.31.3:5000 (migration 005) — mDNS trong Docker khong dung duoc, phai dung IP. Doc backend/README.docker.md. |
| 1.7.0   | Supervisor: thu muc `supervisor/` (Python stdlib) — Unix socket `/var/run/izerocs/supervisor.sock` (backend goi restart-otbr/health) + thread watch device (DEVICE_PATH mat → docker restart OTBR). Install script `install-supervisor-service.sh` (systemd dashboard-thread-supervisor, IP forwarding). Backend: mkdir /var/run/izerocs luc khoi dong; `backend/src/supervisor/socketClient.ts` (requestSupervisor, restartOtbr). Xoa otbr/install-otbr-watch-service.sh, otbr/otbr-watch-device.sh; otbr/README tro sang supervisor. |
| 1.8.0   | OTBR D-Bus: Bo TCP/frame. Backend OtbrDbusClient (dbus-next), OtbrManager chi dung D-Bus. BR Connection UI = OTBR status + Test. D-Bus signals: subscribe PropertiesChanged (state thay doi) → pull state/dataset khi co signal; fallback poll cham (30s) chi kiem tra OTBR con song. Xoa TransportTcp, CommandManager, frame/. Tables van poll 6s khi co frontend + state active. |
| 1.9.0   | Bo BrConnectionConfigService: xoa backend BrConnectionConfigService.ts; OtbrManager/WebSocketServer/index khong con BR config service. Frontend: useWebSocket bo config, configError, getConfig, saveConfig; xoa CONFIG_* listeners (CONFIG_CURRENT = null); xoa BrConnectionConfig.ts, type BrConnectionConfigFromBackend. CONFIG_SAVE chi trigger connect; CONFIG_UPDATE no-op. OTBR Docker: mount D-Bus host vao container da thu — otbr-agent khong dang ky tren host bus (dbus-daemon host tu choi ket noi tu container). Khuyen nghi: chay backend trong Docker voi volume otbr-dbus chung de backend thay OTBR. |
| 2.0.0   | OTBR REST: Thay D-Bus bang REST API. Backend OtbrRestClient (otbr-rest-client.ts), OtbrManager dung REST; xoa OtbrDbusClient, dbus-next. OTBR_REST_URL (mac dinh http://127.0.0.1:8081). Frontend: cau truc folder kebab-case + suffix (.component.tsx, .style.scss, .context.tsx, .hook.ts, .type.ts, .util.ts); import cap nhat; BR Connection = "OTBR (REST)". Backend + frontend doi ten file kebab-case/suffix (otbr.manager, websocket.server, app-settings.service, socket.client, logger.util, ...). Docker: bo volume otbr-dbus; README + memory-bank cap nhat REST. |


## What Works (Completed)

### Infrastructure

- npm workspaces monorepo (backend + frontend + shared)
- SQLite database (WAL mode, 6 migrations: app_settings, br_connection_config; migration 006 drop serial_config)
- Shared package: types, events, constants, validation
- pino logging voi child loggers (transportLogger, wsLogger, coapLog)
- Cursor Memory Bank (memory-bank/)
- Symlink docs → HomeThread/Documents/ (Dashboard-Thread + ESP-Thread/Thread-Host)

### Backend — OTBR REST

- OtbrRestClient (otbr-rest-client.ts): isAvailable(), getState(), getActiveDataset(), attach/detach, setActiveDataset, table getters (getRouterTable, getChildTable tu /api/devices; getJoinerTable tu /node/commissioner/joiner), addJoiner, factoryReset (DELETE /node)
- Poll state 30s (khong con D-Bus signal)
- OtbrManager (otbr.manager.ts): dieu phoi OtbrRestClient, PollingManager (tables 6s khi frontend + state active)
- BR connection config da bo: khong con BrConnectionConfigService; CONFIG_CURRENT emit null; bang br_connection_config (migration 005) van ton tai nhung khong dung
- Auto-reconnect (5s) khi isAvailable() false; env OTBR_REST_URL

### Backend — Operations (qua REST)

- State/dataset: getState(), getActiveDataset(); cap nhat qua poll 30s
- Set config: setActiveDataset (TLV hex), attach/detach
- Tables: getRouterTable, getChildTable, getJoinerTable (poll 6s khi can)
- Commissioner: addJoiner (EUI64, PSKd, timeout)
- Reset / FactoryReset
- Auto-start Thread (thread_run_on_connect + state = disabled → attach)

### Backend — WebSocket

- Toan bo EVENTS dung constant tu shared/src/events.ts
- Relay OtConfig, OtThreadState, tables den frontend
- Handle set config commands tu frontend
- Commissioner joiner command

### Backend — CoAP device & System

- CoapDeviceServer: listen UDP 5683 on [::] (udp6). **GET /device/ping**: tra 2.05 Content, payload 4 byte timestamp uint32 LE (gia tri luc khoi tao server; backend restart = timestamp moi; node so sanh va gui lai register). **POST /device/register**, update: parse CBOR bang thu vien noi bo (backend/src/cbor), log "CoAP CBOR -> JSON" + structure (device_id, rloc16, role, entities); role la so 0=child 1=router 2=leader; tra 2.01; khong emit len frontend.
- System info: getBackendAddresses() (utils/ipv6); gui SYSTEM_INFO khi CONFIG_GET/CONFIG_CURRENT. Frontend Status section System (IPv4/IPv6).

### Frontend — Pages

- Status: Ket noi OTBR (REST), OT config, thread state, version (package.json); section **System** (IPv4/IPv6 backend tu systemInfo)
- Nodes: Router Table + Child Table + Joiner List (pending commissioning); nut "Commission Node" mo CommissionNodeModal; leader badge, age counter, empty states; overlay khi OTBR disconnect (blur, khong boc box)
- Settings / BR Connection: trang thai OTBR (REST) + nut Test connection
- Settings / OpenThread: cau hinh network + toggle Thread + nut "Lay lai"
- Settings / System: action cards (Khoi dong lai, Factory Reset) voi image panel, danger divider "Vung nguy hiem"; nut Reset/Factory Reset; ConfirmModal countdown 5s

Console da bo. Commissioner gop vao Nodes (modal + Joiner List).

### Frontend — Common Components

- Toast: dark theme, thanh doc trai theo type, title (Thanh cong/Loi/Canh bao/Tro giup), message muted, nut dong; slide-in phai, fade-out exit
- Modal / ConfirmModal: dark navy (overlay blur, card-dark, border brand-border; Cancel ghost, Confirm danger/warning voi hover glow); ConfirmModal countdown 5s
- Sidebar: brand "OpenThread", nav Status / Nodes / Settings (icon `speed` / `account_tree` / `settings`); Settings dropdown sub-items voi icon `lan` (BR Connection), `device_hub` (OpenThread), `warning` (System); status dot mau theo thread state + BR connection
- Toggle switch custom

### Integration & Operations (Supervisor, OTBR)

- **Supervisor** (`supervisor/`): Daemon Python stdlib — listen Unix socket `/var/run/izerocs/supervisor.sock`; backend goi `restartOtbr()` qua socketClient. Neu set `DEVICE_PATH` (vd. /dev/ttyACM0), thread poll device; mat → docker restart container. Mot systemd service: `sudo bash ./supervisor/install-supervisor-service.sh [container] [device]`. ExecStartPre bat IP forwarding. Doc: supervisor/README.md.
- **OTBR Docker** (`otbr/`): Entrypoint doi RCP (by-id) roi exec /init; compose mount /dev, volume otbr-data. Rut RCP → dung supervisor (watch device) restart container. **Backend thay OTBR:** Ket noi qua REST (OTBR_REST_URL, port 8081). OTBR can build OTBR_REST=ON, listen 0.0.0.0:8081.

### Documentation

- HomeThread/Documents/protocol/usb_cdc_frame_structure.md
- HomeThread/Documents/protocol/table_data_format.md
- HomeThread/Documents/dashboard/migration_to_frame_protocol.md
- docs/coap/thread_node_coap.md — huong dan Thread-Node gui du lieu (CoAP + CBOR) len backend
- README.md + TODO.md cap nhat

## What's Left to Build

### Backend

- **Bao mat** *(neu can)*: Auth cho API/WebSocket, HTTPS, IP restriction

### Frontend

- **Optional**: Shortcut commands, command history (neu lam lai Console hoac terminal)

### Integration & Operations

- **Docker**: Build frontend thanh rieng image (backend da co)
- **OTBR config tu backend** *(tuy chon)*: Backend ghi file config (serial/baudrate/interface), goi supervisor restart; entrypoint OTBR doc file luc start. Thiết kế: `docs/otbr/otbr_config_from_backend.md`.

## Known Issues / Notes

- **React Strict Mode double mount**: Dev mode → double WebSocket connection → backend log "Client connected" 2 lan. Expected behavior, khong phai bug.
- **CoAP ResponseTimeout**: Neu Thread-Node bao `Ping/Register response error: ResponseTimeout` thi handler duoc goi voi **loi timeout** (node khong nhan duoc response), khong phai loi logic backend. Nguyen nhan thuong la **routing/forwarding**: response tu backend gui ve dia chi nguon (rsinfo) nhung packet khong toi node. Kiem tra: (1) Host backend co route toi prefix Thread qua BR (`ip -6 route get <node_ula>`); (2) BR (ESP32-S3 + RCP hoac OTBR) bat border routing va forward prefix OMR vao Thread; (3) Neu BR la Linux OTBR thi can `net.ipv6.conf.all.forwarding=1` va firewall ip6tables cho phep FORWARD vao interface Thread. Chi tiet: docs/coap/thread_node_coap.md (Troubleshooting), docs/architecture/real_br_integration.md.
- **OTBR D-Bus**: Method/property ten co the khac tuy image otbr-agent; neu khong nhan signal PropertiesChanged thi fallback poll 30s van cap nhat state.

