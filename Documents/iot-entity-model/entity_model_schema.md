# IoT Entity Model — SQLite Schema

> **Version:** 1.0.0
> **Date:** February 19, 2026
> **Platform:** SQLite3 (Leader / Border Router)

Schema SQLite dùng để lưu và quản lý **thiết bị** (devices) và **thực thể** (entities) IoT trên Thread network tại leader/border router.

---

## Mục lục

1. [Tổng quan](#tổng-quan)
2. [Mô hình quan hệ (ER)](#mô-hình-quan-hệ-er)
3. [Quan hệ giữa các bảng](#quan-hệ-giữa-các-bảng)
4. [Mô tả thực thể](#mô-tả-thực-thể)
5. [Index & ràng buộc](#index--ràng-buộc)
6. [Migration & bảo trì](#migration--bảo-trì)
7. [Tóm tắt](#tóm-tắt)

---

## Tổng quan

**Mục đích chính:**
- **Registry thiết bị** — Danh sách thiết bị trong mạng Thread
- **Trạng thái thực thể** — Light, switch, fan, sensor, climate, binary_sensor
- **Lịch sử** — Sensor readings, event log
- **Truy vấn & điều khiển** — Tra cứu nhanh theo device/entity/type

**Nguyên tắc thiết kế:** Chuẩn hóa 3NF, khóa ngoại (CASCADE), index cho cột hay query, JSON cho metadata mở rộng.

---

## Mô hình quan hệ (ER)

```mermaid
erDiagram
    devices {
        int id PK
        text device_id UK
        text device_name
        text device_type
        text manufacturer
        text model
        text mac_address UK
        text ipv6_addr
        text rloc16
        text role "leader, router, child"
        int online "0/1"
        int last_seen
        int registered_at
        int updated_at
        text metadata "JSON"
    }

    entities {
        int id PK
        text device_id FK
        text entity_id
        text name
        text entity_type "light, switch, fan, sensor, climate, binary_sensor"
        text device_class
        int available "0/1"
        int last_update
        text metadata "JSON"
    }

    entity_light {
        text entity_id PK_FK
        text device_id
        int state "0/1"
        int brightness "0-100"
        int color_temp
        int rgb_r
        int rgb_g
        int rgb_b
        text mode "on_off, dimmable, rgb"
        int updated_at
    }

    entity_switch {
        text entity_id PK_FK
        text device_id
        int state
        text gang_states "JSON"
        int gang_count "1-4"
        text type "toggle, push, multi_gang"
        int updated_at
    }

    entity_fan {
        text entity_id PK_FK
        text device_id
        int state
        int speed "0-100"
        text mode "off, low, medium, high, auto"
        int oscillation "0/1"
        int updated_at
    }

    entity_sensor {
        text entity_id PK_FK
        text device_id
        real value
        text unit "°C, %, ppm"
        text sensor_class "temperature, humidity"
        real min_value
        real max_value
        real avg_value
        int updated_at
    }

    entity_climate {
        text entity_id PK_FK
        text device_id
        text mode "off, cool, heat, auto"
        real current_temp
        real target_temp
        int current_humidity
        text fan_speed
        int updated_at
    }

    entity_binary_sensor {
        text entity_id PK_FK
        text device_id
        int state "0=clear, 1=detected"
        text sensor_class "motion, door, smoke"
        int last_triggered
        int updated_at
    }

    sensor_history {
        int id PK
        text entity_id FK
        text device_id
        text sensor_class
        real value
        text unit
        int timestamp
    }

    events {
        int id PK
        text device_id FK
        text entity_id "nullable"
        text event_type "state_change, error, warning"
        text severity "info, warning, error, critical"
        text description
        text old_value "JSON"
        text new_value "JSON"
        int timestamp
    }

    devices ||--o{ entities : "has"
    entities ||--o| entity_light : "light"
    entities ||--o| entity_switch : "switch"
    entities ||--o| entity_fan : "fan"
    entities ||--o| entity_sensor : "sensor"
    entities ||--o| entity_climate : "climate"
    entities ||--o| entity_binary_sensor : "binary_sensor"
    entity_sensor ||--o{ sensor_history : "history"
    devices ||--o{ events : "events"
```

---

## Quan hệ giữa các bảng

| Bảng cha | Quan hệ | Bảng con | Ý nghĩa |
|----------|--------|----------|---------|
| **devices** | 1 → n | **entities** | Một device có nhiều entity. Xóa device → CASCADE xóa entities. |
| **entities** | 1 → 0..1 | **entity_light** | Entity kiểu `light` → entity_light. |
| **entities** | 1 → 0..1 | **entity_switch** | Entity kiểu `switch` → entity_switch. |
| **entities** | 1 → 0..1 | **entity_fan** | Entity kiểu `fan` → entity_fan. |
| **entities** | 1 → 0..1 | **entity_sensor** | Entity kiểu `sensor` → entity_sensor. |
| **entities** | 1 → 0..1 | **entity_climate** | Entity kiểu `climate` → entity_climate. |
| **entities** | 1 → 0..1 | **entity_binary_sensor** | Entity kiểu `binary_sensor` → entity_binary_sensor. |
| **entity_sensor** | 1 → n | **sensor_history** | Lịch sử giá trị sensor (time-series). |
| **devices** | 1 → n | **events** | Event gắn với device. |

**Khóa:** `devices.device_id` và `(entities.device_id, entities.entity_id)` là định danh chính.

---

## Mô tả thực thể

### devices
- **Mục đích:** Thông tin cấp thiết bị (Thread: MAC, IPv6, RLOC16, role, online, last_seen).
- **Thuộc tính chính:** `device_id` (unique), `device_name`, `device_type`, `manufacturer`, `model`, `mac_address`, `ipv6_addr`, `rloc16`, `role`, `online`, `last_seen`, `registered_at`, `updated_at`, `metadata` (JSON).

### entities
- **Mục đích:** Bảng master cho mọi entity; mỗi entity thuộc một device và có một kiểu.
- **Thuộc tính chính:** `device_id` (FK), `entity_id`, `name`, `entity_type`, `device_class`, `available`, `last_update`, `metadata` (JSON).
- **Ràng buộc:** UNIQUE(device_id, entity_id); entity_type ∈ {light, switch, fan, sensor, climate, binary_sensor}.

### entity_light
- **Mục đích:** Trạng thái và thuộc tính đèn (on/off, brightness, color_temp, rgb, mode).
- **Thuộc tính chính:** `entity_id` (PK, FK), `device_id`, `state`, `brightness`, `color_temp`, `rgb_*`, `mode`, `min/max_brightness`, `effect`, `transition_time`, `updated_at`.

### entity_switch
- **Mục đích:** Công tắc / nút bấm (toggle, push, multi-gang).
- **Thuộc tính chính:** `entity_id` (PK, FK), `device_id`, `state`, `pressed`, `gang_states` (JSON), `gang_count`, `type`, `momentary`, `interlock`, `updated_at`.

### entity_fan
- **Mục đích:** Quạt (on/off, tốc độ, chế độ, oscillation, direction).
- **Thuộc tính chính:** `entity_id` (PK, FK), `device_id`, `state`, `speed`, `mode`, `oscillation`, `direction`, `speed_levels`, `timer_remaining`, `updated_at`.

### entity_sensor
- **Mục đích:** Cảm biến số (nhiệt độ, độ ẩm, …); value hiện tại + min/max/avg.
- **Thuộc tính chính:** `entity_id` (PK, FK), `device_id`, `value`, `unit`, `sensor_class`, `min/max/avg_value`, `accuracy`, `update_interval`, `updated_at`.

### entity_climate
- **Mục đích:** Điều hòa / máy sưởi.
- **Thuộc tính chính:** `entity_id` (PK, FK), `device_id`, `mode`, `current_temp`, `target_temp`, `current_humidity`, `fan_speed`, `swing`, `min/max_temp`, `updated_at`.

### entity_binary_sensor
- **Mục đích:** Cảm biến nhị phân (chuyển động, cửa, khói, …).
- **Thuộc tính chính:** `entity_id` (PK, FK), `device_id`, `state`, `sensor_class`, `last_triggered`, `trigger_count`, `debounce_time`, `updated_at`.

### sensor_history
- **Mục đích:** Lịch sử giá trị sensor (time-series) cho biểu đồ và thống kê.
- **Thuộc tính chính:** `id`, `entity_id` (FK), `device_id`, `sensor_class`, `value`, `unit`, `timestamp`.

### events
- **Mục đích:** Nhật ký sự kiện (đổi trạng thái, lỗi, cảnh báo).
- **Thuộc tính chính:** `id`, `device_id` (FK), `entity_id` (nullable), `event_type`, `severity`, `description`, `old_value`, `new_value`, `metadata`, `timestamp`.

---

## Index & ràng buộc

| Bảng | Index chính | Ràng buộc chính |
|------|-------------|------------------|
| devices | device_id, online, last_seen | device_id UNIQUE |
| entities | device_id, entity_type, available | UNIQUE(device_id, entity_id), entity_type CHECK |
| entity_light | device_id, state | state ∈ {0,1}, brightness 0–100 |
| entity_switch | device_id | state ∈ {0,1}, gang_count 1–4 |
| entity_fan | device_id | state ∈ {0,1}, speed 0–100 |
| entity_sensor | device_id, sensor_class | — |
| entity_climate | device_id | target_temp 16–35 |
| entity_binary_sensor | device_id, sensor_class, state | state ∈ {0,1} |
| sensor_history | entity_id, timestamp | — |
| events | device_id, timestamp, event_type, severity | severity CHECK |

---

## Migration & bảo trì

- **Schema version:** Bảng `schema_version` (version, applied_at, description) theo dõi migration.
- **Dọn dữ liệu:** Xóa `sensor_history` > 30 ngày, `events` > 7 ngày; chạy `VACUUM`/`ANALYZE` định kỳ.

---

## Tóm tắt

- **Chuẩn hóa** — 3NF, bảng entity type tách riêng.
- **Mở rộng** — Thêm entity type mới bằng cách thêm bảng `entity_*`.
- **Lịch sử & sự kiện** — sensor_history (time-series) + events (audit/debug).
- **Toàn vẹn** — Foreign key ON DELETE CASCADE; CHECK cho enum và khoảng giá trị.
- **Metadata** — Cột JSON cho thuộc tính tùy chọn.

---

## Tài liệu liên quan

- **[entity_model_specification.md](entity_model_specification.md)** — Firmware entity model spec (ESP-IDF).
- **[../coap/border_router_coap_server.md](../coap/border_router_coap_server.md)** — CoAP server đăng ký device.
