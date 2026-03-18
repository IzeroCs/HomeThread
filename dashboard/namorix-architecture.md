# NAMORIX
## System Architecture Specification
**Final — v1.2**

| Thông tin | Chi tiết |
|:---|:---|
| Phiên bản | v1.2 — Final |
| Kiến trúc | Micro-services / Plugin-based |
| Frontend | Lit Web Components (Light DOM) |
| Styling | Vanilla CSS + CSS Variables (No Tailwind) |
| Database | PostgreSQL 15+ Multi-Schema |
| Real-time | Redis Streams + Pub/Sub + Socket.io |
| Auth | Stateless JWT + Redis Revocation |
| DevOps | Docker & Docker Compose |
| License | GNU GPL v3 |

---

## 1. Kiến trúc Tổng thể

Namorix được vận hành như một thực thể sống — các bộ phận tách biệt nhưng chia sẻ dòng máu chung (Data & Styles). Hệ thống gồm 3 tầng chính:

| Tầng | Vai trò | Công nghệ |
|:---|:---|:---|
| Core (The Brain) | Điều phối Auth, Layout Shell, quản lý vòng đời Plugin | Node.js + Lit (Shadow DOM) |
| Plugins (The Limbs) | Logic nghiệp vụ độc lập, mỗi Plugin là 1 Docker Container | Node.js + Lit (Light DOM) |
| Infrastructure (The Organs) | Message bus, persistence, gateway | Redis + PostgreSQL + Nginx |

### 1.1 Nguyên tắc Thiết kế

- **Isolation-first** — Plugin không được gọi trực tiếp sang Plugin khác, phải đi qua Core hoặc Redis.
- **Zero-trust internal** — Mọi request nội bộ đều phải mang JWT hợp lệ, kể cả Container-to-Container.
- **Graceful degradation** — Core vẫn hoạt động khi một Plugin Container down; Plugin đó được đánh dấu `unavailable`.
- **Schema isolation** — Mỗi Plugin sở hữu schema riêng trong PostgreSQL, không truy cập chéo schema.

---

## 2. Frontend: Web Components Architecture

### 2.1 Core Host (Shadow DOM)

Core sử dụng Shadow DOM để bảo vệ khung ứng dụng (Sidebar, Header, Shell). Đây là vùng bất khả xâm phạm mà Plugin không thể ghi đè.

| Thành phần | Mô tả |
|:---|:---|
| `<nmx-shell>` | Root host element, quản lý layout tổng thể và Plugin registry |
| `<nmx-sidebar>` | Navigation, hiển thị Plugin đang active |
| `<nmx-header>` | Topbar, user info, global notifications |
| `<slot name="plugin-main">` | Điểm mount cho Plugin UI chính |
| `<slot name="plugin-panel">` | Điểm mount cho Panel phụ (sidebar của Plugin) |

### 2.2 Plugin Frontend (Light DOM)

Plugin override `createRenderRoot()` để render trực tiếp vào DOM chính, cho phép thừa kế CSS Variables từ Core.

> **Bắt buộc** ghi đè `createRenderRoot() { return this; }` trong mọi Plugin element để disable Shadow DOM.

#### CSS Variable System (Core defines — Plugin consumes)

| Variable | Giá trị mặc định | Mục đích |
|:---|:---|:---|
| `--nmx-color-primary` | `#1A2B4A` | Màu chủ đạo |
| `--nmx-color-accent` | `#2E86AB` | Màu nhấn, CTA |
| `--nmx-color-surface` | `#FFFFFF` | Nền card, panel |
| `--nmx-color-bg` | `#F0F4F8` | Nền trang |
| `--nmx-color-text` | `#1A1A1A` | Văn bản chính |
| `--nmx-color-muted` | `#6B7280` | Văn bản phụ |
| `--nmx-color-border` | `#E0E6ED` | Đường viền |
| `--nmx-color-danger` | `#C0392B` | Lỗi, cảnh báo nguy hiểm |
| `--nmx-color-success` | `#27AE60` | Trạng thái thành công |
| `--nmx-radius-sm` | `4px` | Bo góc nhỏ |
| `--nmx-radius-md` | `8px` | Bo góc trung bình |
| `--nmx-radius-lg` | `16px` | Bo góc lớn (card) |
| `--nmx-spacing-unit` | `8px` | Đơn vị spacing cơ bản |
| `--nmx-font-sans` | `Arial, sans-serif` | Font chính |
| `--nmx-font-mono` | `Courier New, monospace` | Font code |
| `--nmx-shadow-sm` | `0 1px 3px rgba(0,0,0,0.08)` | Bóng nhỏ |
| `--nmx-shadow-md` | `0 4px 12px rgba(0,0,0,0.12)` | Bóng trung bình |

### 2.3 CSS Naming Convention (BEM + Prefix)

Mọi class của Plugin phải tuân thủ convention sau để tránh xung đột:

| Pattern | Ví dụ | Giải thích |
|:---|:---|:---|
| `nmx-{pid}-{block}` | `nmx-th-card` | Block chính của component |
| `nmx-{pid}-{block}__element` | `nmx-th-card__title` | Element bên trong block |
| `nmx-{pid}-{block}--modifier` | `nmx-th-card--active` | Trạng thái / biến thể |
| `nmx-{pid}-{block}__el--mod` | `nmx-th-card__title--muted` | Element + modifier kết hợp |

Plugin ID (`pid`) được quy định:
- `th` — thread-service
- `fi` — files-service
- `[2 ký tự]` — các Plugin mới phải đăng ký với Core team

---

## 3. Plugin Loader & Manifest

Core load Plugin động thông qua `manifest.json` được phục vụ bởi mỗi Plugin Container.

### 3.1 Manifest Schema

| Field | Type | Bắt buộc | Mô tả |
|:---|:---|:---|:---|
| `id` | string | Yes | Unique identifier, dùng làm prefix CSS và Redis channel |
| `version` | string (semver) | Yes | Phiên bản hiện tại, Core dùng để cache-bust assets |
| `entry` | string (path) | Yes | Đường dẫn tới file JS bundle của Plugin |
| `styles` | string (path) | No | Đường dẫn tới CSS bundle (nếu tách riêng) |
| `health` | string (path) | Yes | Endpoint kiểm tra trạng thái, Core poll mỗi 30s |
| `permissions` | string[] | Yes | Danh sách schema DB Plugin được phép truy cập |
| `slots` | string[] | Yes | Tên các slot Core cần cung cấp: `plugin-main`, `plugin-panel` |
| `displayName` | string | Yes | Tên hiển thị trên Sidebar |
| `icon` | string (SVG path) | No | Icon SVG cho Sidebar |

### 3.2 Plugin Lifecycle

| Trạng thái | Mô tả | Hành động của Core |
|:---|:---|:---|
| `DISCOVERING` | Core đang fetch manifest.json | Hiển thị spinner trên Sidebar |
| `LOADING` | Core đang tải JS/CSS bundle | Disabled Plugin slot |
| `READY` | Plugin loaded và sẵn sàng | Kích hoạt Sidebar item |
| `UNAVAILABLE` | Health check thất bại >= 3 lần | Ẩn Plugin, hiện thông báo lỗi |
| `UPDATING` | version trong manifest thay đổi | Reload bundle, giữ UI hiện tại đến khi xong |

---

## 4. Hệ thống Giao tiếp

### 4.1 Redis Streams (Critical Messages)

Dùng cho các message quan trọng, không thể mất — thay thế Pub/Sub thuần cho luồng điều khiển.

| Stream Key | Hướng | Nội dung | Consumer Group |
|:---|:---|:---|:---|
| `nmx:ctrl:{plugin_id}` | Core → Plugin | Lệnh điều khiển: start, stop, reload config | `plugin-{id}-workers` |
| `nmx:resp:{plugin_id}` | Plugin → Core | Phản hồi lệnh, trạng thái thực thi | `core-listeners` |
| `nmx:events` | Plugin → Core → All | Domain events: device.joined, file.uploaded... | `core-event-router` |

> **Lưu ý:** Dùng `XREADGROUP` với ACK. Nếu Plugin restart trước khi ACK, message sẽ được re-deliver sau timeout. Đặt `MAXLEN ~ 10000` để tránh stream phình to.

### 4.2 Redis Pub/Sub (Non-critical / Broadcast)

Dùng cho log, notifications và real-time UI updates — fire-and-forget là chấp nhận được.

| Channel | Publisher | Subscriber | Mục đích |
|:---|:---|:---|:---|
| `nmx:logs` | Tất cả Plugin | Core Log Aggregator | Log tập trung |
| `nmx:notify:{user_id}` | Core | Socket.io Gateway | Push notification tới user |
| `nmx:presence` | Core | Tất cả Plugin | Thông báo Plugin join/leave |

### 4.3 Frontend Event Bus

Plugin giao tiếp với Core qua CustomEvents trên window, có `instanceId` để tránh xung đột khi nhiều instance chạy song song.

```javascript
// Plugin phát event lên Core
window.dispatchEvent(new CustomEvent('nmx-action', {
  detail: {
    pluginId: 'thread-service',   // Plugin ID
    instanceId: this._instanceId, // UUID duy nhất cho mỗi instance
    action: 'navigate',
    payload: { route: '/devices' }
  }
}));

// Core lắng nghe và filter theo pluginId
window.addEventListener('nmx-action', (e) => {
  if (e.detail.pluginId !== this.activePluginId) return;
  this._handlePluginAction(e.detail);
});
```

| Event Name | Hướng | Payload chính | Mô tả |
|:---|:---|:---|:---|
| `nmx-action` | Plugin → Core | pluginId, instanceId, action, payload | Yêu cầu Core thực hiện hành động |
| `nmx-ready` | Plugin → Core | pluginId, version | Plugin đã mounted và sẵn sàng |
| `nmx-error` | Plugin → Core | pluginId, code, message | Plugin báo lỗi để Core xử lý |
| `nmx-core-event` | Core → Plugin | type, data | Core broadcast event tới Plugin |

---

## 5. Database: PostgreSQL Multi-Schema

### 5.1 Schema Layout

Một PostgreSQL instance, cách ly nghiêm ngặt bằng schema. Plugin chỉ được kết nối tới schema của mình và schema `public`.

| Schema | Owner | Nội dung chính | Được truy cập bởi |
|:---|:---|:---|:---|
| `public` | core | users, sessions, plugin_registry, system_config | Core only |
| `plugin_thread` | thread-service | devices, zigbee_topology, device_events, groups | thread-service only |
| `plugin_files` | files-service | files, folders, file_permissions, file_versions | files-service only |

> **Rule:** Mỗi Plugin kết nối với PostgreSQL bằng một DB user riêng biệt (ví dụ: `nmx_thread`). User này chỉ có `GRANT` trên schema của Plugin và quyền `SELECT` trên bảng `users` trong schema `public`.

### 5.2 Connection String Convention

```bash
# Core
DATABASE_URL=postgres://nmx_core:${DB_PASS}@postgres:5432/namorix

# thread-service (chỉ thấy schema plugin_thread + public.users)
DATABASE_URL=postgres://nmx_thread:${DB_PASS}@postgres:5432/namorix?options=-c search_path=plugin_thread,public
```

### 5.3 Migration Strategy

- Core chạy migration cho schema `public` khi khởi động.
- Mỗi Plugin chạy migration cho schema của mình khi Container khởi động.
- Dùng tool chuyên dụng: `node-postgres migrate` hoặc Flyway.
- **KHÔNG** dùng ORM auto-sync (`Sequelize sync: true`, `TypeORM synchronize: true`) trong production.

---

## 6. Auth System

### 6.1 JWT Flow

| Bước | Thực thể | Hành động |
|:---|:---|:---|
| 1 | Client | Gửi credentials tới Core `/auth/login` |
| 2 | Core | Verify credentials, ký Access Token (TTL: 15 phút) + Refresh Token (TTL: 7 ngày) |
| 3 | Core → Client | Trả về `{ accessToken, refreshToken }` |
| 4 | Client → Plugin | Đính kèm accessToken vào mọi request: `Authorization: Bearer <token>` |
| 5 | Plugin | Verify chữ ký JWT bằng `NAMORIX_SECRET` — **không** gọi lại Core |
| 6 | Plugin | Extract `{ userId, roles, pluginPermissions }` từ payload |
| 7 | Client | Khi accessToken hết hạn, gọi Core `/auth/refresh` với refreshToken |

### 6.2 Token Revocation (Redis)

Để xử lý logout khẩn cấp hoặc Plugin bị compromise, dùng Redis làm blacklist:

```javascript
// Khi user logout hoặc admin revoke token
await redis.set(
  `nmx:revoked:${jti}`,
  '1',
  'EX',
  Math.floor((exp - Date.now() / 1000))
);

// Plugin middleware kiểm tra blacklist
const isRevoked = await redis.get(`nmx:revoked:${jti}`);
if (isRevoked) return res.status(401).json({ error: 'token_revoked' });
```

> **Performance:** Redis GET O(1) — overhead < 0.5ms. Plugin chỉ cần một Redis client pool nhỏ (5 connections) để check revocation.

### 6.3 JWT Payload Structure

| Field | Type | Mô tả |
|:---|:---|:---|
| `jti` | UUID v4 | Unique token ID — dùng cho revocation |
| `sub` | string | User ID |
| `iat` | Unix timestamp | Thời điểm phát hành |
| `exp` | Unix timestamp | Thời điểm hết hạn |
| `roles` | string[] | Roles của user: admin, user, viewer |
| `plugins` | object | Map `plugin_id → permission_level` (read/write/admin) |

---

## 7. Docker & Network Topology

### 7.1 Directory Structure

```
namorix/
├── .env                          # Secrets: NAMORIX_SECRET, DB_PASS, REDIS_PASS
├── docker-compose.yml
├── nginx/
│   └── nginx.conf
├── core/
│   ├── Dockerfile
│   ├── backend/                  # Node.js: Auth, Plugin Manager, Event Router
│   └── frontend/                 # Lit Shell: Shadow DOM + CSS Variables
└── plugins/
    ├── thread-service/
    │   ├── Dockerfile
    │   ├── backend/              # Node.js: Zigbee handler, DB queries
    │   └── frontend/             # Lit: Light DOM, nmx-th-* classes
    └── files-service/
        ├── Dockerfile
        ├── backend/              # Node.js: File storage, permissions
        └── frontend/             # Lit: Light DOM, nmx-fi-* classes
```

### 7.2 Docker Networks

| Network | Type | Members | Mục đích |
|:---|:---|:---|:---|
| `nmx-public` | bridge | nginx, core | Expose ra internet |
| `nmx-internal` | bridge (internal: true) | core, thread-service, files-service, redis, postgres | Internal service communication |
| `nmx-data` | bridge (internal: true) | core, redis, postgres | Database & cache — Plugin không có mặt |

> **Security:** Plugin kết nối trực tiếp tới PostgreSQL qua `nmx-internal` với DB user có quyền hạn chế. Core không làm DB proxy.

### 7.3 Nginx Routing Rules

| Path Pattern | Upstream | Ghi chú |
|:---|:---|:---|
| `/` | `core:3000` | Serve HTML shell |
| `/api/auth/*` | `core:3000` | Auth endpoints |
| `/api/plugins/*` | `core:3000` | Plugin registry API |
| `/api/thread/*` | `thread-service:3001` | Nginx forward JWT |
| `/api/files/*` | `files-service:3002` | Nginx forward JWT |
| `/ws` | `core:3000` | WebSocket upgrade cho Socket.io |
| `/plugins/thread/assets/*` | `thread-service:3001` | Static assets |
| `/plugins/files/assets/*` | `files-service:3002` | Static assets |

---

## 8. CSS & Component Architecture

Phần này là hợp đồng bắt buộc giữa Core và mọi Plugin developer.

### 8.1 Shared Folder Structure

Trong giai đoạn dev, Core styles và Core components được đặt trong `shared/` của service để dễ tách sang `namorix-core` sau này. Khi tách ra chỉ cần copy 2 folder này sang Core và đổi đường dẫn import.

```
dashboard/
└── shared/
    ├── core-styles/              # Sau này → namorix-core/frontend/styles/
    │   ├── _tokens.scss          # --nmx-* variables
    │   ├── _mixins.scss          # Mixins dùng nội bộ khi viết base
    │   ├── _reset.scss
    │   ├── _typography.scss
    │   ├── _components.scss      # button, card, input, table, list...
    │   └── nmx-base.scss         # Entry — @import tất cả ở trên
    └── core-components/          # Sau này → namorix-core/frontend/components/
        ├── src/
        │   ├── nmx-sidebar.ts
        │   ├── nmx-topnav.ts
        │   ├── nmx-toast-host.ts
        │   ├── nmx-modal-host.ts
        │   └── index.ts
        ├── dist/
        │   └── nmx-core-components.js  # Build output
        └── tsconfig.json
```

### 8.2 CSS Layer Architecture

| Layer | File | Owner | Mô tả |
|:---|:---|:---|:---|
| 0 — Design Tokens | `_tokens.scss` → `tokens.css` | Core | Định nghĩa toàn bộ `--nmx-*` variables. Không ai được override. |
| 1 — Base Stylesheet | `nmx-base.scss` → `nmx-base.css` | Core | Reset, typography, button, card, input, table... Dùng chung toàn hệ thống. |
| 2 — Plugin Stylesheet | `nmx-{pid}.scss` | Plugin | Chỉ chứa class `nmx-{pid}-*` và token đặc thù `--nmx-{pid}-*`. |

> **Mixin** chỉ tồn tại ở dev time trong `_mixins.scss`. Sau khi build ra `nmx-base.css`, mixin được inline thành utility class — service dùng class trực tiếp, không phụ thuộc SCSS của Core.

### 8.3 Service Entry Point

Mỗi service có một file entry duy nhất import theo đúng thứ tự:

```scss
// app.style.scss (entry point của service)
@import '../../shared/core-styles/nmx-base';   // Layer 0 + 1

// Token + component đặc thù của service
@import './nmx-th';
```

Trong `nmx-th.scss`:

```scss
// Token đặc thù — tham chiếu lại token Core
:root {
  --nmx-th-signal-strong: var(--nmx-color-success);
  --nmx-th-signal-weak: #E67E22;
  --nmx-th-signal-lost: var(--nmx-color-danger);
}

// Components đặc thù
.nmx-th-device-card { ... }
.nmx-th-topology-map { ... }
```

### 8.4 Core Components

Core Components là Lit Web Components viết bằng TypeScript, build ra một file JS duy nhất. Service load vào là dùng được các element như HTML tag thông thường.

| Component | Mô tả | Khi nào mount |
|:---|:---|:---|
| `<nmx-sidebar>` | Navigation sidebar | Luôn luôn |
| `<nmx-topnav>` | Top navigation bar | Luôn luôn |
| `<nmx-toast-host>` | Container render toast | Chỉ khi chạy độc lập |
| `<nmx-modal-host>` | Container render modal | Chỉ khi chạy độc lập |

Khi chạy trong Core, `toast-host` và `modal-host` đã có sẵn ở tầng desktop — service chỉ cần bắn event, không mount thêm.

### 8.5 Load theo môi trường

Service detect môi trường qua biến `CORE_URL`:

```html
<!-- index.html -->

<!-- Styles -->
<link rel="stylesheet" href="{CORE_URL}/assets/core/tokens.css">
<link rel="stylesheet" href="{CORE_URL}/assets/core/nmx-base.css">
<link rel="stylesheet" href="./styles/nmx-th.css">

<!-- Core Components -->
<script src="{CORE_URL}/assets/core/nmx-core-components.js"></script>

<!-- Layout — luôn có -->
<nmx-sidebar></nmx-sidebar>
<nmx-topnav></nmx-topnav>

<!-- Toast/Modal — chỉ mount khi chạy độc lập -->
<nmx-toast-host></nmx-toast-host>
<nmx-modal-host></nmx-modal-host>
```

| Môi trường | `CORE_URL` |
|:---|:---|
| Dev độc lập | `http://localhost:3000` |
| Dev full stack | `http://core:3000` |
| Production | Nginx tự xử lý — không cần CORE_URL |

### 8.6 Toast & Modal — Dual Mode

```ts
function showToast(message: string, type: string) {
  if (window.nmxCore) {
    // Chạy trong Core — gửi lên Core render ở tầng desktop
    window.dispatchEvent(new CustomEvent('nmx-action', {
      detail: { action: 'show-toast', payload: { message, type } }
    }));
  } else {
    // Chạy độc lập — nmx-toast-host tự render
    document.querySelector('nmx-toast-host').show(message, type);
  }
}
```

### 8.7 Quy tắc Plugin được và không được tự quyết

| Thuộc tính CSS | Tự quyết? | Quy tắc |
|:---|:---|:---|
| `layout` (flexbox, grid) | **YES** | Tự do — cấu trúc nội bộ component |
| `width`, `height` | **YES** | Tự do — kích thước component |
| `margin`, `padding`, `gap` | **YES** | Khuyến khích dùng bội số `var(--nmx-spacing-unit)` |
| `position`, `z-index` | **YES** | Không được vượt z-index của Core Shell |
| `color`, `background-color` | **NO** | Bắt buộc dùng `var(--nmx-color-*)` |
| `border-radius` | **NO** | Bắt buộc dùng `var(--nmx-radius-*)` |
| `font-size`, `font-weight` | **NO** | Bắt buộc dùng `var(--nmx-font-*)` |
| `box-shadow` | **NO** | Bắt buộc dùng `var(--nmx-shadow-*)` |
| `border-color` | **NO** | Bắt buộc dùng `var(--nmx-color-border)` |
| `transition`, `animation` | **YES (giới hạn)** | Chỉ animate `transform` và `opacity` |

### 8.8 Ví dụ đúng / sai

```css
/* ✅ ĐÚNG */
.nmx-th-card {
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: calc(var(--nmx-spacing-unit) * 2);
  padding: var(--nmx-spacing-unit);
  background: var(--nmx-color-surface);
  border-radius: var(--nmx-radius-md);
  color: var(--nmx-color-text);
  box-shadow: var(--nmx-shadow-sm);
}

/* ❌ SAI — hardcode, dark mode sẽ bị vỡ */
.nmx-th-card {
  background: #ffffff;
  border-radius: 8px;
  color: #1a1a1a;
}
```

### 8.9 Utility Classes từ nmx-base.css

| Class | Tương đương CSS | Mục đích |
|:---|:---|:---|
| `.nmx-surface` | `background: var(--nmx-color-surface)` | Nền card, panel |
| `.nmx-text-muted` | `color: var(--nmx-color-muted)` | Text phụ |
| `.nmx-text-danger` | `color: var(--nmx-color-danger)` | Text lỗi |
| `.nmx-text-success` | `color: var(--nmx-color-success)` | Text thành công |
| `.nmx-border` | `border: 1px solid var(--nmx-color-border)` | Đường viền chuẩn |
| `.nmx-rounded` | `border-radius: var(--nmx-radius-md)` | Bo góc chuẩn |
| `.nmx-shadow` | `box-shadow: var(--nmx-shadow-sm)` | Bóng nhỏ |
| `.nmx-flex-row` | `display: flex; align-items: center` | Flex ngang |
| `.nmx-flex-col` | `display: flex; flex-direction: column` | Flex dọc |
| `.nmx-truncate` | `overflow: hidden; text-overflow: ellipsis; white-space: nowrap` | Cắt text dài |

---

## 9. License — GNU GPL v3

Namorix được phát hành dưới GNU General Public License version 3 (GPL v3). Mục tiêu: dự án open-source nhưng bảo vệ quyền thương mại hóa độc quyền cho tác giả gốc.

### 9.1 Ý nghĩa thực tế

| Hành động | Được phép? | Điều kiện |
|:---|:---|:---|
| Dùng cá nhân / nội bộ | **YES** | Không có điều kiện |
| Sửa code và dùng nội bộ | **YES** | Không có điều kiện |
| Fork và phân phối lại | **YES** | Bắt buộc open-source toàn bộ dưới GPL v3 |
| Tích hợp vào sản phẩm thương mại | **YES** | Bắt buộc open-source toàn bộ sản phẩm dưới GPL v3 |
| Thương mại hóa mà không open-source | **NO** | Phải xin phép và ký thỏa thuận riêng với tác giả |
| Đóng góp (Pull Request) | **YES** | Contributor ký CLA, copyright thuộc tác giả gốc |

### 9.2 Tại sao GPL v3 phù hợp với Namorix

- GPL v3 không cấm thương mại — tác giả gốc vẫn kiếm tiền qua hosting, support, dịch vụ.
- Copyleft đảm bảo không ai fork Namorix rồi bán lại mà không open-source.
- Cộng đồng vẫn đóng góp vào các service (`namorix-thread`, `namorix-files`...) qua Pull Request.
- Không có Plugin SDK mở — mở rộng đi qua contribute vào service có sẵn.

> **Lưu ý:** GPL v3 cho phép tác giả gốc thương mại hóa Namorix dưới bất kỳ hình thức nào vì là copyright holder. Giới hạn chỉ áp dụng cho bên thứ ba.

### 9.3 Contributor License Agreement (CLA)

Mọi contributor gửi Pull Request phải ký CLA trước khi được merge:

- Tác giả gốc giữ quyền dual-license trong tương lai nếu cần.
- Contributor xác nhận code là của họ và không vi phạm bản quyền bên thứ ba.
- Namorix repo có thể dùng contribution trong mọi phiên bản tương lai.

---

## 10. Final Technology Stack

| Thành phần | Công nghệ | Ghi chú |
|:---|:---|:---|
| Ngôn ngữ | TypeScript | Đồng bộ kiểu dữ liệu toàn hệ thống |
| Frontend Framework | Lit (Custom Elements) | Core: Shadow DOM / Plugin: Light DOM |
| Styling | Vanilla CSS + CSS Variables | No Tailwind, BEM + `nmx-{pid}-` prefix |
| Backend | Node.js + Express / NestJS | Cả Core và Plugin dùng chung pattern |
| Real-time (Critical) | Redis Streams (XADD/XREADGROUP) | Guaranteed delivery, dùng cho điều khiển |
| Real-time (Broadcast) | Redis Pub/Sub | Fire-and-forget, dùng cho log/notify |
| WebSocket | Socket.io | Client-facing real-time (mounted tại Core) |
| Database | PostgreSQL 15+ Multi-Schema | Một instance, schema cách ly theo Plugin |
| Auth | JWT (RS256) + Redis Blacklist | TTL ngắn (15m) + refresh token (7d) |
| Secret Management | NAMORIX_SECRET trong `.env` | Không commit lên Git |
| Container | Docker + Docker Compose | Mỗi Plugin = 1 Container |
| Gateway | Nginx | Reverse proxy, path routing, TLS termination |
| Plugin Bundler | Vite hoặc esbuild | Build Plugin frontend thành single JS bundle |
| License | GNU GPL v3 | Copyleft, bảo vệ quyền thương mại tác giả gốc |

---

## 11. Pre-launch Checklist

| Hạng mục | Mức ưu tiên | Trạng thái |
|:---|:---|:---|
| Redis Streams thay Pub/Sub cho critical messages | CRITICAL | Pending |
| Docker network isolation (nmx-public / nmx-internal / nmx-data) | CRITICAL | Pending |
| `.env` không commit lên Git | CRITICAL | Pending |
| JWT TTL ngắn (15 phút) + Refresh Token flow | HIGH | Pending |
| Redis token revocation (`nmx:revoked:{jti}`) | HIGH | Pending |
| Plugin manifest có `version` + `health` endpoint | HIGH | Pending |
| Core graceful degradation khi Plugin down | HIGH | Pending |
| PostgreSQL user phân quyền riêng cho từng Plugin | HIGH | Pending |
| Nginx forward JWT header tới Plugin | HIGH | Pending |
| CSS: Plugin chỉ dùng `var(--nmx-*)`, không hardcode | HIGH | Pending |
| CLA setup cho contributor | MEDIUM | Pending |
| CSS Naming Convention doc cho Plugin devs | MEDIUM | Pending |
| Event Bus `instanceId` để tránh xung đột multi-instance | MEDIUM | Pending |

---

*End of Document — Namorix Architecture Specification v1.2*
