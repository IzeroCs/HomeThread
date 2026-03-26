# Active Context — Namorix Thread

## Current Work Focus

Backend ổn định với BR qua TCP + frame protocol, CoAP device ingest, SRP register, WebSocket handlers theo decorator. Frontend đã **migrate React → Lit** (Web Components), **light DOM**. **Topology map** (feature `src/features/topology/`): pan/zoom, spotlight canvas, manual layout khi ≤10 node, node select (toggle, persistent), label box width động, edge ẩn khi offline, focus tabindex + :focus-visible; accent cyan `$topology-accent`, nền `$bg-topology`. **Settings UI:** palette thống nhất (bg-app/sidebar/card/input), button semantics (primary/ghost/warn/danger), danger zone subtle, Connected badge + sidebar dot cyan. **Cấu trúc:** feature-based (`nodes|settings|status|topology`, `src/shared`); path alias frontend/backend như trước. Tiếp theo: bảo trì, optional mDNS/scan BR, security nếu cần.

**Current runtime contract (container-managed):**
- Desktop quản lý addon bằng Docker API (pull/create/start/stop/remove/logs), không còn control/register WS giữa addon backend và Desktop.
- Frontend Thread trong shell kết nối runtime Socket.IO trực tiếp addon backend qua `data-addon-base-url`.
- Code Thread đã bỏ control-state slice/bridge và không còn gate `blockedByPolicy` từ control channel.
- Docker image build dùng **một** `Dockerfile` multi-target (`prod`/`dev`), không còn `Dockerfile.dev`; compose dev build với `target: dev`.
- Manifest image label đã rút gọn theo runtime fields đang dùng: `id`, `displayName`, `entry`, `styles`, `element`, `internalPort`, `defaultWindowSize`.
- Docs/runtime contract đã sync lại theo current-state: không mô tả control/register WS như flow đang dùng; tài liệu tích hợp host tập trung vào shell events `shell:addon:*` + direct runtime Socket.IO.
- Lint/style stack đã thêm ở root repo (`.eslintrc.cjs`, `stylelint.config.cjs`) + Cursor rule `lint-and-style.mdc`; scripts lint/fix/watch cho frontend/backend đã sẵn sàng.
- `npm run dev` root hiện chạy kèm lint watchers để phát hiện lỗi style/import trong lúc phát triển.

Frontend align với hệ “core/shared”:
- **Spec Desktop (SoT):** `namorix/documents/namorix-desktop-architecture.md`; mục lục host: `namorix/documents/README.md`.
- Core qua sibling `../../namorix/core` (workspace giống Desktop).
- **Core 0.9.2+ — đăng ký custom element an toàn khi embed shell:** Các component chrome dùng chung (`nmx-sidebar`, `nmx-toast`, …) trong `@namorix/core` đăng ký bằng `defineCustomElementOnce` (không dùng `@customElement` parse-time). Shell Desktop load trước → addon `thread.js` load sau không gây `NotSupportedError` trùng tên tag. Chi tiết: `namorix/memory-bank/systemPatterns.md`.
- **Shell contract (Namorix Desktop):** Hằng số và tên sự kiện shell từ `@namorix/core/shell-api` (`AddonRuntimeStatus`, `ShellWindowEvent`, …). Đồng bộ locale với shell: ưu tiên `window.nmxCore?.onLocaleChange?.(handler)` (trả unsubscribe); fallback `addEventListener(ShellWindowEvent.LocaleChanged, …)` — xem `frontend/src/nmx-thread-app.ts`. Gateway Desktop forward JWT tới addon backend qua header **`Authorization: Bearer <jwt>`** (addon API đọc `req.headers.authorization`; không dùng `x-forwarded-authorization`).
- **Auth host update (Namorix Desktop 0.9.20+):** Claims/auth user của host chuyển sang **role-only** (`user.role` bitmask, hiện tại `ADMIN=1<<0`), không còn `permissions` trong auth snapshot. Không giả định username admin cố định; quyền quản trị dựa trên role.
- **Desktop login API (host 0.9.23+):** `POST /api/auth/login` dùng JSON **`{ "username", "password" }`** — khi viết curl / tooling hướng tới shell addon manager events, xem **`namorix/documents/thread-desktop-addon-integration.md`** (đã cập nhật).
- Bundle core tokens/base styles qua Vite (alias `@namorix/core` → source khi `dist/` chưa build)
- Store: `createAddonStore` từ `@namorix/core/store`; locale mặc định `"en"`, set từ user settings qua `setLocale`
- i18n: `initI18n({ store, dicts, fallbackLocale })` từ `@namorix/core/i18n`; không còn locale-storage/detect
- Base classes: **NmxBaseElement** (core, font + light DOM), **NmxStoreElement** (core, store + locale + createStoreSlice), **AppBaseElement** (frontend, extends NmxStoreElement, `getStore()` → app store)

Giao tiếp BR ↔ backend theo hướng **notify-first**: Thread-Host push `CMD_NOTIFY (0x45)` mask thay đổi; backend debounce + gộp mask rồi pull đúng phần cần (dataset/ip/tables). Backend vẫn **poll STATE mỗi 5s** để health-check và phát hiện role transitions; khi TCP connect thành công sẽ pull baseline để UI không stale nếu missed notify. **Không** theo dõi số client frontend (đã bỏ `frontendConnectionCount`, `onFrontendConnected`/`onFrontendDisconnected`); websocket.server.ts trên connection chỉ gửi config + last* data, không gọi communicate.

### BR module layout (`communicate/` — từ 2.15.1+)
- `backend/src/communicate/` chuẩn hoá theo domain: `frame/`, `transport/`, `br/`.
- `br/`: `BrConnection` (TCP/raw), `BrCommand` (frame TX/RX), `BrSession` (poll/notify/baseline/SRP/health/topology), `BrManager` (facade).
- `thread/thread.config.ts` dùng `OtConfigStore` (store) + `OtConfig` (data type) để tránh va chạm type/class.

## Recent Significant Changes

> Lưu ý: Các mục bên dưới chủ yếu là **historical transition**. Runtime hiện hành của Thread addon là container-managed, direct runtime Socket.IO, không còn register/control WS flow.

### WS-only full control plane (historical)
- Thread backend bỏ HTTP register/sync loop, chuyển sang control WS events `register:request/register:ack` và `manifestSync:request/manifestSync:ack`.
- Frontend Thread bỏ bootstrap `GET /api/desktop-bridge-config`; runtime WS khởi tạo **direct** tới addon backend (`data-addon-base-url` do shell inject), không qua Desktop runtime relay.
- Desktop host addon-plane HTTP paths giờ trả explicit breaking rejection (`410`) để chặn hybrid behavior.

### Direct runtime finalized (Desktop relay removed, historical transition)
- Desktop không còn mount runtime relay `/namorix-addon-ws`.
- Frontend Thread khi chạy trong shell đọc `data-addon-base-url` và mở Socket.IO trực tiếp đến addon backend origin.
- Control-plane vẫn realtime qua `/namorix-addon-control-ws`; policy block/revoke tiếp tục do Desktop authority phát xuống addon backend.

### Level-3 control-plane (historical)
- Shared contract mới trong `@namorix/core-shared`: `backend-control-ws.ts` (protocol version, typed events, lifecycle states, reason codes).
- Desktop backend mount control gateway path `/namorix-addon-control-ws` và push lifecycle theo admin transitions (`approved/blocked/rejected`).
- Policy cứng control channel:
  - `max_control_connections_per_addonId = 5`
  - defensive limit theo IP
  - uniqueness `addonId + instanceId` (connection mới thay connection cũ)
  - `identify_timeout_ms` + heartbeat timeout để dọn zombie sockets
- Thread backend migrate sang reusable SDK trong `@namorix/core-backend`:
  - `createAddonControlClient`
  - `AddonControlStateService`
  - `createAddonControlAllowRequestGuard`
  - nhận lifecycle realtime từ Desktop
  - phát state ra frontend qua WS event `addon:controlState`
  - deny runtime socket handshake khi lifecycle không phải `approved`
- Frontend Thread dùng control slice/ws helper từ `@namorix/core`:
  - `addonControlReducer` / `addonControlActions`
  - `bindAddonControlWsEvent`
  - không giữ local duplicate slice/control handler trong repo Thread
- Frontend Thread giữ UX hard-state:
  - render waiting/blocked state theo lifecycle control-plane
  - khi `blocked/revoked`: set connect error rõ ràng + stop WS bridge reconnect loop

### Product rename plugin → addon (2.34.0)
- Đồng bộ với Desktop **0.9.29**: `createAddonBackendServer`, `addon-secret` / `data/.addon-secrets`, HTTP `/api/addons/register-request`, WS `/namorix-addon-ws` + `query.addonId`, shell events `shell:addons` / `shell:addonRegistry:*`, build `npm run build:addon` + `dist/addon`. Không giữ alias tên cũ.

### Docs / memory-bank alignment (2.34.1)
- `memory-bank/` + `documents/namorix-core-usage.md` khớp host: `createAddonStore`, addon vocabulary; khi cần mô tả shell Desktop + importmap `/dist/core/*`, tham chiếu tên file Vite helper trên repo **`namorix`**: `vite-core-dist-from-src.ts`, `vite-emit-core-dist.ts` (xem `namorix/documents/README.md`).

### Manifest sync endpoint after approval (2.34.x)
- Registration loop (`createDesktopAddonRegisterLoop`) đã chuyển sang behavior theo trạng thái response: `pending` (`202`) thì retry, `approved` (`200`) thì dừng retry.
- Sau khi `approved`, Thread backend gọi endpoint Desktop `POST /api/addons/manifest-sync/:addonId` để đồng bộ `baseUrl` + manifest (verify `registrationSecret`), giúp host nhận thay đổi metadata mà không cần bật lại register spam.
- Policy update manifest ở host dùng allowlist configurable; `id` phải khớp `addonId`, `element` giữ cố định để tránh phá contract mount.

### Importmap alignment for Desktop shell bundle (2.34.x)
- Chuẩn hoá imports trong frontend Thread để tránh deep specifier `@namorix/core/components/*`; dùng `@namorix/core/components` cho side-effect registration và named exports từ core components.
- Mục tiêu: bundle addon khi load trong Desktop shell không còn lỗi runtime `Failed to resolve module specifier '@namorix/core/components/...'`.
- Kết quả verify: rà source `frontend/src` và output `dist/addon/assets/thread.js` không còn deep components specifier.

### Full SDK addon backend in core (2.31.0)
- `@namorix/core-backend` thêm Full SDK:
  - `createAddonBackendServer` (Express/CORS/static + route chuẩn `manifest`/`health`/`desktop-registration-status`)
  - shared API response types cho status endpoints
  - registration loop tích hợp sẵn (vẫn giữ semantics backoff + 403 stop)
- `backend/src/index.ts` của Thread refactor aggressive sang dùng SDK; file chỉ còn phần resolve env/manifest/public base URL + bootstrap domain runtime (Socket.IO/BrManager/CoAP) qua hooks.
- API contract giữ nguyên path và shape cho `GET /health`, `GET /api/desktop-registration-status`, và payload đăng ký vẫn có `registrationSecret`.

### Desktop embed WS fix + manifest migration + security notes (2.33.0, historical)
- Frontend từng dùng `GET /api/desktop-bridge-config` + Desktop runtime gateway.
- Flow này đã được thay thế hoàn toàn bởi direct runtime ở các mốc mới hơn.
- Backend logger migration sang `@namorix/core-backend`, bỏ wrapper `desktop-origin.ts`; README/techContext thêm cảnh báo rõ Socket.IO backend hiện chưa có auth end-user (chỉ an toàn trong trusted LAN).

### Core-shared dev alignment (workspace)
- Theo host repo `namorix`, `@namorix/core-shared` đã chuyển sang package exports src-based (`core/shared/src/index.ts`), giúp frontend/backend trong workspace không phụ thuộc `dist` stale khi thêm shared types.

### Addon-generic extraction to `@namorix/core-backend` (2.30.0)
- Core backend thêm các module generic:
  - `addon/addon-secret.ts` → `getOrCreateEnvStyleSecret`
  - `addon/addon-registration-loop.ts` → `createDesktopAddonRegisterLoop` (status/backoff/403 stop)
  - `addon/addon-runtime.types.ts` (đã rename từ file registration cũ) → runtime snapshot contracts
- Thread backend adopt ngược:
  - `backend/src/addon-secret.ts` thành wrapper mỏng gọi helper core.
  - `backend/src/index.ts` bỏ loop local, dùng engine core; giữ nguyên route `/health` và `/api/desktop-registration-status` cùng shape payload.
  - Domain-specific vẫn ở Thread (`loadAddonManifest`, `resolveAddonPublicBaseUrl`, BR/TCP/CoAP/SRP).

### Addon registration secret file auto-generate (2.29.0)
- Thread backend thêm `backend/src/addon-secret.ts`: secret đăng ký addon được đọc/tạo tại `data/.addon-secrets` (mode `0600`), không còn yêu cầu nhập secret thủ công trong `.env` khi dùng file.
- `backend/src/index.ts` dùng secret file cho payload `register-request`; warning `disabled` chỉ còn cho thiếu `DESKTOP_BACKEND_URL`.

### Backend env constants (2.28.0)
- `backend/src/env.ts` là điểm duy nhất parse `.env` + defaults (PORT, DESKTOP_ORIGIN, addon register vars, SRP vars...); `index.ts`, `desktop-origin.ts`, `communicate/br/br.session.ts` chuyển sang dùng constants thay vì `process.env` rải rác.
- Mục tiêu: cấu hình typed/ổn định hơn, dễ debug (đặc biệt flow register addon và SRP), không đổi behavior runtime.

### Addon register loop + status endpoint (2.27.0)
- `backend/src/index.ts` thêm loop `POST /api/addons/register-request` về Desktop backend (`DESKTOP_BACKEND_URL`) với backoff, log rõ từng attempt/success/fail và dừng retry khi nhận `403`.
- Trạng thái đăng ký được expose qua:
  - `GET /api/desktop-registration-status`
  - `GET /health` (field `addonRegister`)
- Mục tiêu: khi shell Desktop thấy danh sách addon rỗng, có thể kiểm tra trực tiếp từ backend Thread xem đã gửi request hay chưa và lỗi gần nhất là gì.

### `@namorix/core-backend` + layout `data/` (2.26.0)
- **Core (repo `namorix`):** `resolveNamorixRepoDataLayout` trong `namorix/core/backend` — Thread `database.db.ts` dùng thay tính path tay; đồng bộ với Desktop `paths.ts`.
- **Dependency:** `backend/package.json` + root `namorix-thread/package.json` — `file:` tới sibling `namorix/core/backend`. **Bắt buộc `npm install` ở root Thread** để có `node_modules/@namorix/core-backend`.
- **Agent:** Repo sibling **`namorix`** có `.cursor/rules/no-terminal.mdc` — khi làm việc trong `namorix/` không tự chạy terminal; hướng dẫn user chạy `npm install` / dán log nếu cần.

### Core alias base path + tsconfig (2.25.0)
- **Vấn đề:** Sau khi bỏ wrapper `dashboard/`, `siblingReposRoot` còn `resolve(__dirname, "../../..")` → trỏ sai (thiếu segment `namorix-workspace`), Vite/esbuild báo **ENOENT** khi mở file core (vd. `@namorix/core/i18n`).
- **Sửa:** `frontend/vite.config.ts` và `frontend/vite.addon.config.ts` dùng `siblingReposRoot = resolve(__dirname, "../..")` (root workspace chứa `namorix/` và `namorix-assets/`). `frontend/tsconfig.json` đồng bộ `paths` với `../../namorix/...` và `../../namorix-assets`.
- **npm:** Bỏ dependency `file:` `@namorix/core` ở frontend (tránh xung đột workspace + alias đã đủ cho dev). Root `namorix-thread/package.json` có `version` để `npm install` ổn định.

### Thread frontend Vite CORS + scripts (unreleased)
- `frontend/vite.config.ts`: CORS theo `DESKTOP_ORIGIN`; runtime WS không còn proxy qua Desktop gateway.
- `frontend/package.json`: bỏ script `dev:shell`; luồng chuẩn dùng `dev`/`dev:frontend`.
- `README.md` (root): cập nhật hướng dẫn chạy frontend tương ứng theo gateway runtime.

### Namorix Core: Toast dual mode + createWsBridge + form/button nmx- prefix (unreleased)
- **Toast (core):** Slice `toast` (ToastType, Toast, toastReducer, toastActions), component `<nmx-toast>`, `initToast({ store, selectToasts, getTitle? })` và `showToast(type, message, duration)`. **Dual mode:** Nếu `window.nmxCore` → dispatch `CustomEvent("nmx-action", { detail: { action: "show-toast", payload } })`; ngược lại dispatch vào store app. Addon gọi `showToast()` từ `@namorix/core`, mount `<nmx-toast>` khi standalone.
- **WebSocket (core):** `createWsBridge<S>({ store, url?, options? })` builder: `.onConnect()`, `.onDisconnect()`, `.onConnectError()`, `.on(event, handler)`, `.start()`, `.stop({ close? })`, `.getSocket()`. Addon cấu hình lifecycle + domain events rồi `bridge.start()`. `onceWithTimeout(socket, event, timeoutMs, emit)` từ `@namorix/core/ws`.
- **Form/button (core):** Class form và button trong core đổi sang tiền tố `nmx-`: `.nmx-form-page`, `.nmx-form-card`, `.nmx-form-field`, `.nmx-form-control`, `.nmx-form-actions`, `.nmx-form-btn`, `.nmx-form-btn--primary/--ghost`, `.nmx-btn`, `.nmx-btn-filled`, `.nmx-btn-icon`, v.v. Frontend (connection, device, thread, joiner) và SCSS đã cập nhật dùng `nmx-form-*` / `nmx-form-btn*`. Core thêm style cho `.nmx-form-control-icon`, `.nmx-form-control--with-icon`, `.nmx-form-radio-row` / `.nmx-form-radio` / `.nmx-form-radio-pill`.
- **Tài liệu:** `documents/namorix-core-usage.md` — hướng dẫn dùng core (store, i18n, WS, Toast, form/button, base elements). Mục lục `documents/README.md` đã thêm link.

### Frontend: base elements, root, AppBar, confirm-modal removal (unreleased)
- **Core base (`@namorix/core`):** **NmxBaseElement** — font injection + light DOM (`createRenderRoot() { return this }`). **NmxStoreElement** extends NmxBaseElement: abstract `getStore()`, optional locale subscription (`static useLocale`), `createStoreSlice(selector, equals?)`; dùng `subscribeStoreSelector` + `selectLocale` từ core.
- **AppBaseElement** (`frontend/src/core/AppBaseElement.ts`): extends `NmxStoreElement<RootState>`, implements `getStore() { return store }`. Component app extend AppBaseElement khi cần store/locale.
- **Root:** `index.html` mount `<nmx-main>`; NmxMain render `<nmx-app-container>` với slot `<nmx-thread-app></nmx-thread-app>`. **NmxThreadApp** (app.ts) extends AppBaseElement, tag `nmx-thread-app`.
- **AppBar qua Redux**: Slice `appBar` với `setAppBar`, `clearAppBar`; selector `selectAppBar`. Layout đọc store và render `<page-header>` khi `appBar.visible`; pages dispatch setAppBar/clearAppBar.
- **confirm-modal bỏ**: Settings Device dùng trực tiếp `<modal-dialog>` với countdown trong component.
- **page-header**: Component appbar extend base; tag `page-header`, export `PageHeaderAction`.

### Navigation layout: `nmx-content` + `NmxPageBuilder` (unreleased)
- **Core:** `@namorix/core/components/layout` cung cấp `nmx-content` (light DOM) + `NmxPageBuilder`/`PageEntry` để host app render trang theo `currentPage` (controlled component; `nmx-content` không tự lắng nghe navigation event).
- **Frontend:** `frontend/src/nmx-thread-app.ts` giữ state `page: NavPage` và cập nhật state qua event `navigate` từ `<nmx-sidebar>`, sau đó render main bằng `<nmx-content .currentPage=${this.page} .pages=${this.pages}></nmx-content>`.
- **Prebuilt pages:** `this.pages` được build trước trong field initializer (tạo 1 lần) bằng `new NmxPageBuilder<NavPage>().add(id, render).build()`.
- **Custom element registration:** NmxThreadApp import side-effect các page components để các custom element (vd `status-view`, `nodes-view`, `joiner-view`, `topology-map`, `settings-*`) được define trước khi `nmx-content` render callback.

### Frontend i18n (unreleased)
- **Internationalization scaffold:** `frontend/src/core/i18n/` với `t(key, params?)`, locale `"en"|"vi"`, fallback `locale → en → key`. Locale nằm trong store (`@namorix/core/store` i18n slice) với mặc định `"en"`, và được set từ user settings/config bằng `setLocale`.
- **Runtime**: sử dụng `@namorix/core/i18n` (`createStoreBoundTranslator`, `createLocaleStorage`, `normalizeLocale`).
  - **Update**: Locale mặc định `"en"` và được set từ user settings/config bằng `store.dispatch(setLocale(...))`. Không còn detect/persist locale bằng localStorage và không còn module `core/i18n/locale-storage.ts`. `t()` được tạo qua `initI18n({ store, dicts, fallbackLocale })`.

### Settings navigation + form styling (unreleased)
- **Settings pages:** Bỏ `settings-view` trung gian (không còn `activeSection`). Nav pages đổi sang `settings-connection`, `settings-thread`, `settings-device` và sidebar Settings group hiển thị tương ứng **Connection / Thread / Device**.
- **Form CSS normalization:** Chuẩn hoá import form system: `shared/styles/_form.scss` được import global từ `frontend/src/app.style.scss`; các feature scss không còn tự `@use "shared/styles/form"`. Footer actions dùng `.form-actions` thay vì panel custom; `frontend/src/features/settings/settings.style.scss` đã được xoá.

### UI tokens + Joiner revamp (2.15.0)
- **Joiner page UI:** Refactor `frontend/src/features/joiner/` theo layout “queue” (Joiner ID, EUI64, **PSKD**, timeout countdown, status badge, actions). Style **tonal** (ưu tiên surface + color-mix, hạn chế border), bỏ search/pagination và bỏ header trong card.
- **Joiner data:** Frontend hiển thị **PSKD** từ Joiner Table (`headers["PSKD"]`) thay vì hardcode `"—"`. Nút copy ưu tiên PSKD (nếu có) và fallback copy EUI64.
- **page-header actions:** `page-header` hỗ trợ action **label + style + tone** (text/filled/outlined + default/info/success/warning/danger). **Label auto-show** (không cần `text: true`). Tonal rule: **filled/text không viền**, **outlined giữ viền**. Hover dùng `--color-mix-darken/lighten`.
- **modal tokens:** `modal.style.scss` migrate từ `_variables.scss` sang **CSS tokens** (`_tokens.scss`) để đồng bộ palette. Scrollbar trong `.modal-body` chuyển sang **neutral**: thumb `--on-surface-variant`, track `transparent`.

### Joiner / Modal / Form polish (2.14.0)
- **Joiner feature:** Trang Joiner tách riêng (`src/features/joiner/`); commission modal gộp vào `joiner.component.ts` (không còn component commission-node-modal riêng). **Commissioner** cho phép khi BR **attached** (leader, router hoặc child) — `_canCommission` thay `_isLeader`; alert và disable form khi state khác.
- **modal-dialog:** Render qua **portal** (Lit `render(template, node)` vào `document.body` trong `updated()`; node tạo/remove trong `connectedCallback`/`disconnectedCallback`) để overlay phủ cả sidebar/header. **ModalAction** có `tone` (default|info|success|warning|danger), `style` (text|filled|outlined), `icon` (string = Material Symbol name hoặc TemplateResult), `loading` (spinner thay icon); mặc định Confirm = filled + info, Cancel = text + danger; `className` vẫn dùng khi cần custom. Nút footer cố định chiều cao; icon wrapper `.modal-action-icon` 20×20px, line-height 0 để không nhích khi font load.
- **Shared components:** `spin-loader` (shared/components/spinner): global, props size/thickness; dùng trong modal confirm khi loading. **Form:** `_form.scss` có `.form-radio-row` (horizontal segmented control), `.form-radio`/`.form-radio-pill`, hover + selected (primary bg); timeout trong commission modal dùng radio thay select. **modal.style.scss:** `.modal-alert`, `.modal-alert--warn`, `.modal-info-box`, button tone/style classes; form controls (form-field, form-label, form-control, form-select) và alert/info trong shared form/modal.
- **joiner.style.scss:** Chỉ import nodes + form; toàn bộ style commission chuyển sang _form.scss và modal.style.scss (class chung form-*, modal-*).

### RGBA → RGB hex variables (2.13.0)
- **Nguyên tắc:** Chỉ tạo biến cho **phần RGB** (hex 6 ký tự) trong `_variables.scss`; opacity giữ trong `rgba($var, opacity)`. Không dùng hex 8 ký tự.
- **_variables.scss:** Thêm section **“RGB tokens (hex 6)”**: `$black`, `$slate-850`, `$navy-900`, `$slate-800`, `$slate-900`, `$red-900`, `$red-950`, `$danger-pink`, `$indigo-400`; `$white` gộp vào đây. Cập nhật mọi biến dùng rgba literal → `rgba($var, opacity)` (shadow, brand-border, alert, topology-offline, system-dot-bg, v.v.).
- **Component SCSS:** Thay mọi `rgba(R,G,B,A)` literal bằng `rgba($rgb-var, A)` với `$rgb-var` từ _variables; RGB trùng nhau dùng chung một biến. Giữ **functional naming** cấp component (vd. `$modal-overlay-bg: rgba($navy-900, 0.78)`).
- **Files:** modal, confirm-modal, commission-node-modal, topology-map, _form, joiner-list, settings, waiting-for-backend, sidebar, br-connection-form, openthread-config-form, status, nodes.

### Topology map + Settings polish (2.12.0)
- **Topology:** `topology-map.component.ts` / `topology-map.style.scss` — drawSpotlight (overlay, hole alpha, cyan tint); FEW_NODES_THRESHOLD=10 → manual placement; tabindex + :focus-visible; filter edge khi from/to offline; label rect width động (labelText.length*6.5+20); click stopPropagation + toggle select (selectedNodeId); hover/selected cho .node__label-bg & .node__label; node__body baseline (filter chỉ hover/selected), &--selected .node__inner scale(1.08), fill rgba(accent,0.12), &--selected:hover override.
- **Variables:** `$topology-accent`, `$bg-topology`, `$topology-offline`; semantic actions/danger/input; Connected badge cyan; sidebar dot tất cả connected = cyan.
- **Settings:** bg-app/sidebar/card/input thống nhất; primary/ghost/warn/danger buttons; danger card subtle; System gradient thay PCB image.

### Tài liệu (namorix-thread/documents/) — cập nhật 2025
- **Mục lục:** README.md — sơ đồ kiến trúc, bảng danh mục, luồng đăng ký tóm tắt.
- **Spec chính CoAP:** `coap/device_payload_spec.md` — file canonical (endpoints, CBOR keys, DB 8 bảng, flow). Thay thế nội dung từ thread_node_coap.md + border_router_coap_server.md (đã gộp/xóa).
- **SRP discovery:** `coap/backend_discovery_srp.md` — Thread-Node tìm Backend qua SRP/DNS-SD.
- **Đã xóa:** backend_br_frame_requirements.md, border_router_coap_server.md, coap_client_snippet.md, thread_node_coap.md, entity_model_schema.md. Nội dung liên quan nằm trong device_payload_spec, real_br_integration, backend_discovery_srp, entity_model_specification.

### BR health snapshot — device_health_br upsert (2.11.0)
- **Schema:** Bảng `device_health_br` — **1 row per device** (UNIQUE(device_id)), snapshot; cột: device_id, free_heap, minimum_free_heap, uptime, stack_hwm (text), mle_detach_count, recorded_at. Không lưu history; mỗi lần fetch thì **upsert** row theo device_id.
- **Repository:** `device-health.repository.ts` — `upsertBrHealth(deviceId, freeHeap, minimumFreeHeap, uptime, mleDetachCount, stackHwm?)`; Drizzle `onConflictDoUpdate` trên device_id, set recordedAt = CURRENT_TIMESTAMP khi update.
- **Frame:** CMD_BR_HEALTH (0x17); ACK data = 16-byte prefix (4× uint32 BE) + optional TLV suffix (mục 5.1 doc: task name 0x01, high_water_mark 0x02, stack_size 0x03). Backend hiện chỉ parse 16 byte đầu; stack_hwm có thể bổ sung parser TLV sau.
- **CommunicateManager:** fetchBrHealthAndPersist() gọi upsertBrHealth; poll 60s + trigger khi NOTIFY bit 6 (BIT_BR_HEALTH). getBrDeviceId() từ device_info (is_border_router = 1).

### Topology role-based payload + device_topology_neighbor (2.10.0)
- **Payload:** DeviceTopologyPayload parse theo role. Child gửi keys 0–5 (mac, rloc16, role, parent_rloc16, parent_rssi, parent_lq). Router/Leader gửi 0,1,2,6 (mac, rloc16, role, neighbors array TopologyNeighbor). TopologyNeighbor: 0=rloc16, 1?=rssi, 2?=lq_in, 3?=lq_out, 4=is_child.
- **DB:** Bảng **device_topology_neighbor** (device_id, neighbor_rloc16, rssi, lq_in, lq_out, is_child); migration 0001_add_device_topology_neighbor. upsertTopology: replace list (delete + insert neighbors).
- **Backend:** device.payload.ts TOPOLOGY_NEIGHBOR_KEYS, TopologyNeighbor; device-coap.service parse key 6, parseTopologyNeighbors(); repo TopologyNeighborItem, neighbors trong UpsertTopologyParams.
- **Docs:** device_payload_spec.md (canonical: role-based topology, TopologyNeighbor, otThreadGetParentInfo/otThreadGetNextNeighborInfo), backend_discovery_srp.md, real_br_integration.md (8 bảng). Memory-bank đồng bộ với namorix-thread/documents/.

### Device heartbeat + name raw vs user + frame log filter
- **Heartbeat (GET /device/ping):** Query `?mac=<16-char-hex>`; backend parse (parsePingMac), gọi `updateDeviceLastSeen(mac)`. Cột `device_info.last_seen_at`; repo `updateDeviceLastSeen`, helper `getDeviceStatus(lastSeenAt, now)` → online (30s) / away (5m) / offline. Constants HEARTBEAT_ONLINE_THRESHOLD_MS, HEARTBEAT_OFFLINE_THRESHOLD_MS. Chỉ cập nhật last_seen_at khi ping có mac hợp lệ; register/topology/state không đụng.
- **Device/entity name raw vs user:** `device_info.device_name_raw`, `device_entity.name_raw` (tên từ firmware). User name: `device_name` / `name`; khi register: **raw** luôn ghi đè, **user name** = COALESCE(hiện tại, payload). Slug = (device_name ?? device_name_raw ?? macHex). Repo: upsertDeviceInfo(deviceNameRaw), mergeEntity(nameRaw); service truyền cùng giá trị payload vào raw + name. Frontend `shared/utils/display-name.ts`: `deviceDisplayName()`, `entityDisplayName()` (name ?? name_raw).
- **Frame log:** Ẩn log CMD STATE và ACK (RX + TX) trong `command.manager.ts` — không logFrame khi frame.cmd === STATE hoặc ACK; không log TX khi sendRequest(cmd === STATE); không log TX reply ACK trong replyAck().

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
- **Backend:** CoAP server UDP 5683 (`coap-device.server.ts`), socket **udp6** listen `[::]:5683`. Path **/device/** (ping, register/info, register/entity, update/info, update/entity, update/topology, update/state). **Payload:** mac_address key 0; device_info keys 0–6; **topology role-based**: child key 0–5 (mac, rloc16, role, parent_rloc16, parent_rssi, parent_lq), router/leader key 0,1,2,6 (mac, rloc16, role, neighbors array TopologyNeighbor); entity/state **key 1** = array (ENTITY_KEYS 0–6, STATE_KEYS 0–6). **POST update/topology**: backend parse theo role; lưu device_topology + device_topology_history; router/leader còn lưu **device_topology_neighbor** (replace list). **POST update/state**: key 0 + key 1 (DeviceStateItem). DB: device.repository (upsertTopology nhận neighbors array); device-coap.service parse key 6, TopologyNeighborItem.
- **Payload types (device.payload.ts):** TOPOLOGY_KEYS (0–6, PARENT_RLOC16/PARENT_RSSI/PARENT_LQ, NEIGHBORS 6), TOPOLOGY_NEIGHBOR_KEYS (0–4); TopologyNeighbor, DeviceTopologyPayload; DeviceInfoPayload, DeviceEntityPayload/DeviceEntityItem, DeviceStatePayload/DeviceStateItem.
- **Schema:** device_info, device_topology + **device_topology_neighbor** (device_id, neighbor_rloc16, rssi, lq_in, lq_out, is_child) + history, device_entity, device_entity_state + history. Migration 0001_add_device_topology_neighbor.
- **Registration model:** Thread-Node: POST register/info (chỉ info) → POST update/topology (nếu có) → POST register/entity; GET /device/ping định kỳ, timestamp đổi thì gửi lại register. CoAP fail → SRP re-discovery.
- **Docs:** `documents/coap/device_payload_spec.md` — spec chính (endpoints, CBOR, DB, flow). `documents/coap/backend_discovery_srp.md` — SRP discovery. `documents/architecture/real_br_integration.md` — BR, routing, troubleshooting.

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
- **Vi tri:** Docker assets o **thu muc goc** `namorix-thread/`: `Dockerfile` (multi-target `prod`/`dev`), `compose.dev.yml`, `.dockerignore`.
- **Cau hinh dev:** compose map `4000:4000`, bind source code vao `/app`, target build `dev`.
- **Default BR:** 192.168.31.3:5000. **mDNS trong Docker thuong khong on dinh**; khi Docker nen dung IP. "Tim BR" sau co the quet dai IP (TCP 5000).
- **Chay dev:** `docker compose -f compose.dev.yml up --build`. Doc: `backend/README.docker.md`.

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
- Tao `namorix-thread/documents/`, symlink docs, Memory Bank

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
ROUTER_TABLE, CHILD_TABLE, JOINER_TABLE TX va ACK bi filter ra khoi console log (giu lai trong log file neu co). **CMD STATE và ACK** (RX + TX, gồm reply ACK) cũng ẩn log trong `command.manager.ts` (poll state/ack rất thường xuyên). Giam noise.

### Agent / Terminal (confirmed)
**Khong tu chay lenh terminal** va **khong yeu cau nguoi dung tu chay lenh bang tay**. Agent chi sua code, tao/xoa file, doc code; viec chay build/test/dev do nguoi dung tu quyet dinh va thuc hien.

## Next Steps (theo thu tu uu tien)

1. **Tim BR** *(tuy chon)* — mDNS browse `_thread-frame._tcp` (khi chay tren host) hoac quet dai IP (TCP 5000) khi chay Docker
2. **TCP keepalive** — Da co the bat de phat hien mat ket noi BR nhanh hon (backend TransportTcp)
3. **Security** *(neu can)* — auth WS, HTTPS
4. **Namorix Desktop** *(repo `namorix`, milestone M3)* — khi shell sẵn sàng: align `nmx-thread-app` với spec addon (manifest, lib build, `isInShell`, gateway JWT). Theo dõi `namorix/memory-bank/`; không trùng lặp dài trong memory bank Thread — chỉ tham chiếu `namorix/documents/namorix-desktop-architecture.md`.
5. **Addon registration observability (phase sau):** sau khi register loop dừng ở trạng thái `approved`, cân nhắc thêm heartbeat/ping trạng thái chậm để backend addon có thể tự nhận biết khi host chuyển sang `blocked`/`revoked` (tránh poll dày).

## Files to Watch

- `backend/src/coap/coap-device.server.ts` — CoAP server entry; registerCoapControllers, DeviceCoapController
- `backend/src/coap/coap.type.ts` — CoapRequest, CoapResponse, CoapStatus (CREATED, CHANGED, CONTENT, NOT_FOUND, SERVER_ERROR)
- `backend/src/coap/coap.response.ts` — echoCoapToken, sendCoapResponse(req, res, status, body?, contentFormat?)
- `backend/src/coap/device/device.payload.ts` — DEVICE_INFO_KEYS, TOPOLOGY_KEYS (role-based), TOPOLOGY_NEIGHBOR_KEYS; DeviceInfoPayload, DeviceTopologyPayload, TopologyNeighbor, DeviceEntityPayload/Item, DeviceStatePayload/Item
- `backend/src/coap/device-coap.controller.ts` — GET /device/ping, POST /device/register/info (chỉ info), register/entity, update/info, update/entity, update/topology, update/state; type từng handler đúng payload
- `backend/src/coap/device/device-coap.service.ts` — parse/map payload theo role (topology key 6 neighbors); goi device.repository (upsertDeviceInfo, updateDeviceInfo, upsertTopology + neighbors, mergeEntity, updateEntityDefinition, upsertEntityState)
- `backend/src/database/repositories/device.repository.ts` — resolveDeviceIdByMac, getBrDeviceId, upsertDeviceInfo, updateDeviceLastSeen, getDeviceStatus, upsertTopology (device_topology + device_topology_neighbor replace list), mergeEntity, updateEntityDefinition, upsertEntityState
- `backend/src/database/repositories/device-health.repository.ts` — upsertBrHealth (device_health_br, 1 row per device, onConflictDoUpdate)
- `backend/src/coap/device-coap.controller.ts` — ping() parse query mac (parsePingMac), updateDeviceLastSeen
- `frontend/src/shared/utils/display-name.ts` — deviceDisplayName(), entityDisplayName() (name ?? name_raw)
- `backend/src/utils/ipv6.util.ts` — getPreferredBackendIPv6(), getBackendAddresses()
- `documents/coap/device_payload_spec.md` — spec chính CoAP/CBOR/DB/flow. `documents/coap/backend_discovery_srp.md` — SRP discovery. `documents/architecture/real_br_integration.md` — BR, routing, troubleshooting
- `backend/src/communicate/communicate.manager.ts` — pullState(), SRP register khi leader
- `backend/src/communicate/command.manager.ts` — frame handling, sendSrpRegister, replyAck (IP_ADDR)
- `frontend/src/features/nodes/nodes.component.ts` — Router/Child table, leader badge
- `frontend/src/features/joiner/joiner.component.ts` — Joiner Table, commission modal (form + modal-dialog), _canCommission (leader/router/child)
- `frontend/src/shared/components/modal/modal.component.ts` — portal render, ModalAction tone/style/icon/loading
- `frontend/src/shared/components/spinner/spinner.component.ts` — spin-loader (global)
- `../../namorix/core/frontend/src/styles/base/_form.scss` — nmx-form-* (page, card, field, control, actions, radio, control-icon, with-icon); `_button.scss` — nmx-btn*, nmx-form-btn*
- `frontend/src/core/AppBaseElement.ts` — app base (extends NmxStoreElement, getStore → store)
- `frontend/src/app.ts` — NmxThreadApp (nmx-thread-app), extends AppBaseElement
- `frontend/index.html` — mount `<nmx-main>`; main.ts → nmx-app-container → nmx-thread-app
- `frontend/vite.config.ts`, `frontend/vite.addon.config.ts` — `siblingReposRoot` + alias `@namorix/core` / `@namorix/assets`; `frontend/tsconfig.json` — `paths` khớp cùng layout workspace
- `frontend/src/core/store/slices/appbar.slice.ts` — setAppBar, clearAppBar
- `frontend/src/core/components/appbar/` — page-header (extends AppLitElement)
- `../../namorix/core/frontend` — toast (nmx-toast, initToast, showToast), createWsBridge, onceWithTimeout, wsConnection slice; `documents/namorix-core-usage.md` — hướng dẫn dùng core
- `frontend/src/core/components/modal/` — modal-dialog (confirm-modal đã xóa; dùng modal-dialog + props)
- `frontend/src/shared/components/sidebar/` — nav, Settings sub-items icons
- `frontend/src/features/settings/components/system-tab/` — action cards, danger divider
- `frontend/src/features/settings/components/openthread-config-form/` — ot-card, footer layout
- `frontend/src/features/topology/topology-map.component.ts` — layout, drawSpotlight, select, label rect
- `frontend/src/features/topology/topology-map.style.scss` — node body/label hover & selected, topology-accent
- `frontend/src/shared/styles/_variables.scss` — bg-*, topology-accent, action/danger/input tokens
- `shared/src/events.ts`, `shared/src/types.ts` — thêm field/event cập nhật cả hai
- `backend/src/websocket/websocket.server.ts` — chỉ wire handlers; logic trong handler/
- `backend/src/websocket/handler/*.ts` — ConfigHandler, BrHandler, DeviceHandler, ThreadHandler, CommissionerHandler, SrpHandler; thêm event mới = thêm method + @WsOn(EVENTS.xxx)
- `backend/src/websocket/ws.type.ts`, `ws.decorator.ts` — getWsRoutes(ctor), @WsOn(event)
- `memory-bank/progress.md` — cập nhật khi hoàn thành task
