# Project Brief — Dashboard-Thread

## Project Overview

Dashboard-Thread là backend + frontend để **điều khiển OpenThread Border Router qua TCP** (frame protocol) — không còn CLI text, không dùng Serial/UART. BR kết nối tại host:port (vd. Thread-Host.local:5000). Monorepo npm workspaces: `backend/`, `frontend/`, `shared/`.

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
- Backend CoAP server (UDP 5683, IPv6): nhận dữ liệu từ Thread-Node qua path /device/ (ping, register/info, register/entity, update/info, update/entity, update/topology, update/state), payload CBOR; parse CBOR, lưu 6 bảng SQLite; có thể trả restore state CBOR; không emit lên frontend
- Frontend Lit: Status (BR, OpenThread, System IPv4/IPv6), Nodes (Router/Child/Joiner List + Commission Node modal), Settings
- Backend SRP register: CMD_SRP_REGISTER (0x44) qua frame khi BR là leader; IPv6 từ env hoặc auto-detect
- Shared package: types, events, validation, constants (EVENTS: SRP_REGISTER, SYSTEM_INFO, …)
- SQLite: lưu BR connection config và app settings
- Real-time polling: table data, thread state

### Out of Scope (hiện tại)
- Authentication / HTTPS (để sau nếu cần)
- Live UART terminal realtime
- Command history / shortcuts

## Target Device

- **OpenThread Border Router** (vd. ESP32-H2 hoặc thiết bị chạy BR firmware), giao tiếp qua **TCP** (frame protocol), listen port 5000.
- **Thread-Node** (child/endpoint): gửi dữ liệu lên backend qua **CoAP** (UDP 5683), path /device/ping, register/info, register/entity, update/info, update/entity, update/topology, update/state, payload **CBOR**. BR chỉ route IP. Hướng dẫn tích hợp: [docs/coap/thread_node_coap.md](../docs/coap/thread_node_coap.md).

## Key Constraints

- Giao tiếp HOÀN TOÀN qua frame protocol — không dùng CLI OpenThread
- Frame ID phải unique per request, wrap 0–0xFF
- Frontend phải hoạt động từ LAN (Vite host: true)
- Không đóng TCP khi server restart — BR vẫn chạy

## Documents

- Protocol: `HomeThread/Documents/protocol/usb_cdc_frame_structure.md`
- Table format: `HomeThread/Documents/protocol/table_data_format.md`
- Migration: `HomeThread/Documents/dashboard/migration_to_frame_protocol.md`
- Thread-Node CoAP: `docs/coap/thread_node_coap.md` — hướng dẫn child gửi dữ liệu (CoAP + CBOR) lên backend.
