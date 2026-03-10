# Active Context — Dashboard-Thread

## Current Work Focus

Backend ổn định với BR qua TCP + frame protocol, CoAP device ingest, SRP register, WebSocket handlers theo decorator. Frontend đã **migrate React → Lit** (Web Components) và hiện đang **render light DOM** (tắt Shadow DOM) để CSS global áp trực tiếp. UI dark navy: Modal/ConfirmModal, System action cards, Sidebar nav, Toast dark theme. **Status** có section **System** (IPv4/IPv6 backend). **Cấu trúc:** Frontend feature-based (`src/features/nodes|settings|status`, `src/shared`), backend domain-based (`coap/`, `communicate/`, `settings/`, `thread/`, `websocket/`); **path alias** frontend (`@/`, `@shared/`, `@nodes/`, `@settings/`, `@status/`); **path alias backend** (`@utils/*`, `@cbor`, `@database`, `@communicate`, `@coap/*`, `@settings/*`, `@thread/*`, `@websocket/*`) — dev: tsx tự resolve, build: tsc + tsc-alias. CoAP server refactor decorator (`DeviceCoapController`, `@CoapGet`/`@CoapPost`, `registerCoapControllers`). **Docker:** Backend chạy được bằng Docker (network host, default BR 192.168.31.3). Tiếp theo: bảo trì, optional mDNS/scan BR, security nếu cần.

Giao tiếp BR ↔ backend theo hướng **notify-first**: Thread-Host push `CMD_NOTIFY (0x45)` mask thay đổi; backend debounce + gộp mask rồi pull đúng phần cần (dataset/ip/tables). Backend vẫn **poll STATE mỗi 5s** để health-check và phát hiện role transitions; khi TCP connect thành công sẽ pull baseline để UI không stale nếu missed notify. **Không** theo dõi số client frontend (đã bỏ `frontendConnectionCount`, `onFrontendConnected`/`onFrontendDisconnected`); websocket.server.ts trên connection chỉ gửi config + last* data, không gọi communicate.

## Recent Significant Changes

### BR sync: bỏ frontend connection gating
- **CommunicateManager:** Xóa `frontendConnectionCount`, `onFrontendConnected()`, `onFrontendDisconnected()`. Polling/tables fetch không còn phụ thuộc số client WS.
- **websocket.server.ts:** Trên connection chỉ gọi sendCurrentConfig/sendBrStatus + emit last* data; không gọi communicate.onFrontendConnected/onFrontendDisconnected.
- Tables/notify logic chạy độc lập khi BR đã kết nối (state poll 5s + CMD_NOTIFY + baseline on connect).

### WebSocket refactor — decorators + handler modules
- **Backend websocket/:** Đăng ký event qua decorator `@WsOn(EVENTS.xxx)` (ws.decorator.ts); metadata route lưu trên constructor qua ws.type.ts (getWsRoutes, appendWsRoute). **Handlers tách theo domain** trong `backend/src/websocket/handler/`: ConfigHandler (config get/save/update), BrHandler (BR status, connect, disconnect, test), DeviceHandler (reset, factory reset), ThreadHandler (OT config, thread state, start/stop, run-on-connect, router/child table), CommissionerHandler (joiner table, commissioner connect), SrpHandler (SRP register). Mỗi handler class nhận dependencies (io, brConnectionConfigService, appSettingsService, communicate) qua constructor. **websocket.server.ts** chỉ: tạo instance 6 handler, trên connection gọi sendCurrentConfig/sendBrStatus + emit last* data, rồi loop getWsRoutes(handler.constructor) để socket.on(event, handler[propertyKey]). File: websocket.server.ts, ws.type.ts, ws.decorator.ts, handler/config.handler.ts, br.handler.ts, device.handler.ts, thread.handler.ts, commissioner.handler.ts, srp.handler.ts, handler/index.ts.

### Backend path aliases + tsc-alias + TS fixes
- **Backend tsconfig:** Them `baseUrl: "."` va `paths` cho `@utils/*`, `@cbor`, `@database`, `@communicate`, `@coap/*`, `@settings/*`, `@thread/*`, `@websocket/*`. Toan bo import tuong doi (`../utils/...`, `./database/...`) da doi sang alias (`@utils/...`, `@database/...`, ...).
- **Build:** Script `build`: `tsc && tsc-alias -p tsconfig.json`. Dev: `tsx watch src/index.ts` tu resolve alias; sau build, tsc-alias thay alias trong dist/ bang relative path de `node dist/index.js` chay duoc.
- **TypeScript:** `coap.router.ts`: cast `instances[i] as object` cho routeList.instance; cast `handler.call(...) as unknown` truoc `result instanceof Promise`. `transport-tcp.transport.ts`: them `!sock ||` truoc `sock.destroyed` de tranh `sock` possibly null.

### Path aliases & frontend structure
- **Frontend:** Toan bo import dung **path alias**: `@/` (src), `@shared/`, `@features/`, `@nodes/`, `@settings/`, `@status/` (tsconfig.json `paths` + vite.config.ts `resolve.alias`). SCSS: `css.preprocessorOptions.scss.loadPaths: [resolve(__dirname, "src")]` — trong file .scss dung `@use "shared/styles/variables"` / `@use "shared/styles/form"` (duong dan tu `src/`).
- **Cau truc frontend:** `src/features/nodes`, `src/features/settings`, `src/features/status`; `src/shared/components`, `src/shared/contexts`, `src/shared/hooks`, `src/shared/types`, `src/shared/styles`. Component/file dat ten kebab-case (vd. `commission-node-modal.component.tsx`, `*.style.scss`).

### CoAP server — decorator pattern
- **Backend coap/** (domain): `coap-device.server.ts` goi `registerCoapControllers(server, [DeviceCoapController])`. Controller dung decorator `@CoapGet("/device/ping")`, `@CoapPost("/device/register/info")`, `@CoapPost("/device/register/entity")`, `@CoapPost("/device/update/info")`, `@CoapPost("/device/update/entity")`, `@CoapPost("/device/update/topology")`, `@CoapPost("/device/update/state")`. Metadata route luu tren constructor qua `coap.type.ts` (getCoapRoutes, appendCoapRoute); `coap.router.ts` doc routes, dispatch request → handler. **Status & response:** `coap.type.ts` export `CoapStatus` (CREATED, CHANGED, CONTENT, NOT_FOUND, SERVER_ERROR); `coap.response.ts` export `echoCoapToken`, `sendCoapResponse(req, res, status, body?, contentFormat?)`. Controller dung `parseCborOrRespond(req, res)` (parse CBOR, neu null thi send 2.01 va return null) cho handler can "parse hoac 2.01 empty"; cuoi handler goi mot lan `sendCoapResponse`. File: `coap.type.ts`, `coap.response.ts`, `coap.decorator.ts`, `coap.router.ts`, `device-coap.controller.ts`, `device-coap.service.ts`, `device.payload.ts`.

### SRP register (frame CMD 0x44) + System section
- **Backend:** Khi BR chuyen sang **leader** (poll CMD_STATE), tu dong gui **CMD_SRP_REGISTER** (0x44) qua frame: DATA = hostname_len(1) + hostname(N) + backend_ipv6(16) + port(2 BE). IPv6 lay tu `BACKEND_IPV6` env hoac `getPreferredBackendIPv6()` (utils/ipv6). CommunicateManager.pullState() → stateChangedOrFirst && roleByte === LEADER → srpRegister(). **Log khi gui:** `transportLogger.info("SRP register: IPv6=... hostname=... port=...")` truoc khi goi srpRegister() de hien thi backend IPv6 dang dung. WebSocket handler `srp:register` / `srp:register:result` cho trigger thu cong.
- **Frame:** CMD_SRP_REGISTER = 0x44 trong constants; CommandManager.sendSrpRegister(), CommunicateManager.srpRegister(). NACK 0x02/0x03/0x04 (Not ready, Timeout, Invalid param).
- **Status:** Bo section "Child data (CoAP)". Them section **System** (cung giao dien bang nhu OpenThread Network): IPv4 (backend), IPv6 (backend) tu event `system:info`; backend gui getBackendAddresses() khi send CONFIG_CURRENT.
- **Shared:** EVENTS.SRP_REGISTER, SRP_REGISTER_RESULT, SYSTEM_INFO. Frontend nhận `SYSTEM_INFO` qua `WebSocketController` (không còn childDataEvents).
- **Da xoa:** DashboardSrpClient.ts (UDP SRP), register-srp.ts script, STATE_FAKE_PAYLOAD (sendState gui payload rong khi khong data).

### CoAP device data (Thread-Node)
- **Backend:** CoAP server UDP 5683 (`coap-device.server.ts`), socket **udp6** listen `[::]:5683`. Path **/device/** (ping, register/info, register/entity, update/info, update/entity, update/topology, update/state). **Payload:** mac_address key 0; device_info keys 0–6; topology flat key 0 = mac, 1–6 = rloc16, role, ipv6, parent, rssi, link_quality; entity/state **key 1** = array (ENTITY_KEYS 0–6: entity_id, name, type, device_class, unit, restore_mode, **disabled**; STATE_KEYS 0–6: entity_id, state, brightness, mode, rgb, color_temp, value — **không có available**). **GET /device/ping**: 2.05 Content + 4 byte timestamp. **POST register/info**: upsert device_info, slug; soft-delete entity/state cũ. **POST register/entity**: key 0 (mac) + key 1 (array DeviceEntityItem); merge device_entity (disabled key 6); trả CBOR key 10 = restore. **POST update/topology**: payload flat 0–6. **POST update/state**: key 0 + key 1 (DeviceStateItem, không available). Response sendCoapResponse; **không emit** lên frontend.. DB: database/repositories/device.repository; device-coap.service parse/map, goi repo.
- **Payload types (device.payload.ts):** PAYLOAD_KEY_MAC (0); DEVICE_INFO_KEYS (0–6, key 0 = mac); TOPOLOGY_KEY (8), TOPOLOGY_KEYS; ENTITIES_KEY (9); ENTITY_KEYS (định nghĩa entity); STATE_KEYS (update/state). DeviceInfoPayload, DeviceTopologyPayload, DeviceEntityPayload/DeviceEntityItem, DeviceStatePayload/DeviceStateItem. Handler dùng đúng type từng endpoint.
- **Schema:** device_info, device_topology + history (rssi, link_quality), device_entity, device_entity_state + history. Drizzle schema `database.schema.ts`; migrations `data/migrations/`. Soft-delete khi register/info; restore flow khi register/entity.
- **Registration model:** Thread-Node: POST register/info (chỉ info) → POST update/topology (nếu có) → POST register/entity; GET /device/ping định kỳ, timestamp đổi thì gửi lại register. CoAP fail → SRP re-discovery.
- **Docs:** `docs/coap/device_payload_spec.md` — spec payload cho Thread-Node (device_info, topology, entity, state). `docs/coap/thread_node_coap.md`, `docs/coap/border_router_coap_server.md` — flow, endpoints, troubleshooting.

### UI polish (dark navy, Settings, Modal)
- **Modal / ConfirmModal:** Dark navy — overlay rgba + backdrop blur; box $card-dark, border $brand-border; title/body $text-dark, $text-dark-subtle; nut Cancel ghost, Confirm danger/warning (#ef4444, #f97316) voi hover glow.
- **Settings / System:** Action cards (Khoi dong lai + Factory Reset) voi image panel, danger divider "Vung nguy hiem"; ConfirmModal countdown 5s giu nguyen.
- **Sidebar Settings sub-items:** Icon Material Symbols — BR Connection `lan`, OpenThread `device_hub`, System `warning` (sidebar-nav-nested-icon 16px).
- **OpenThread form card:** .form-card.ot-card padding 0, overflow hidden; footer cung chieu ngang body (margin 1.75rem), khong full-bleed.

### Navigation & Pages (SCSS only, no Tailwind)
- **Sidebar:** Brand "OpenThread" ở header; nav chi **Status**, **Nodes**, **Settings** với icon `speed`, `account_tree`, `settings`; khong con Console, Topology, Commissioner tab rieng. Status dot o header Sidebar hien mau theo thread state + BR connection.
- **Nodes page:** Router Table + Child Table + **Joiner List** (ben duoi Child Table). Nut "Commission Node" mo **CommissionNodeModal** (khong con trang Commissioner rieng). Khi BR disconnect: overlay full main (blur), khong boc content; cung layout nhu khi connect. Bang trong: empty state "No routers found" / "No child nodes connected".
- **Leader row:** Chi badge "LEADER" trong cell, khong highlight nen xanh la.
- **Version:** Subtitle Status lay tu `frontend/package.json` qua Vite `__APP_VERSION__`; dong bo voi progress.md (1.0.0).

### Docker backend (chay backend bang container)
- **Vi tri:** Dockerfile va docker-compose o **thu muc goc** Dashboard-Thread: `Dockerfile.backend`, `docker-compose.yml`, `.dockerignore`. Sau co the them frontend cung build.
- **Cau hinh:** `network_mode: host` (dung chung bang route host — backend khong can doc route trong code). Volume chi `./backend/data:/app/data`.
- **Default BR:** 192.168.31.3:5000. **mDNS trong Docker khong dung duoc**; khi Docker phai dung IP. "Tim BR" sau co the quet dai IP (TCP 5000).
- **Chay:** `docker compose up --build`; container name `dashboard-thread-backend`. Doc: `backend/README.docker.md`.

### BR connection (Settings)
- **IPv4 khuyen nghi:** Nhieu BR (vd. ESP32-S3) chi listen TCP tren IPv4 (0.0.0.0:5000) → dung **IPv4** lam BR Host (vd. 192.168.31.3) tranh ECONNREFUSED.
- **IPv6 link-local:** Neu dung fe80::... phai co **zone ID** (vd. fe80::...%enp7s0), neu khong se EINVAL.
- **Cap truc tiep PC–BR (khong qua router):** Tren link khong co DHCP → PC can dat **IP tinh** cung subnet voi BR (BR thuong co IP co dinh trong firmware).

### Migration BR — Chi TCP, bo Serial (plan br_backend_communication)
- **Backend:** Loai bo hoan toan Serial/USB/UART. Chi dung **TransportTcp** ket noi BR (host:port). Cau hinh: **BrConnectionConfigService** (brHost, brPort, useMdns) luu SQLite; migration 005 tao bang `br_connection_config`. Xoa SerialPort.ts, SerialConfigService.ts; go dependency serialport.
- **CommunicateManager:** Chi TransportTcp + BrConnectionConfig; connectInternal(), onTransportDisconnected(), reconnect 3s. Status tra ve ConnectionStatus (isConnected, host, port).
- **WebSocketServer:** CONFIG_GET/SAVE/UPDATE payload brHost/brPort; handleBrTest(host, port); message loi "BR not connected".
- **Frontend:** BrConnectionForm (host + port); Settings tab "BR Connection"; types BrConnectionConfigFromBackend, ConnectionStatus; actions (save config, test connect) đi qua `WebSocketController`. Navigation/Status/Commissioner/Console/Dashboard/SystemTab: message "BR" thay "Serial".
- **Docs:** migration_to_frame_protocol.md, README.md da cap nhat.

### Documentation (truoc do)
- Tao `HomeThread/Documents/`, symlink docs, Memory Bank

### Backend (truoc do)
- shared/, CMD_*, leaderRloc16, auto-start Thread, filter log TABLE

### Frontend
- **Toast:** Dark theme; thanh doc trai mau theo type (success/error/warning/info); title tu type (Thanh cong/Loi/Canh bao/Tro giup), message muted; nut dong goc phai; slide-in tu phai, fade-out khi exit.
- **Nodes:** Router Table, Child Table, Joiner List (EUI64, TIMEOUT MM:SS countdown local tu initialSeconds khi co data moi), Commission Node modal. Stable keys: joiner `joiner-${sharedId}-${expirationMs}`; router/child row RLOC16 hoac ExtAddress; modal list fieldKey; LqBarsCell `lq-bar-${i}`.
- **Joiner countdown:** Khi nhan bang joiner: tinh initialSeconds = expirationMs/1000, luu receivedAt; dem nguoc local moi giay; co data moi thi reset snapshot.
- ConfirmModal (countdown 5s), Sidebar status dot, Settings/OpenThread + System; Status: threadVersion, ipaddr, datasetActive.

## Active Decisions & Considerations

### Validation Strategy (confirmed)
Frontend chi check "khong trong" — backend xu ly moi validation chi tiet. Khong duplicate validation logic.

### CMD_SET_CHANNEL Data Format (confirmed)
Channel la `uint8_t` (1 byte), khong phai 3 byte. Range 11-26. Constant trong `shared/src/constants.ts`.

### leaderRloc16 Source
Lay tu CMD_IP_ADDR ACK (16-byte IPv6), byte 14-15 big-endian → format "0xXXXX". Luu trong `OtConfig.leaderRloc16`.

### Table Log Filtering
ROUTER_TABLE, CHILD_TABLE, JOINER_TABLE TX va ACK bi filter ra khoi console log (giu lai trong log file neu co). Giam noise.

### Agent / Terminal (confirmed)
**Khong tu chay lenh terminal** va **khong yeu cau nguoi dung tu chay lenh bang tay**. Agent chi sua code, tao/xoa file, doc code; viec chay build/test/dev do nguoi dung tu quyet dinh va thuc hien.

## Next Steps (theo thu tu uu tien)

1. **Tim BR** *(tuy chon)* — mDNS browse `_thread-frame._tcp` (khi chay tren host) hoac quet dai IP (TCP 5000) khi chay Docker
2. **TCP keepalive** — Da co the bat de phat hien mat ket noi BR nhanh hon (backend TransportTcp)
3. **Security** *(neu can)* — auth WS, HTTPS

## Files to Watch

- `backend/src/coap/coap-device.server.ts` — CoAP server entry; registerCoapControllers, DeviceCoapController
- `backend/src/coap/coap.type.ts` — CoapRequest, CoapResponse, CoapStatus (CREATED, CHANGED, CONTENT, NOT_FOUND, SERVER_ERROR)
- `backend/src/coap/coap.response.ts` — echoCoapToken, sendCoapResponse(req, res, status, body?, contentFormat?)
- `backend/src/coap/device/device.payload.ts` — DEVICE_INFO_KEYS, TOPOLOGY_KEY/TOPOLOGY_KEYS, ENTITIES_KEY; DeviceInfoPayload, DeviceTopologyPayload, DeviceEntityPayload/Item, DeviceStatePayload/Item
- `backend/src/coap/device-coap.controller.ts` — GET /device/ping, POST /device/register/info (chỉ info), register/entity, update/info, update/entity, update/topology, update/state; type từng handler đúng payload
- `backend/src/coap/device/device-coap.service.ts` — parse/map payload, goi device.repository (upsertDeviceInfo, updateDeviceInfo, upsertTopology, mergeEntity, updateEntityDefinition, upsertEntityState)
- `backend/src/database/repositories/device.repository.ts` — type-safe Drizzle: resolveDeviceIdByMac, upsertDeviceInfo (slug generateSlug), updateDeviceInfo, upsertTopology (rssi, linkQuality), mergeEntity, restore, updateEntityDefinition, upsertEntityState
- `backend/src/utils/ipv6.util.ts` — getPreferredBackendIPv6(), getBackendAddresses()
- `docs/coap/device_payload_spec.md` — spec payload Thread-Node (device_info, topology, entity, state). `docs/coap/thread_node_coap.md`, `docs/architecture/real_br_integration.md` — flow, SRP discovery
- `backend/src/communicate/communicate.manager.ts` — pullState(), SRP register khi leader
- `backend/src/communicate/command.manager.ts` — frame handling, sendSrpRegister, replyAck (IP_ADDR)
- `frontend/src/features/nodes/nodes.component.tsx` — Router/Child table, JoinerList, CommissionNodeModal
- `frontend/src/features/nodes/components/joiner-list/joiner-list.component.tsx` — joiner cards, countdown
- `frontend/src/shared/components/toast-container/` — toast dark
- `frontend/src/shared/components/modal/`, `confirm-modal/` — dark navy theme
- `frontend/src/shared/components/sidebar/` — nav, Settings sub-items icons
- `frontend/src/features/settings/components/system-tab/` — action cards, danger divider
- `frontend/src/features/settings/components/openthread-config-form/` — ot-card, footer layout
- `shared/src/events.ts`, `shared/src/types.ts` — thêm field/event cập nhật cả hai
- `backend/src/websocket/websocket.server.ts` — chỉ wire handlers; logic trong handler/
- `backend/src/websocket/handler/*.ts` — ConfigHandler, BrHandler, DeviceHandler, ThreadHandler, CommissionerHandler, SrpHandler; thêm event mới = thêm method + @WsOn(EVENTS.xxx)
- `backend/src/websocket/ws.type.ts`, `ws.decorator.ts` — getWsRoutes(ctor), @WsOn(event)
- `memory-bank/progress.md` — cập nhật khi hoàn thành task
