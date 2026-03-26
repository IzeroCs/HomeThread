# Project Brief — Namorix Thread

## Project Overview

Dashboard là backend + frontend để **điều khiển OpenThread Border Router qua TCP** (frame protocol) — không còn CLI text, không dùng Serial/UART. BR kết nối tại host:port (vd. Thread-Host.local:5000). Monorepo npm workspaces: `backend/`, `frontend/`, `shared/`.

## Core Goal

Cung cấp giao diện web quản lý Thread network:
- Xem trạng thái thiết bị và network (state, dataset, IP, version)
- Xem và phân tích Router Table, Child Table, Joiner Table
- Cấu hình OpenThread (PAN ID, Channel, Network Name, keys)
- Quản lý Commissioner (thêm joiner)
- Reset / Factory Reset thiết bị

## Scope

### In Scope
- Backend Node.js: TCP client (BR host:port), frame protocol, WebSocket relay
- Backend CoAP server (UDP 5683, IPv6): nhận dữ liệu từ Thread-Node qua path /device/ (ping, register/info, register/entity, update/info, update/entity, update/topology, update/state), payload CBOR; parse CBOR, lưu 8 bảng SQLite (gồm device_topology_neighbor, device_health_br snapshot từ frame CMD_BR_HEALTH); có thể trả restore state CBOR; không emit lên frontend
- Frontend Lit: Status (BR, OpenThread, System IPv4/IPv6), Nodes (Router/Child/Joiner List + Commission Node modal), Settings
- Backend SRP register: CMD_SRP_REGISTER (0x44) qua frame khi BR là leader; IPv6 từ env hoặc auto-detect
- Shared package: types, events, validation, constants (EVENTS: SRP_REGISTER, SYSTEM_INFO, …)
- SQLite: lưu BR connection config và app settings
- BR sync: state poll 5s, CMD_NOTIFY (notify-first) + baseline on connect; không gating theo số client frontend

### Out of Scope (hiện tại)
- Authentication / HTTPS (để sau nếu cần)
- Live UART terminal realtime
- Command history / shortcuts

## Target Device

- **OpenThread Border Router** (vd. ESP32-H2 hoặc thiết bị chạy BR firmware), giao tiếp qua **TCP** (frame protocol), listen port 5000.
- **Thread-Node** (child/endpoint): gửi dữ liệu lên backend qua **CoAP** (UDP 5683), path /device/ping, register/info, register/entity, update/info, update/entity, update/topology, update/state, payload **CBOR**. BR chỉ route IP. Spec và flow: `documents/coap/device_payload_spec.md`; discovery: `documents/coap/backend_discovery_srp.md`.

## Key Constraints

- Giao tiếp HOÀN TOÀN qua frame protocol — không dùng CLI OpenThread
- Frame ID phải unique per request, wrap 0–0xFF
- Frontend phải hoạt động từ LAN (Vite host: true)
- Không đóng TCP khi server restart — BR vẫn chạy

## Namorix Desktop (shell host — repo khác)

Dashboard Thread có thể chạy **độc lập** (Vite dev / backend riêng) hoặc được **embed như addon** trong **Namorix Desktop** — repo sibling **`namorix`** (chứa `core/` in-repo + dùng chung `namorix-assets` trong workspace).

- **Spec tích hợp:** `namorix/documents/namorix-desktop-architecture.md` — addon manifest, `window.nmxCore`, CORS (`DESKTOP_ORIGIN`), auth exchange (`nmx_token`), milestone **M3** (load Thread trong cửa sổ shell).
- **Core:** theo dõi qua `namorix/documents/core-library.md` và `namorix/memory-bank/*`; không nhân đôi nội dung spec trong repo Thread.
- **Embed shell:** Core 0.9.2+ — `defineCustomElementOnce` cho component Lit dùng chung; addon backend — `DESKTOP_ORIGIN` khớp Vite; lib build — cấu hình `process.env` khi cần (xem `techContext.md`).

Chi tiết product/tech: `memory-bank/productContext.md`, `memory-bank/techContext.md` (mục Namorix Desktop).

## Documents (namorix-thread/documents/)

- **README.md** — Mục lục tài liệu, sơ đồ kiến trúc, luồng đăng ký tóm tắt.
- **Protocol:** `protocol/usb_cdc_frame_structure.md`, `protocol/table_data_format.md`
- **CoAP (canonical):** `coap/device_payload_spec.md` — endpoints, CBOR keys, DB schema 8 bảng, flow đăng ký Thread-Node.
- **SRP discovery:** `coap/backend_discovery_srp.md` — Thread-Node tìm Backend qua SRP/DNS-SD.
- **Kiến trúc:** `architecture/real_br_integration.md` — BR thật, routing, troubleshooting.
- **Backend:** `websocket.md` (handler modules), `installation.md` (IPv6 route Linux).
- **Entity model (firmware):** `iot-entity-model/entity_model_specification.md`
- Migration (nếu có): `documents/migration_to_frame_protocol.md`
