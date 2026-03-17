---
name: ""
overview: ""
todos: []
isProject: false
---

# Device & Entity Name — Raw vs User-Set

## Nguyên tắc

- Tên từ firmware và tên do user đặt là **hai trường độc lập**.
- Node register lại **không** được ghi đè tên user đã đặt.
- Backend (hoặc UI qua API) cập nhật tên user; node không liên quan.

---

## 1. Schema (đã xong)

**File:** [backend/src/database/database.schema.ts](backend/src/database/database.schema.ts)

- **device_info:** `deviceNameRaw: text("device_name_raw")` đã có (dòng 26). `deviceName` = tên user (chỉ set lần đầu hoặc qua API).
- **device_entity:** `nameRaw: text("name_raw")` đã có (dòng 73). `name` = tên user (chỉ set lần đầu hoặc qua API).
- DB đã xóa và tạo lại nên **không cần** migration / ALTER TABLE.

---

## 2. Logic register — không ghi đè tên user

**File:** [backend/src/database/repositories/device.repository.ts](backend/src/database/repositories/device.repository.ts)

**device_info (upsertDeviceInfo):**

- Thêm param `deviceNameRaw: string | null` (cùng nguồn từ payload).
- **Update (row đã tồn tại):** `device_name_raw = ?` (luôn ghi đè); `device_name = COALESCE(device_name, ?)` (chỉ set nếu đang NULL).
- **Insert:** set cả `device_name_raw` và `device_name` từ payload.

**device_entity (mergeEntity):**

- Thêm `nameRaw` vào `MergeEntityItem`; từ payload name truyền cả `name` và `nameRaw`.
- **Update (on conflict):** `name_raw = ?` (luôn ghi đè); `name = COALESCE(name, ?)` (chỉ set nếu đang NULL). Dùng raw SQL trong set nếu cần: `sql\`name = COALESCE(device_entity.name, ${e.name})`.

---

## 3. Service (CoAP)

**File:** [backend/src/coap/device/device-coap.service.ts](backend/src/coap/device/device-coap.service.ts)

- **upsertDeviceInfo(parsed):** Đọc device name từ payload (DEVICE_INFO_KEYS.DEVICE_NAME) → gọi repo với `deviceNameRaw: value` và `deviceName: value`.
- **mergeEntity:** Đọc name từ payload (ENTITY_KEYS.NAME) → gọi repo với `nameRaw: value` và `name: value`.
- Cập nhật types `DeviceRecord` / `EntityRecord` (hoặc DTO) để có `device_name_raw`/`device_name` và `name_raw`/`name` cho API/UI.

---

## 4. Slug

**File:** [backend/src/database/repositories/device.repository.ts](backend/src/database/repositories/device.repository.ts)

- **generateSlug:** Đổi từ `deviceName ?? macHex` sang `(device_name ?? device_name_raw ?? macHex)` khi tạo slug (khi assign slug cho device mới).

---

## 5. CoAP (node)

Node chỉ dùng: POST `/device/register/info`, `/device/register/entity`, `/device/update/topology`, `/device/update/state`, GET `/device/ping`. Không có `/device/update/info` hay `/device/update/entity` từ node; đổi tên chỉ qua backend/UI.

---

## 6. UI

- Device: hiển thị `device_name ?? device_name_raw`.
- Entity: hiển thị `name ?? name_raw`.

---

## Checklist triển khai (chỉ logic)

- Repo: upsert device/entity với raw luôn ghi đè, user name = COALESCE(hiện tại, payload); slug từ (device_name ?? device_name_raw ?? mac).
- CoAP service: truyền raw + name/deviceName vào repo.
- (Sau) UI: hiển thị user name, fallback raw; form đổi tên + reset = set null.

**Không** cần: tóm tắt lại; cập nhật memory-bank hoặc docs.
