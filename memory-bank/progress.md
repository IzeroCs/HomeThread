# Progress — Namorix Thread

Version notation in this file uses Semantic Versioning `MAJOR.MINOR.PATCH` (no leading `v`). Examples: `0.8.0`, `0.9.0`, `1.0.0`. If only major/minor are known, use `PATCH = 0`.

## Release history

*(Các mốc trước 0.9.0 suy từ migration/progress; repo không có git tag/CHANGELOG. Chỉnh sửa nếu bạn có mốc chính xác.)*

| Version | Notes |
|---------|--------|
| 2.26.0  | **`@namorix/core-backend` (repo data paths).** Thread backend phụ thuộc package `namorix/core/backend`: logger + `resolveNamorixRepoDataLayout` cho `data/database/database.db` và `data/migrations` (env `NAMORIX_DATA_DIR`). Root `package.json` + `backend/package.json`: `file:` sibling `namorix/core/backend`; cần **`npm install`** tại root Thread. Memory-bank: `techContext`, `activeContext`, `progress`. *(2026-03-24.)* |
| 2.25.0  | **Core / workspace path aliases (fix ENOENT + npm workspaces).** `frontend/vite.config.ts` + `vite.plugin.config.ts`: `siblingReposRoot = resolve(__dirname, "../..")` trỏ đúng **`namorix-workspace/`** (sibling `namorix/`, `namorix-assets/`), tránh resolve nhầm lên một cấp và gây `ENOENT` khi Vite scan `@namorix/core/*` (vd. `i18n/index.ts`). `frontend/tsconfig.json`: `paths` `@namorix/core` / `@namorix/core/*` / `@namorix/assets` dùng tiền tố **`../../`** khớp layout trên. **Không** còn `file:` dependency `@namorix/core` trong `frontend/package.json` — dev bundle dựa trên alias Vite + TS paths. Root `namorix-thread/package.json` có `"version": "0.0.0"` để npm workspaces không báo **Invalid Version** khi cài đặt. *(2026-03-23.)* |
| 2.24.0  | **Dashboard wrapper removal cleanup.** Chuẩn hóa workspace root tại `namorix-thread/package.json` (workspaces: backend/frontend/shared + scripts `dev`, `dev:backend`, `dev:frontend`, `build`, `build:plugin`). Xóa wrapper files trong `dashboard/` (`package.json`, `package-lock.json`, `README.md`, `TODO.md`). Tạo `README.md` + `TODO.md` ở root `namorix-thread/`; cập nhật docs runtime (`backend/README.docker.md`, `data/README.md`, `documents/namorix-core-usage.md`) sang path root mới và tham chiếu `namorix/core` thay cho `namorix-core`. |
| 2.23.2  | **Thread frontend dev simplification.** `frontend/vite.config.ts` CORS đổi `origin: process.env.DESKTOP_ORIGIN ?? true` để standalone dev không cần env bổ sung. Xóa script `dev:shell` trong `frontend/package.json`; dùng `dev`/`dev:frontend` làm luồng duy nhất. `README.md` (root) cập nhật hướng dẫn tương ứng. |
| 2.23.1  | **Memory bank:** Đồng bộ `progress` / `activeContext`; xác nhận cấu trúc **`backend/src/communicate/`** — `frame/`, `transport/`, `br/` (`BrConnection`, `BrSession`, `BrCommand`, facade `BrManager`). Workspace parent **`namorix-workspace`**; tham chiếu `namorix/memory-bank/`. **Không đổi code.** *(2026-03-23.)* |
| 2.23.0  | **Memory bank — đường dẫn spec + workspace.** Đồng bộ tham chiếu **`namorix/documents/namorix-desktop-architecture.md`** (thay path cũ ở root repo `namorix`); workflow dev cập nhật theo root `namorix-thread/` và `namorix/documents/README.md`. Rule `.cursor/rules/commit-suggestion-on-memory-bank-update.mdc` được cập nhật theo cấu trúc mới. **Không đổi code** — chỉ tài liệu. |
| 2.22.1  | **Docs — plugin / backend:** `memory-bank/techContext.md` + `namorix/documents/thread-desktop-plugin-integration.md` — làm rõ Thread backend vs Desktop host; không bắt buộc SDK Express trong core; hợp đồng + tài liệu thay cho abstraction nặng. |
| 2.22.0  | **Core workspace paths.** `@namorix/core` → sibling `namorix/core/frontend` (`file:../../../namorix/core/frontend`); Vite/tsconfig alias trỏ `namorix/core/frontend/src`; thêm alias `@namorix/core-shared` → `namorix/core/shared/src`; SCSS `loadPaths` gồm core frontend `src`. Khác với package `shared/` nội bộ Thread (`file:../shared`). |
| 2.21.0  | **Memory bank — đồng bộ embed shell + core 0.9.2.** Ghi rõ `defineCustomElementOnce` trong `@namorix/core` (tránh đăng ký trùng tag khi Desktop đã load shell rồi dynamic-import `thread.js`). Ghi chú dev: Express plugin backend cần `DESKTOP_ORIGIN` khớp origin Vite Desktop (kể cả port); bundle lib plugin (`vite.plugin.config.ts`) nên `define` `process.env.NODE_ENV` nếu dependency còn tham chiếu `process`. Tham chiếu chéo `namorix/memory-bank/` — **không đổi code** bắt buộc trong mốc này nếu đã align env/build. |
| 2.20.0  | **Shell API + gateway + docs.** Core: `@namorix/core/shell-api` — `PluginRuntimeStatus`, `ShellWindowEvent`, `SHELL_APP_EMIT_PREFIX`; `NmxCoreApi.onLocaleChange`; typing `Window.nmxCore` gom một nơi. Desktop: gateway proxy chỉ forward `Authorization` (bỏ `x-forwarded-authorization` thừa). Thread frontend: `nmx-thread-app` dùng hằng từ shell-api + `onLocaleChange` khi có. Memory-bank + `documents/namorix-core-usage.md` cập nhật mục shell / locale. |
| 2.19.1  | **Memory bank — tham chiếu Namorix Desktop.** Đồng bộ `memory-bank/` với repo sibling **`namorix`** (Desktop shell): trỏ `namorix/documents/namorix-desktop-architecture.md` cho plugin-in-shell, manifest, CORS, `window.nmxCore`, milestone **M3**; kèm `namorix/memory-bank/`. **Không đổi code** Thread — chỉ tài liệu. |
| 2.19.0  | **Navigation/content rendering refactor.** Core thêm `nmx-content` + `NmxPageBuilder`/`PageEntry` để host app render trang theo `currentPage` (controlled). Frontend `nmx-thread-app` dùng sidebar `navigate` để set `NavPage` state, sau đó render page qua `<nmx-content>` với `pages` đã được build sẵn (tạo 1 lần). Đồng thời fix import SCSS feature từ `@monitor/*` sang path đúng trong `features/network/*`. |
| 2.18.0  | **Toast dual mode + createWsBridge + form/button nmx- prefix (unreleased).** Core: Toast slice + `<nmx-toast>`, `initToast({ store, selectToasts, getTitle? })`, `showToast()` dual mode (window.nmxCore → CustomEvent "nmx-action", else dispatch). WS: `createWsBridge` builder (onConnect/onDisconnect/onConnectError/on/start/stop/getSocket), `onceWithTimeout` từ `@namorix/core/ws`. Form/button: core `_form.scss`/`_button.scss` đổi toàn bộ class sang `.nmx-form-*`, `.nmx-btn*`, `.nmx-form-btn*`; frontend (connection, device, thread, joiner + SCSS) cập nhật. **Doc:** `documents/namorix-core-usage.md` — hướng dẫn dùng core; `documents/README.md` thêm mục. |
| 2.17.0  | **Core/shared refactor (unreleased).** Legacy path `vendor/namorix-core` (sau này chuyển sibling `namorix-core`). Frontend bundle core tokens/base styles qua Vite alias `@namorix/core` → source. Store: `createPluginStore` từ `@namorix/core/store`; i18n: `initI18n`, locale set qua `setLocale` (bỏ locale-storage). **Base elements:** Core có **NmxBaseElement** (font + light DOM), **NmxStoreElement** (getStore(), locale, createStoreSlice, dùng `subscribeStoreSelector` + `selectLocale`); frontend **AppBaseElement** extends NmxStoreElement, `getStore() { return store }`. Root: `<nmx-main>` → nmx-app-container → **nmx-thread-app** (NmxThreadApp extends AppBaseElement). |
| 2.16.2  | **Frontend: AppLitElement base, app-layout, AppBar Redux, confirm-modal removal.** Base class `AppLitElement` (core/app-lit-element.ts): optional locale (`static useLocale`), `useLocale()`, `createStoreSlice()`, `createRenderRoot() { return this }`. Root component đổi tên `app-shell` → `app-layout` (AppLayout); index.html mount `<app-layout></app-layout>`. AppBar cấu hình qua Redux (slice appBar, setAppBar/clearAppBar); AppLayout đọc store và render `<page-header>`; status/nodes dispatch setAppBar và clearAppBar khi unmount. Xóa confirm-modal; Settings Device dùng trực tiếp modal-dialog với countdown trong component. page-header (appbar) extend AppLitElement. |
| 2.16.1  | **Settings navigation + form CSS normalization.** Đổi Settings pages sang `settings-connection/thread/device`, bỏ `settings-view` trung gian. Chuẩn hoá form styles: import `_form.scss` global (app.style.scss), dùng `.form-actions` cho footer, dọn các feature scss và xoá settings.style.scss. |
| 2.16.0  | **Frontend i18n (full coverage).** Thêm `t(key, params?)` + locales JSON (`en.json` source-of-truth, `vi.json` để dịch sau), slice `i18n` trong store. Sweep toàn `frontend/src` để chuyển user-facing strings sang `t("...")` và gom keys vào `en.json`. Cấu hình i18n Ally (custom framework + regex) để detect `t("...")`. *(Locale persistence sau đó đã được bỏ ở 2.17.0; locale được set từ user settings/config qua `setLocale`.)* |
| 2.15.1  | **BR refactor (naming + split).** Chuẩn hoá `backend/src/communicate/` theo domain `br/` và tách `BrConnection`/`BrSession`/`BrCommand` + facade `BrManager`. `thread/thread.config.ts` dùng `OtConfigStore` cho store và `OtConfig` cho data type. |
| 2.15.0  | **UI tokens + Joiner revamp.** Joiner page UI redesigned (queue layout, tonal styles, no search/pagination) và hiển thị PSKD từ Joiner Table. `page-header` actions hỗ trợ label + style/tone (label auto-show), tonal rules (filled/text no border, outlined keeps border). `modal.style.scss` migrate sang CSS `--tokens` và scrollbar neutral (thumb `--on-surface-variant`). |
| 2.14.0  | **Joiner / Modal / Form polish.** Joiner feature riêng (`features/joiner/`); commission modal gộp vào joiner.component. Commissioner cho phép khi BR attached (leader/router/child) — _canCommission thay _isLeader. modal-dialog: portal render ra body (overlay phủ sidebar/header); ModalAction tone (default|info|success|warning|danger) + style (text|filled|outlined), icon string | TemplateResult, loading spinner; default Confirm=filled info, Cancel=text danger. Shared: spin-loader component; _form.scss form-radio-row (timeout radio thay select), form-field/form-control/form-select; modal.style.scss modal-alert, modal-info-box, button variants. joiner.style.scss minimal (import nodes+form). |
| 2.13.0  | **RGBA → RGB hex variables.** Chỉ tạo biến cho phần RGB (hex 6) trong `_variables.scss`; opacity giữ trong `rgba($var, opacity)`. Thêm RGB tokens: `$black`, `$slate-850`, `$navy-900`, `$slate-800`, `$slate-900`, `$red-900`, `$red-950`, `$danger-pink`, `$indigo-400`; cập nhật shadow/border/alert/system/topology-offline. Toàn bộ component SCSS thay `rgba(R,G,B,A)` literal bằng `rgba($rgb-var, A)`; RGB trùng dùng chung biến; giữ functional naming cấp component. |
| 2.12.0  | **Topology map + Settings UI polish.** Topology: feature `frontend/src/features/topology/` (topology-map.component.ts, topology-map.style.scss); cyan accent `$topology-accent`, `$bg-topology`; canvas spotlight (drawSpotlight overlay/tint/hole); manual layout khi ≤10 node (FEW_NODES_THRESHOLD); focus (tabindex, :focus-visible); edge ẩn nếu endpoint offline; label box rect width động (labelText.length*6.5+20); selected state bền (click stopPropagation, toggle select); hover/selected cho label-bg & label; node__body baseline (filter chỉ hover/selected), &--selected .node__inner scale(1.08), selected fill + selected:hover override. Settings: palette thống nhất (bg-app/sidebar/card/input); button semantics (primary cyan, ghost border, warn amber, danger red); danger zone subtle; Connected badge + sidebar dot cyan; System card gradient thay PCB image. |
| 2.11.0  | **BR health snapshot (device_health_br):** 1 row per device (UNIQUE(device_id)), **upsert** mỗi lần poll/notify, không insert history. Schema: free_heap, minimum_free_heap, uptime, stack_hwm (text), mle_detach_count, recorded_at. CMD_BR_HEALTH (0x17); ACK 16-byte prefix + TLV suffix (doc 5.1). Repo `upsertBrHealth` (onConflictDoUpdate); CommunicateManager fetch on connect + poll 60s + NOTIFY bit 6. getBrDeviceId() từ device_info (is_border_router=1). Doc: device_payload_spec.md §3, real_br_integration.md §2.4, protocol/usb_cdc_frame_structure.md §5.1. |
| 2.10.0  | **Topology role-based payload:** DeviceTopologyPayload parse theo role. Child: keys 0–5 (mac, rloc16, role, parent_rloc16, parent_rssi, parent_lq). Router/Leader: keys 0,1,2,6 (mac, rloc16, role, neighbors array). TopologyNeighbor: 0=rloc16, 1?=rssi, 2?=lq_in, 3?=lq_out, 4=is_child. Bảng **device_topology_neighbor** (device_id, neighbor_rloc16, rssi, lq_in, lq_out, is_child); migration 0001. Repo upsertTopology nhận neighbors; replace list (delete + insert). device.payload.ts: TOPOLOGY_NEIGHBOR_KEYS, TopologyNeighbor. Doc: device_payload_spec.md, thread_node_coap.md, border_router_coap_server.md, memory-bank. |
| 2.9.0   | **Device/entity name raw vs user:** device_info **device_name_raw**, device_entity **name_raw** (tên firmware). User name (device_name / name): register update = COALESCE(hiện tại, payload); raw luôn ghi đè. Slug = (device_name ?? device_name_raw ?? macHex). Repo: upsertDeviceInfo(deviceNameRaw), mergeEntity(nameRaw); service truyền raw + name từ payload. Frontend `shared/utils/display-name.ts`: deviceDisplayName(), entityDisplayName(). **Frame log:** Ẩn log CMD STATE và ACK (RX + TX) trong command.manager.ts. |
| 2.8.0   | **Device heartbeat (ping + last_seen_at):** GET /device/ping query **?mac=** (16-char hex); backend parse (parsePingMac), updateDeviceLastSeen(mac). device_info cột **last_seen_at**; repo updateDeviceLastSeen, getDeviceStatus(lastSeenAt, now) → online (30s) / away (5m) / offline. Constants HEARTBEAT_ONLINE_THRESHOLD_MS, HEARTBEAT_OFFLINE_THRESHOLD_MS. Chỉ cập nhật last_seen_at khi ping có mac hợp lệ. Doc: device_payload_spec.md, thread_node_coap.md (ping + query mac, heartbeat và restart detection). |
| 2.7.0   | **CoAP payload: entity disabled, state sort, bỏ available:** ENTITY_KEYS 0–6 (unit 4, restore_mode 5, **disabled** 6); STATE_KEYS 0–6 (entity_id, state, brightness, mode, rgb, color_temp, value); bỏ available. device_entity thêm cột **disabled**; device_entity_state không còn ghi available (cột để null). Array entity/state dùng **key 1** (PAYLOAD_KEY_ARRAY); topology payload flat key 0 = mac, 1–5 (rloc16, role, parent, rssi, link_quality; không ipv6). Migration 0001_add_entity_disabled. Doc + memory-bank cập nhật. |
| 2.6.0   | **Notify-first BR sync:** Thread-Host push `CMD_NOTIFY (0x45)` (mask u32 BE) để báo thay đổi; backend debounce + gộp mask rồi pull dataset/ip/tables tương ứng. Giữ polling **STATE 5s** làm health-check; thêm baseline pull khi TCP connect để UI không stale nếu missed notify. Bỏ `frontendConnectionCount`, `onFrontendConnected`/`onFrontendDisconnected`; BR sync không phụ thuộc số client WS. |
| 2.5.0   | **Frontend React → Lit:** migrate toàn bộ UI sang Lit custom elements (Vite + TS + SCSS). State/WS chuyển sang `WebSocketController` (Lit ReactiveController) thay contexts/hooks. Sau đó chuyển sang **light DOM** (tắt Shadow DOM) để CSS global áp trực tiếp; SCSS import kiểu side-effect (không `?inline`/`unsafeCSS`). `modal-dialog` đổi API: truyền nội dung qua property `.body` (TemplateResult) thay cho `<slot>` để modal/confirm modal render đúng trong light DOM. |
| 2.4.0   | **WebSocket refactor (decorators + handler modules):** Đăng ký event qua @WsOn(EVENTS.xxx) (ws.decorator.ts), metadata getWsRoutes(ctor) (ws.type.ts). Handlers tách trong backend/src/websocket/handler/: ConfigHandler, BrHandler, DeviceHandler, ThreadHandler, CommissionerHandler, SrpHandler. websocket.server.ts chỉ tạo instance, gọi sendCurrentConfig/sendBrStatus trên connect, và loop getWsRoutes() để socket.on(event, handler). Doc: docs/websocket.md. |
| 2.3.0   | **CoAP device payload tách rõ (device_info, topology, entity, state):** register/info chỉ nhận keys 0–7 (DeviceInfoPayload), không xử lý topology; topology gửi riêng qua POST /device/update/topology (mac + key 8). Đặt tên: DEVICE_INFO_KEYS, TOPOLOGY_KEY/TOPOLOGY_KEYS, ENTITIES_KEY; DeviceInfoPayload, DeviceTopologyPayload, DeviceEntityPayload/DeviceEntityItem, DeviceStatePayload/DeviceStateItem. Bỏ DevicePayload, asDevicePayload; từng handler type đúng payload. Doc: docs/coap/device_payload_spec.md — spec payload cho Thread-Node. |
| 2.2.0   | **DB refactor + topology rssi/link_quality:** Drizzle ORM schema (database.schema.ts), migrations data/migrations (drizzle-kit generate). BR config gop vao app_settings (br_host, br_port, use_mdns). Logic DB chuyen vao database/repositories (app-settings.repository, device.repository); device-coap.service chi parse/map, goi repo. Slug: generateSlug(deviceName, existingSlugs) pure function; generate 1 lan khi device_slug NULL. **device_topology, device_topology_history:** them cot **rssi**, **link_quality**. Network payload key 8: sub-keys 4=rssi, 5=link_quality. Doc: thread_node_coap.md, border_router_coap_server.md cap nhat cho Thread-Node. |
| 2.1.0   | **CoAP controller refactor:** CoapStatus constants (coap.type.ts: CREATED, CHANGED, CONTENT, NOT_FOUND, SERVER_ERROR). coap.response.ts: echoCoapToken, sendCoapResponse(req, res, status, body?, contentFormat?). parseCborOrRespond(req, res) — parse CBOR, neu null thi send 2.01 va return null (cach A). Handler: mot dong lay parsed, neu null return; logic + mot lan sendCoapResponse cuoi. Router dung CoapStatus.NOT_FOUND, CoapStatus.SERVER_ERROR. |
| 2.0.0   | **CoAP schema 6 bang + 6 URI:** Migration 009: device_info (mac_address TEXT UNIQUE, device_slug), device_topology, device_topology_history, device_entity (restore_mode, deleted_at), device_entity_state, device_entity_state_history. CoAP URI: /device/register/info, /device/register/entity, /device/update/info, /device/update/entity, /device/update/topology, /device/update/state. Node identify bang mac_address (key 7); slug backend-only. Restore flow: register/entity tra body CBOR (key 10 = restore array). CBOR encoder noi bo (cbor.encoder.ts) cho restore response. device-coap.service: upsertDeviceInfo, updateDeviceInfo, upsertTopology, mergeEntity, updateEntityDefinition, upsertEntityState. Doc: thread_node_coap.md, border_router_coap_server.md. |
| 1.9.0   | **CoAP device/entities split:** POST /device/register chi nhan CBOR keys 0–8 (device + network, khong key 9). POST /device/entities (endpoint moi): payload key 0 = device_id, key 9 = array entities; merge theo (device_id, entity_id). Backend luu SQLite bang **device_info**, **device_entity** (migration 007); migration 008 doi ten coap_device/coap_entity sang device_info/device_entity neu da chay 007 cu. CoAP response **echo token** (RFC 7252); tra 2.01 Created / 2.04 Changed. device-coap.service.ts: upsertDevice(), mergeEntity(). Doc: docs/coap/border_router_coap_server.md, cap nhat thread_node_coap.md. |
| 1.8.0   | **Backend path alias + build:** tsconfig backend them `baseUrl` va `paths` (`@utils/*`, `@cbor`, `@database`, `@communicate`, `@coap/*`, `@settings/*`, `@thread/*`, `@websocket/*`). Toan bo import backend doi sang alias. Dev: `tsx watch` tu resolve; build: `tsc && tsc-alias -p tsconfig.json` (tsc-alias thay alias trong dist bang relative path). Fix TS: `coap.router.ts` (instance as object, handler result as unknown); `transport-tcp.transport.ts` (sock null check). |
| 1.7.0   | **Cau truc & path alias:** Frontend feature-based: `src/features/nodes|settings|status`, `src/shared` (components, contexts, hooks, types, styles). Backend domain: `coap/`, `communicate/`, `settings/`, `thread/`, `websocket/`, `cbor/`, `database/`, `utils/`. File naming kebab-case (vd. `command.manager.ts`, `commission-node-modal.component.tsx`, `*.style.scss`). **Path alias frontend:** tsconfig + Vite alias `@/`, `@shared/`, `@nodes/`, `@settings/`, `@status/`; toan bo import TS/TSX/SCSS chuyen sang alias hoac `@use "shared/styles/..."` (SCSS loadPaths: src). **CoAP decorator:** CoAP server refactor — `coap/` module voi `DeviceCoapController`, decorator `@CoapGet`/`@CoapPost`, `registerCoapControllers(server, [DeviceCoapController])`, types va router trong coap/. |
| 1.6.0   | Docker backend: Dockerfile.backend + docker-compose o root (sau them frontend). network_mode: host, volume backend/data. Default BR 192.168.31.3:5000 (migration 005) — mDNS trong Docker khong dung duoc, phai dung IP. Doc backend/README.docker.md. |
| 1.5.0   | CoAP: CBOR decode **noi bo** (backend/src/cbor), bo dependency cbor2. GET /device/ping → 2.05 Content, payload 4 byte timestamp uint32 LE (gia tri luc khoi tao server; restart = timestamp moi). Thread-Node so sanh timestamp → neu doi goi lai register. Payload register: role la **so** (0=child, 1=router, 2=leader). Log structure: device_id, device_name, device_type, rloc16, role, entities. |
| 1.4.0   | CoAP device: Doi ten CoapChildDataServer → CoapDeviceServer; path chi /device/ (register, update, ping). Bo EVENTS.CHILD_DATA, ChildDataPayload; backend khong emit len frontend. CoAP server udp6 listen [::]:5683 (nhan IPv6 Thread-Node). Parse CBOR (cbor2), log "CoAP CBOR -> JSON: ...". Migration 006: DROP TABLE serial_config. |
| 1.3.0   | SRP register qua frame: CMD_SRP_REGISTER (0x44), DATA hostname_len+hostname+backend_ipv6(16)+port(2 BE). Backend tu dong gui khi BR la leader (pullState); IPv6 tu env hoac getPreferredBackendIPv6(). Status: bo "Child data (CoAP)"; them section **System** (bang giong OpenThread): IPv4/IPv6 backend tu SYSTEM_INFO (getBackendAddresses()). Events SRP_REGISTER, SRP_REGISTER_RESULT, SYSTEM_INFO. Bo STATE_FAKE_PAYLOAD; sendState(undefined) = payload rong. |
| 1.2.0   | Child data (CoAP): Backend CoAP server UDP 5683 (CoapChildDataServer), resources /child/register, /child/update, /child/ping; nhan full CBOR, parse, emit subset (CHILD_DATA) len frontend. Frontend Status section "Child data (CoAP)". Shared CHILD_DATA, ChildDataPayload. Doc Thread-Node: docs/coap/thread_node_coap.md. |
| 1.1.0   | UI dark navy: Modal/ConfirmModal dark theme (overlay blur, card-dark, ghost cancel, danger/warning buttons + glow). Settings/System: action cards (Restart + Factory Reset), image panel, danger divider "Vung nguy hiem". Sidebar Settings sub-items: icons `lan`, `device_hub`, `warning`. OpenThread card: header full-bleed, footer same width as body, overflow hidden. |
| 1.0.0   | Migration BR: chi TCP, bo Serial. TransportTcp, BrConnectionConfigService, BrConnectionForm, Settings BR Connection. CMD_DATA da bo. UI: dark theme, ThreadDash; Status connected/disconnected (ghost grid + overlay); version tu frontend/package.json. Nav: Status, Nodes, Settings (bo Console, Topology). Trang Nodes: Router Table + Child Table + Joiner List; Commission Node modal (khong con trang Commissioner rieng). Toast dark (thanh doc trai, title theo type). Stable list keys (joiner, router/child row, modal, LqBarsCell). Joiner countdown local (initialSeconds + receivedAt). |
| 0.9.0   | Shared package, Memory Bank, polish. |
| 0.8.0   | Tables + Commissioner: CMD_ROUTER_TABLE/CHILD_TABLE/JOINER_TABLE, CMD_COMMISSIONER_JOINER, Reset/Factory, leader highlight, age/expiration countdown, Thread start/stop. |
| 0.5.0   | Frame protocol: bỏ CLI, raw serial, parser/builder/CRC8, CMD_ACK/NACK, pull state, dataset parse, set config cơ bản. |
| 0.1.0   | Thời CLI: giao tiếp OpenThread qua CLI text (trước migration frame). |

## What Works (Completed)

### Infrastructure

- npm workspaces monorepo (backend + frontend + shared)
- SQLite database (WAL mode): Drizzle schema (database.schema.ts), migrations data/migrations. app_settings (key-value; BR config br_host, br_port, use_mdns trong app_settings). Schema **8 bảng**: device_info (mac_address UNIQUE, device_slug, last_seen_at, device_name_raw, is_border_router), device_topology + device_topology_neighbor + device_topology_history, device_entity (restore_mode, deleted_at, name_raw), device_entity_state + history, **device_health_br** (1 row per device, UNIQUE(device_id), free_heap, minimum_free_heap, uptime, stack_hwm, mle_detach_count; upsert on poll/NOTIFY). Repositories: app-settings.repository, device.repository, **device-health.repository** (upsertBrHealth).
- Shared package: types, events, constants, validation
- pino logging voi child loggers (transportLogger, frameLogger, wsLogger)
- Table log filtering (ROUTER/CHILD/JOINER TX + ACK bi ẩn); CMD STATE và ACK (RX + TX) cũng ẩn trong command.manager.ts
- Cursor Memory Bank (memory-bank/)
- Tài liệu hệ thống: namorix-thread/documents/ (README.md mục lục; device_payload_spec, backend_discovery_srp, real_br_integration, websocket, installation, protocol, iot-entity-model)

### Backend — Frame Protocol

- Frame parser (state machine, streaming)
- Frame builder + CRC8-Maxim
- CommandManager: pending map, frameId rotation, timeout, ACK/NACK routing
- CommunicateManager: orchestrates TransportTcp + frame (khong con Serial)
- TransportTcp: TCP client (open/close/writeRaw/onRawData/setOnDisconnect)
- BR connection: app_settings keys br_host, br_port, use_mdns (BrConnectionService dùng app-settings.repository)
- PollingManager: fallback table polling; state 5s + notify-first + baseline on connect (không gating theo frontend)
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
- CMD_BR_HEALTH (0x17) — fetch BR health; ACK 16-byte prefix + TLV suffix; backend upsert 1 row device_health_br (poll 60s + NOTIFY bit 6)
- CMD_RESET, CMD_FACTORY
- Auto-start Thread (thread_run_on_connect + portClosedWhileRunning flag)
- SRP register khi BR chuyen sang leader (BACKEND_IPV6 hoac getPreferredBackendIPv6()); log "SRP register: IPv6=... hostname=... port=..." truoc khi gui

### Backend — WebSocket

- **Decorator + handler modules:** Event đăng ký qua `@WsOn(EVENTS.xxx)` (ws.decorator.ts); getWsRoutes(ctor) (ws.type.ts). Handlers trong `websocket/handler/`: ConfigHandler (config get/save/update), BrHandler (BR status, connect, disconnect, test), DeviceHandler (reset, factory reset), ThreadHandler (OT config, thread state, start/stop, run-on-connect, router/child table), CommissionerHandler (joiner table, commissioner connect), SrpHandler (SRP register). websocket.server.ts chỉ wire: tạo instance, on connection gọi sendCurrentConfig/sendBrStatus + emit last* data, rồi socket.on(event) từ getWsRoutes từng handler.
- Toàn bộ EVENTS dùng constant từ shared/src/events.ts
- Relay OtConfig, OtThreadState, tables tới frontend; handle config, BR, OT, device, commissioner, SRP commands

### Backend — CoAP device & System

- CoAP server (coap/coap-device.server.ts): listen UDP 5683 on [::] (udp6). **Decorator:** registerCoapControllers(server, [DeviceCoapController]); paths /device/ping, register/info, register/entity, update/info, update/entity, update/topology, update/state. **GET /device/ping**: query ?mac= (16-char hex) khuyến nghị → update last_seen_at; response 2.05 Content + 4-byte timestamp. **POST register/info**: DeviceInfoPayload keys 0–6; upsert device_info (device_name_raw + COALESCE device_name), slug từ (device_name ?? device_name_raw ?? mac); soft-delete entity/state cũ. **POST register/entity**: key 0 (mac) + **key 1** array entities; merge device_entity (name_raw + COALESCE name, disabled key 6); trả CBOR key 10 = restore. **POST update/topology**: payload role-based (child 0–5 parent_*; router/leader 0,1,2,6 neighbors); device_topology_neighbor replace list. **POST update/state**: key 0 + **key 1** array (STATE_KEYS 0–6; không available). DB: device_entity.disabled, name_raw; device_info last_seen_at, device_name_raw; device_entity_state không ghi available. Doc: device_payload_spec.md, thread_node_coap.md, border_router_coap_server.md.
- System info: getBackendAddresses() (utils/ipv6.util); gui SYSTEM_INFO khi CONFIG_GET/CONFIG_CURRENT. Frontend Status section System (IPv4/IPv6).

### Backend — Path aliases & build

- Path alias trong tsconfig (baseUrl + paths): @utils/*, @cbor, @database, @communicate, @coap/*, @settings/*, @thread/*, @websocket/*. Dev: tsx watch tu resolve; build: tsc && tsc-alias -p tsconfig.json (alias trong dist duoc thay bang relative path).

### Frontend — Pages

- Status: BR connection (host:port), OT config, thread state, version (package.json); section **System** (IPv4/IPv6 backend tu systemInfo)
- Nodes: Router Table + Child Table + Joiner List (pending commissioning); nut "Commission Node" mo CommissionNodeModal; leader badge, age counter, empty states; overlay khi BR disconnect (blur, khong boc box)
- Settings / BR Connection: host + port + test connect
- Settings / OpenThread: cau hinh network + toggle Thread + nut "Lay lai"
- Settings / System: action cards (Khoi dong lai, Factory Reset) voi image panel, danger divider "Vung nguy hiem"; nut Reset/Factory Reset; ConfirmModal countdown 5s

Console da bo. Commissioner gop vao Nodes (modal + Joiner List).

### Frontend — Structure & path alias

- Cau truc: `src/features/nodes|settings|status` (page + components), `src/shared` (components, contexts, hooks, types, styles). Import dung alias: `@/`, `@shared/`, `@nodes/`, `@settings/`, `@status/` (tsconfig paths + Vite resolve.alias). SCSS: loadPaths [src] → `@use "shared/styles/variables"` / `shared/styles/form`.

### Frontend — Common Components

- **SCSS RGB tokens:** `_variables.scss` định nghĩa RGB (hex 6) cho mọi màu dùng trong `rgba()`; component dùng `rgba($var, opacity)` và có thể có functional naming local (vd. `$modal-overlay-bg`).
- **Base:** NmxBaseElement (core), NmxStoreElement (core), AppBaseElement (frontend, getStore → store). Component cần store/locale extend AppBaseElement.
- **Root:** index.html mount `<nmx-main>`; NmxMain → nmx-app-container → nmx-thread-app (NmxThreadApp extends AppBaseElement). Layout subscribe wsConnected + appBar qua createStoreSlice; render sidebar, toast, page-header, main.
- **AppBar (Redux):** Slice `appBar` (actions, visible). Pages dispatch setAppBar/clearAppBar; layout đọc store và render `<page-header>` khi `appBar.visible`.
- Toast: core `<nmx-toast>`, `initToast` + `showToast` dual mode (standalone → store; desktop → CustomEvent). Dark theme; thanh doc trai theo type, title, message muted; slide-in phai, fade-out exit.
- Modal: **confirm-modal đã xóa**; confirm flows dùng trực tiếp **modal-dialog** (vd. Settings Device với countdown trong component). modal-dialog render qua portal; ModalAction tone/style/icon/loading. spin-loader (core/components/spinner). Form/button: class **nmx-form-*** và **nmx-btn*** / **nmx-form-btn*** từ core (`_form.scss`, `_button.scss`); modal alert/info trong modal.style.scss.
- Sidebar (core/components/sidebar): brand "OpenThread", nav Monitor/Settings; Settings sub-items `lan`, `device_hub`, `warning`; status dot theo thread state + BR connection.
- Toggle switch custom

### Documentation

- documents/protocol/usb_cdc_frame_structure.md
- documents/protocol/table_data_format.md
- documents/migration_to_frame_protocol.md
- **documents/** — Tài liệu hệ thống (README.md mục lục). **CoAP (canonical):** coap/device_payload_spec.md — endpoints, CBOR keys, DB 8 bảng, flow đăng ký. **SRP:** coap/backend_discovery_srp.md — Thread-Node discovery Backend. **Kiến trúc:** architecture/real_br_integration.md — BR, routing, troubleshooting. **Backend:** websocket.md (handler modules), installation.md (IPv6 route Linux). **Protocol:** protocol/usb_cdc_frame_structure.md, protocol/table_data_format.md. **Entity model (firmware):** iot-entity-model/entity_model_specification.md. **Frontend core:** namorix-core-usage.md — store, i18n, WS (createWsBridge, onceWithTimeout), Toast dual mode, form/button nmx-*, base elements.
- README.md + TODO.md cập nhật

## What's Left to Build

### Frame Protocol

- **CMD_DATA**: Da bo. Child gui register/update/ping thang backend qua **CoAP** (UDP 5683, payload CBOR). BR chi route IP. Xem documents/coap/device_payload_spec.md, backend_discovery_srp.md.

### Backend

- **Bao mat** *(neu can)*: Auth cho API/WebSocket, HTTPS, IP restriction

### Frontend

- **Topology map** (feature): force/manual layout, pan/zoom, spotlight canvas, node drag, select (toggle, persistent), label box động; edge ẩn khi node offline; focus-visible.
- **Optional**: Shortcut commands, command history (neu lam lai Console hoac terminal)

### Integration & Operations

- **Tim BR** *(tuy chon)*: mDNS browse (khi chay tren host) hoac quet dai IP TCP 5000 (phu hop Docker)
- **Docker**: Build frontend thanh rieng image (backend da co)

## Known Issues / Notes

- Frontend hiện dùng Lit + light DOM; không còn behavior React Strict Mode double-mount.
- **CMD_DATA da bo**: Child gui thang backend qua CoAP (port 5683, CBOR). BR chi route IP. Thread-Node doc: documents/coap/device_payload_spec.md, backend_discovery_srp.md.
- **CoAP ResponseTimeout**: Neu Thread-Node bao `Ping/Register response error: ResponseTimeout` thi handler duoc goi voi **loi timeout** (node khong nhan duoc response), khong phai loi logic backend. Nguyen nhan thuong la **routing/forwarding**: response tu backend gui ve dia chi nguon (rsinfo) nhung packet khong toi node. Kiem tra: (1) Host backend co route toi prefix Thread qua BR (`ip -6 route get <node_ula>`); (2) BR (ESP32-S3 + RCP hoac OTBR) bat border routing va forward prefix OMR vao Thread; (3) Neu BR la Linux OTBR thi can `net.ipv6.conf.all.forwarding=1` va firewall ip6tables cho phep FORWARD vao interface Thread. Chi tiết: documents/architecture/real_br_integration.md (§5.1), documents/coap/backend_discovery_srp.md (§7).
- **Log filter**: TABLE commands và CMD STATE/ACK (RX + TX) bi ẩn khỏi console. Cần xem log file để debug table/state/ack data.
- **Channel la uint8_t**: 1 byte (11-26), KHONG phai 3 byte. Da sua trong CommandManager.
- **BR connection:** IPv6 link-local (fe80::) can zone ID (vd. %enp7s0) tranh EINVAL; nhieu BR chi listen IPv4 → dung IPv4 lam BR Host tranh ECONNREFUSED. Cap truc tiep PC–BR (khong router): PC can IP tinh cung subnet voi BR.
