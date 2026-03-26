# System Patterns — Namorix Thread

## High-Level Data Flow

```
BR (Thread-Host)   listen TCP port 5000
    ↓ TCP (binary frame protocol)
TransportTcp       (backend/src/communicate/transport/tcp.transport.ts)
    ↓ raw bytes stream
FrameParser        (backend/src/communicate/frame/frame.parser.ts)
    ↓ parsed Frame { frameId, cmd, data }
BrCommand          (backend/src/communicate/br/br.command.ts)
    ↓ ACK/NACK resolved via pending map (frameId → Promise)
BrSession/BrManager (backend/src/communicate/br/br.session.ts, br.ts)
    ↓ OtConfigStore.update() + onBroadcast(event, data)
WebSocketServer    (backend/src/websocket/websocket.server.ts)
    ↓ io.emit(EVENTS.xxx, payload)
WebSocketController (frontend/src/shared/controllers/websocket.controller.ts)
    ↓ Lit reactive state update
UI Components (Lit custom elements)
  (frontend/src/features/*, frontend/src/core/components/, nmx-thread-app)

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
| `BrManager` | `backend/src/communicate/br/br.ts` | Facade BR: cửa vào duy nhất; delegate xuống BrConnection/BrSession/BrCommand |
| `BrSession` | `backend/src/communicate/br/br.session.ts` | “Cuộc hội thoại”: state poll 5s, notify debounce, baseline pull, SRP register, BR health poll, topology persist |
| `BrConnection` | `backend/src/communicate/br/br.connection.ts` | Wrap TCP client + raw stream listener |
| `TransportTcp` | `backend/src/communicate/transport/tcp.transport.ts` | TCP client: open(host, port), writeRaw, onRawData, setOnDisconnect |
| `BrConnectionService` | `backend/src/settings/br-connection.service.ts` | Cau hinh BR (brHost, brPort, useMdns) qua app-settings.repository (key-value trong app_settings) |
| `BrCommand` | `backend/src/communicate/br/br.command.ts` | Frame TX/RX. Pending map (frameId → resolve/reject). ACK/NACK routing. Timeout; reply ACK cho IP_ADDR. Log ẩn CMD STATE và ACK (RX + TX). |
| `OtConfigStore` | `backend/src/thread/thread.config.ts` | In-memory store cho `OtConfig` (data). `.update(partial)` merge, `.get()` đọc, `.clear()` khi disconnect |
| `ThreadPolling` | `backend/src/thread/thread.polling.ts` | Fallback table polling (notify-first); tables theo CMD_NOTIFY + baseline on connect. |
| `AppSettingsService` | `backend/src/settings/app-settings.service.ts` | SQLite key-value cho app settings (thread_run_on_connect) |
| CoAP server | `backend/src/coap/coap-device.server.ts` + `device-coap.controller.ts` + `device-coap.service.ts` + `database/repositories/device.repository.ts` + `coap.response.ts` | CoAP UDP 5683 (udp6, [::]). Paths: /device/ping, register/info, register/entity, update/info, update/entity, update/topology, update/state. CoapStatus (coap.type.ts); sendCoapResponse/echoCoapToken (coap.response.ts); parseCborOrRespond (controller). GET ping → 2.05 + timestamp. POST register/info: upsert device_info (mac_address), slug (generateSlug); soft-delete; topology optional. POST register/entity: merge device_entity, tra restore CBOR (key 10). POST update/*: update info, entity def, topology (role-based; device_topology_neighbor), state. DB: device.repository, app-settings.repository, **device-health.repository** (upsertBrHealth — 1 row per BR, frame CMD_BR_HEALTH). SQLite 8 bang. Khong emit qua io |

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
| BR_HEALTH | 0x17 | Pull BR health; ACK = 16-byte prefix (free_heap, minimum_free_heap, uptime, mle_detach_count uint32 BE) + optional TLV suffix (stack_hwm). Backend upsert 1 row device_health_br (poll 60s + NOTIFY bit 6). |
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

- **Base elements (core):** **NmxBaseElement** — font injection + light DOM only. **NmxStoreElement** extends NmxBaseElement: abstract `getStore()`, optional locale subscription (`static useLocale`), `createStoreSlice(selector, equals?)`; dùng `subscribeStoreSelector` + `selectLocale` từ `@namorix/core/store`. `willUpdate(changed: PropertyValues)` khớp Lit (không ép `Map<string, unknown>`).
- **Trong shell Desktop:** `window.nmxCore` (type `NmxCoreApi` từ `@namorix/core/shell-api`). Đồng bộ i18n với shell: `nmxCore.onLocaleChange?.((locale) => { … })` hoặc lắng `ShellWindowEvent.LocaleChanged` từ cùng package constants — xem `nmx-thread-app`.
- **AppBaseElement** (`frontend/src/core/AppBaseElement.ts`): extends `NmxStoreElement<RootState>`, implements `getStore() { return store }`. Component cần store/locale extend AppBaseElement.
- **Root:** `index.html` mount `<nmx-main>`; NmxMain → `<nmx-app-container>` slot `<nmx-thread-app>`. **NmxThreadApp** (app.ts) extends AppBaseElement. Layout có thể dùng `createStoreSlice(selectWsConnected)`, `createStoreSlice(selectAppBar)`; render sidebar, toast, page-header, và main page qua `<nmx-content>` (core) nhận `currentPage` + `pages`.
- **AppBar (Redux):** Slice `appBar` (actions, visible). Pages dispatch setAppBar/clearAppBar; layout đọc store và render `<page-header>`.
- **WebSocket:** Core `createWsBridge<S>({ store, url?, options? })` — builder `.onConnect()`/`.onDisconnect()`/`.onConnectError()`/`.on(event, handler)`/`.start()`/`.stop()`/`.getSocket()`. Plugin (vd. `frontend/src/core/ws/ws-bridge.ts`) cấu hình lifecycle + domain events rồi gọi `bridge.start()` một lần (vd. trong root `connectedCallback`). WS connection state: `wsConnectionReducer` + `wsConnectionActions` từ `@namorix/core/store`. Emit/response với timeout: `onceWithTimeout` từ `@namorix/core/ws`. Socket URL mặc định `window.location.origin` (Vite proxy).
- **i18n:** Slice `i18n` trong store, mặc định `"en"`; set từ user settings bằng `store.dispatch(setLocale(...))`. Components re-render khi locale đổi nhờ subscribe `selectLocale` (NmxStoreElement locale hoặc `createLocaleController` từ `@/core/i18n/locale-controller`).
- **Path alias:** `@/`, `@core/*`, `@settings/*`, … (tsconfig + Vite). SCSS: `loadPaths: [src]` → `@use "styles/..."` / `shared/styles/...`.

### Navigation (Sidebar)

- Sidebar chia 2 group: **Monitor** (`status`, `nodes`, `joiner`, `topology`) và **Settings** (`settings-connection`, `settings-thread`, `settings-device`).
- Settings không dùng “expand/collapse” và không còn trang trung gian `settings-view`; mỗi item Settings map trực tiếp tới 1 page component.
- Navigation source-of-truth: `NmxThreadApp.page` (NavPage union) được cập nhật từ event `navigate` của `<nmx-sidebar>`, sau đó được truyền xuống `<nmx-content>` để chọn page theo `id` từ `NmxPageBuilder` (controlled rendering, `nmx-content` không tự lắng nghe event).

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

### Internationalization (i18n)

- **Translation lookup:** `frontend/src/core/i18n/i18n.ts` export `t(key, params?)` dựa trên `@namorix/core/i18n` runtime (`createStoreBoundTranslator`, `getByPath`, `interpolate`) và locale trong store.
- **Source of truth:** `frontend/src/core/i18n/locales/en.json` là dictionary chính cho UI text. `vi.json` được dùng cho dịch sau (có thể trống/partial).
- **Scope:** Chỉ i18n **user-facing strings** do frontend render. Không i18n technical tokens (icon names, CSS classes, ids, event names, protocol/table column keys) và không dịch raw error string/data từ backend; chỉ dịch fallback messages do frontend tự tạo.

#### Locale flow (store ↔ i18n)
- Không còn detect/persist locale (localStorage). `t()` từ `initI18n({ store, dicts, fallbackLocale })`; locale set bằng `store.dispatch(setLocale(...))` sau khi load user settings (vd. từ WebSocket config).

### Age Counter Pattern (Nodes)

Implemented trong `nodes.component.ts` (Lit): lưu `routerAgeOffsets` / `childAgeOffsets` và tick mỗi giây để age tăng client-side, reset offsets khi backend gửi rows mới (so sánh reference).

### Leader Row Highlight

- So sánh RLOC16 với `otConfig?.leaderRloc16`. Chỉ hiển thị badge "LEADER" trong cell (không nền xanh lá cả dòng).

### Nodes Page Structure

- Trang Nodes: header (các header actions + nút Commission Node), Router Table, Child Table, Joiner List (pending commissioning). Khi BR disconnect: overlay phủ main (backdrop blur), card "Border Router Disconnected" + Try Reconnecting; nội dung phía sau giống layout khi connect (ghost), không bọc trong box riêng.
- Stable list rendering: joiner card `joiner-${sharedId}-${expirationMs}`; router/child row theo RLOC16 (fallback theo index); modal detail dùng `fieldKey` (tên cột).

### Toast Notifications (core)

- API: `showToast(type, message, duration?)` từ `@namorix/core` — type = success | error | warning | info. **Dual mode:** Nếu `window.nmxCore` → dispatch CustomEvent "nmx-action" (host render); ngược lại dispatch vào store plugin, `<nmx-toast>` render. Plugin gọi `initToast({ store, selectToasts, getTitle? })` một lần, mount `<nmx-toast>` khi standalone. Title qua `getTitle(type)` (i18n). Dark theme: thanh dọc trái theo type, message muted; slide-in phải, fade-out exit. Chi tiết: `documents/namorix-core-usage.md`.

### Sidebar Status Dot Colors

Status dot tren Sidebar (header) dung chung mapping mau:
`leader=green | router=purple | child=blue | disabled/detached=orange | disconnected=gray`

### Status Page — Connected vs Disconnected

- **Connected:** BR card với vùng icon lớn (router), badge Connected, Host Address, Uptime, nút Refresh; OpenThread grid 3×4 (label UPPERCASE, giá trị accent cho Network Name / IP), Channel có badge "2.4 GHz", Network Key có nút show/hide; **System** section (cùng style bảng): IPv4 (backend), IPv6 (backend) từ systemInfo.
- **Disconnected:** BR card layout ngang: icon tròn 48px đỏ (link_off) + label "BR Connection Status" + chữ "DISCONNECTED" + chấm đỏ pulse + nút Refresh. OpenThread: ghost grid (opacity 0.4, blur) + overlay card (backdrop-blur) "No Network Data Available" + nút "Configure Border Router" gọi `onConfigureBr` (App truyền `() => setPage("settings")`).

### Version Display

Version hiển thị trên Status subtitle lấy từ `frontend/package.json`: Vite `define { __APP_VERSION__: JSON.stringify(pkg.version) }`, `src/vite-env.d.ts` declare `__APP_VERSION__`. Cập nhật version khi release tại `frontend/package.json` (đồng bộ với progress.md).

### Modal & ConfirmModal (dark navy)

- **modal-dialog:** Nội dung truyền qua `.body` (TemplateResult). **Portal:** overlay render ra `document.body` (Lit `render(template, _portalNode)` trong `updated()`; node tạo/append trong `connectedCallback`, remove trong `disconnectedCallback`) để overlay phủ cả sidebar/header. **ModalAction:** `tone` (default|info|success|warning|danger), `style` (text|filled|outlined), `icon` (string = Material Symbol name hoặc TemplateResult), `loading` (hiện spin-loader, không disable nút); mặc định theo kind: Confirm = filled + info, Cancel = text + danger, Action = text + default. `className` append thêm khi cần custom. Footer buttons cố định chiều cao; `.modal-action-icon` 20×20px, line-height 0 (tránh icon nhích khi font load).
- **Modal overlay/box:** Overlay `rgba($navy-900, 0.78)` + `backdrop-filter: blur(6px)`; box `$card-dark`, border `$brand-border`, shadow; header divider; close hover; title/subtitle. `.modal-alert`, `.modal-alert--warn`, `.modal-info-box` cho nội dung modal.
- **ConfirmModal:** Message `$text-dark`; nút Cancel/Confirm; countdown 5s không đổi.
- **Light DOM:** `modal-dialog` không dùng `<slot>`; `.body` TemplateResult render trong portal.

### Joiner / Commissioner (Nodes)

- **Trang Joiner** (`features/joiner/`): Joiner Table + nút mở commission modal. Commission form (EUI64, PIN, timeout) và footer actions nằm trong `joiner.component.ts`; dùng `modal-dialog` với body/form classes `.nmx-form-*` từ core và modal.style.scss.
- **Commissioner điều kiện:** Cho phép khi BR **attached** (state = leader, router hoặc child). `_canCommission` (thay `_isLeader`) = true khi `threadState` là "leader" | "router" | "child"; alert và disable form khi không thỏa.
- **Timeout chọn:** Horizontal radio row (`.nmx-form-radio-row`, `.nmx-form-radio`, `.nmx-form-radio-pill` trong core `_form.scss`); wrapper có border/radius, items hình chữ nhật, gap, hover bg, selected = primary background.

### SCSS color tokens (RGB + functional naming)

- **Token-driven:** ưu tiên dùng CSS variables từ `@namorix/core` (tokens) và base primitives. Tránh Sass global tokens; chỉ dùng Sass variables khi thật sự cần trong phạm vi component.

### Sidebar Settings sub-items

- Dropdown Settings có 3 mục con với icon Material Symbols trước label: **BR Connection** `lan`, **OpenThread** `device_hub`, **System** `warning`. Class `sidebar-nav-nested-icon` font-size 16px.

### Settings / System page

- Layout: `nmx-form-page` (+ class page riêng); header (title "Hệ thống", mô tả, hint khi chưa kết nối BR); hai **action cards** (image panel trái + content phải), danger divider giữa, ConfirmModal cho Reset và Factory Reset. Card Restart: nền #111827, icon cam; Card Factory: nền tối đỏ, border #3d1a1a, title đỏ. Nút dùng `.system-btn-orange` / `.system-btn-red`.

### OpenThread form card layout

- `.nmx-form-card` (+ class card riêng): `padding: 0`, `overflow: hidden` khi cần footer không lồi góc. `.ot-card-header` full-bleed (padding riêng). `.ot-card-footer` margin `20px 1.75rem 1.75rem` (cùng width với body), border-radius, nền $bg-input.

### Topology map (feature)

- **Component:** `topology-map.component.ts` (Lit, light DOM); layout force hoặc manual (FEW_NODES_THRESHOLD=10); pan/zoom; drawSpotlight canvas (overlay, hole destination-out, cyan tint).
- **Select:** click node → _selectNode(toggle); ev.stopPropagation() trong @click để không bubble lên stage; selected bền khi nhả chuột.
- **Label:** rect width động `Math.max(80, labelText.length*6.5+20)`; .node__label-bg (default/--selected/--offline); hover/selected styles cho label-bg & label; &--selected:hover override để selected thắng hover.
- **Node body:** baseline không filter; hover/selected thêm filter + stroke; &--selected .node__inner scale(1.08); fill transition; offline stroke muted.
- **Edge:** ẩn nếu fromNode.offline || toNode.offline. Focus: tabindex="0", :focus-visible box-shadow.

## Namorix Desktop (plugin — cross-repo)

- **Repo:** `namorix` (Desktop shell + backend). **Spec:** `namorix/documents/namorix-desktop-architecture.md` — plugin container, manifest JSON, inject `<script type="module">` + CSS, `customElements.whenDefined`, z-index plugin ≤ 99, portal `#nmx-plugin-portal`.
- **Thread** đóng vai plugin **`thread`** trong spec; luồng auth/gateway/log tập trung ở Desktop — không thay pattern BR/TCP/CoAP nội bộ dashboard đã mô tả ở các mục trên.
- **Trùng bundle `@namorix/core`:** Shell và plugin đều có thể import cùng source component Lit. Core **0.9.2+** dùng `defineCustomElementOnce` cho các tag chrome dùng chung — tránh `NotSupportedError: the name "nmx-sidebar" has already been used` khi `desktop.js` đã define trước `thread.js`.
- Chi tiết triển khai plugin: xem **namorix** memory bank; tránh nhân đôi bảng milestone tại đây.
- **Desktop admin entries contract:** `shell:addonRegistry:listEntries` ack payload cho admin entries không còn secret, chỉ còn `entryId/addonId/baseUrl/manifest/createdAt` (host-side xử lý); Thread addon không cần quan tâm trường này.
