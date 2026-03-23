# Namorix Core — Hướng dẫn sử dụng

Tài liệu mô tả cách plugin/app (ví dụ Dashboard frontend) tích hợp và sử dụng **namorix-core** — thư viện dùng chung cho store, i18n, WebSocket, Toast và UI primitives.

## Tổng quan

- **Vị trí:** Layout phổ biến — sibling repo **`namorix-core`** (npm workspace: package `@namorix/core` trong `namorix-core/frontend`, `@namorix/core-shared` trong `namorix-core/shared`). `package.json` dùng `file:../../../namorix-core/frontend`. Vite alias `@namorix/core` → `namorix-core/frontend/src`, `@namorix/core-shared` → `namorix-core/shared/src` (xem `vite.config.ts`). *(Legacy: `dashboard/vendor/namorix-core` — đổi path tương ứng sang `…/frontend/src`.)*
- **Build:** Khi chưa build `dist/`, Vite alias trỏ thẳng vào source; app import SCSS và TS từ core.

## 1. Store (Redux)

### Tạo store plugin

Store được tạo bằng `createPluginStore` từ core. Core đã gắn sẵn reducer `i18n`; plugin khai báo các reducer còn lại.

```ts
import { createPluginStore } from "@namorix/core/store";
import { wsConnectionReducer } from "@namorix/core/store";
import { toastReducer } from "@namorix/core/store";
// ... các slice của plugin

const store = createPluginStore({
  reducer: {
    wsConnection: wsConnectionReducer,
    toast: toastReducer,
    config: configReducer,
    // ...
  },
  preloadedState: undefined, // optional
});
```

- **BaseRootState:** Core định nghĩa `BaseRootState` có ít nhất `i18n`. Type state gốc của plugin nên extend và khai báo đủ key trong `reducer`.

### Slice dùng chung từ core

| Export | Mô tả |
|--------|--------|
| `wsConnectionReducer`, `wsConnectionActions` | Trạng thái WS: `connected`, `disconnected`, `connectError` |
| `toastReducer`, `toastActions`, `Toast`, `ToastType` | Slice toast: `addToast`, `removeToast` |
| `i18n` (reducer gắn sẵn trong store) | Locale; set qua `setLocale` từ `@namorix/core/store` |

## 2. i18n

### Khởi tạo

Gọi một lần khi khởi động app (ví dụ trước khi mount root component):

```ts
import { initI18n } from "@namorix/core/i18n";
import { store } from "@/store/store";
import en from "@/core/i18n/locales/en.json";
import vi from "@/core/i18n/locales/vi.json";

const { t } = initI18n({
  store,
  dicts: { en, vi },
  fallbackLocale: "en",
});
```

- **Locale:** Mặc định lấy từ state `i18n.locale`. Backend/config có thể gửi locale (ví dụ qua WebSocket) và plugin dispatch `setLocale(normalizeLocale(locale))` từ `@namorix/core/store` / `@namorix/core/i18n`. **Trong Namorix Desktop:** đồng bộ với locale shell — xem **§5 Shell API** (`onLocaleChange` / `ShellWindowEvent.LocaleChanged`).

### Sử dụng trong component

- Export `t` từ một module (ví dụ `core/i18n/i18n.ts`) re-export kết quả `initI18n`, hoặc truyền qua context.
- Trong template: `t("key")`, `t("key", { param: value })`.

## 3. WebSocket (createWsBridge)

Core cung cấp **createWsBridge** — builder khởi tạo socket, lifecycle và đăng ký domain events. Plugin chỉ cấu hình callbacks và mapping event → dispatch.

### Cấu hình và start

```ts
import { createWsBridge } from "@namorix/core/ws";
import { wsConnectionActions } from "@namorix/core/store";

const bridge = createWsBridge<RootState>({
  store,
  url: WS_URL, // optional, mặc định window.location.origin
  options: {}, // optional socket.io ManagerOptions & SocketOptions
});

bridge
  .onConnect((socket, store) => {
    store.dispatch(wsConnectionActions.connected());
    socket.emit("config:get");
  })
  .onDisconnect((_socket, store) => {
    store.dispatch(wsConnectionActions.disconnected());
  })
  .onConnectError((_socket, store, err) => {
    store.dispatch(wsConnectionActions.connectError(err.message));
  })
  .on("config:current", (store, data) => {
    store.dispatch(configActions.received(data));
  });
  // .on("event-name", (store, data) => { ... })

const socket = bridge.start();
```

- **start():** Tạo socket và bắt đầu kết nối; trả về instance `Socket`. Gọi một lần (ví dụ trong `connectedCallback` của root app).
- **stop(opts?: { close?: boolean }):** Hủy listener và tùy chọn đóng socket. Dùng khi unmount hoặc cleanup (vd. hot reload).

### Lấy socket để emit / onceWithTimeout

```ts
const s = bridge.getSocket();
if (s) s.emit("event", payload);
```

### onceWithTimeout

Helper emit một event rồi chờ response với timeout (generic, không phụ thuộc domain):

```ts
import { onceWithTimeout } from "@namorix/core/ws";
import { getSocket } from "@/core/ws/ws-bridge";

const socket = getSocket();
const result = await onceWithTimeout<{ success: boolean }>(
  socket,
  "br:test:result",
  6000,
  () => socket?.emit("br:test", { host, port })
);
```

## 4. Toast (dual mode)

Core cung cấp Toast dạng **dual mode**: chạy **standalone** (plugin tự render toast) hoặc chạy **trong desktop** (plugin gửi event lên host, host render toast).

### Khởi tạo (plugin standalone)

Gọi một lần khi khởi động:

```ts
import { initToast } from "@namorix/core";
import { store } from "@/store/store";
import { t } from "@/core/i18n/i18n";

initToast({
  store,
  selectToasts: (s) => s.toast.toasts,
  getTitle: (type) => t(`toast.title.${type}`), // optional, i18n cho title theo type
});
```

### Mount component toast (standalone)

Trong cây DOM chính (ví dụ cùng cấp với app container):

```html
<nmx-app-container ...></nmx-app-container>
<nmx-toast></nmx-toast>
```

Import side-effect để đăng ký custom element:

```ts
import "@namorix/core/components/toast";
```

### Gọi showToast

Ở bất kỳ đâu trong plugin:

```ts
import { showToast } from "@namorix/core";

showToast("success", "Đã lưu cấu hình");
showToast("error", "Kết nối thất bại", 5000);
```

- **Standalone:** Core dispatch `toastActions.addToast` vào store đã truyền vào `initToast`; `<nmx-toast>` đọc store và render.
- **Trong desktop (`window.nmxCore === true`):** Core không dispatch mà gửi `CustomEvent("nmx-action", { detail: { action: "show-toast", payload: { type, message, duration } } })` lên `window`; host (desktop) lắng nghe và hiển thị toast.

Plugin không cần phân biệt hai mode — chỉ gọi `showToast()` từ `@namorix/core`.

## 5. Shell API (`@namorix/core/shell-api`)

Dùng khi plugin chạy **trong Namorix Desktop** (có `window.nmxCore`) hoặc cần **một nguồn chuỗi** cho trạng thái runtime / tên sự kiện shell (tránh literal rải rác giữa host và plugin).

### Constants và types

- Import: `PluginRuntimeStatus`, `ShellWindowEvent`, `SHELL_APP_EMIT_PREFIX` từ `@namorix/core/shell-api`.
- `ShellWindowEvent` gồm các tên `CustomEvent` shell (ví dụ locale: `LocaleChanged` → `nmx-shell-locale-changed` — đúng với host phát sự kiện).
- Type `NmxCoreApi` mô tả API inject trên `window.nmxCore` (token, user, toast, title/cửa sổ, `emit`/`on`, v.v.).

### Đồng bộ locale với shell

- **Ưu tiên:** `window.nmxCore?.onLocaleChange?.((locale) => { store.dispatch(setLocale(normalizeLocale(locale))); })` — host trả về hàm hủy đăng ký.
- **Fallback:** `window.addEventListener(ShellWindowEvent.LocaleChanged, handler)` / `removeEventListener` khi không có `onLocaleChange`.

### Plugin backend (HTTP qua gateway Desktop)

Request từ browser tới plugin đi qua gateway Desktop; sau `requireAuth`, header JWT được forward với tên **`Authorization: Bearer <token>`**. API plugin nên verify JWT từ `req.headers.authorization` (chuẩn), không phụ thuộc `x-forwarded-authorization`.

## 6. Base elements (Lit)

- **NmxBaseElement:** Chỉ font + light DOM (`createRenderRoot() { return this }`). Dùng cho component không cần store.
- **NmxStoreElement:** Kế thừa NmxBaseElement; abstract `getStore()`, optional locale subscription (`static useLocale`), `createStoreSlice(selector, equals?)` để subscribe state. Dùng khi component cần Redux hoặc locale.
- **AppBaseElement (trong plugin):** Extends NmxStoreElement, implement `getStore() { return store }` trỏ tới store của plugin.

Component cần store/locale nên extend AppBaseElement (hoặc NmxStoreElement nếu tự inject store).

## 7. Styles và form/button

Core cung cấp tokens và base styles; plugin import trong entry SCSS:

```scss
@use "@namorix/core/styles/_tokens.scss" as *;
@use "@namorix/core/styles/nmx-base.scss" as *;
```

- **Tokens:** Biến CSS `--nmx-*` (và các biến legacy được map từ tokens).
- **Form:** Class `.nmx-form-*` (page, card, field, label, control, actions, error-message, info-box, radio row, …). Xem `vendor/namorix-core/src/styles/base/_form.scss`.
- **Button:** `.nmx-btn`, `.nmx-btn-filled`, `.nmx-btn-icon`, `.nmx-form-btn`, `.nmx-form-btn--primary`, `.nmx-form-btn--ghost`. Xem `vendor/namorix-core/src/styles/base/_button.scss`.

Dùng đúng class `nmx-form-*` / `nmx-btn*` để đồng bộ với core; không dùng lại class cũ không prefix (đã bỏ).

## 8. Sidebar và layout

- **nmx-sidebar:** Component core, nhận props (brand, logo, navGroups, currentPage) và emit `navigate` với page id. Plugin (vd. NmxThreadApp) lắng nghe và cập nhật nội dung theo `currentPage`.
- **nmx-app-container:** Layout chính; nhận slot (vd. `.slotHtml`) để render nội dung app.

## Tóm tắt import thường dùng

| Nhu cầu | Import |
|--------|--------|
| Store | `createPluginStore`, `wsConnectionReducer`, `toastReducer`, `setLocale` từ `@namorix/core/store` |
| i18n | `initI18n`, `normalizeLocale` từ `@namorix/core/i18n` |
| WebSocket | `createWsBridge`, `onceWithTimeout` từ `@namorix/core/ws` |
| Toast | `initToast`, `showToast` từ `@namorix/core`; component `@namorix/core/components/toast` |
| Shell (Desktop) | `PluginRuntimeStatus`, `ShellWindowEvent`, `SHELL_APP_EMIT_PREFIX`, type `NmxCoreApi` từ `@namorix/core/shell-api` |
| Base element | Từ package core (NmxBaseElement, NmxStoreElement) |
| Styles | `@namorix/core/styles/_tokens.scss`, `@namorix/core/styles/nmx-base.scss` |
