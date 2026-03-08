# Project Brief — Dashboard-Thread

## Project Overview

Dashboard-Thread là backend + frontend để **điều khiển OpenThread Border Router qua D-Bus** — giao tiếp với otbr-agent (trong container) qua socket D-Bus dùng chung. Monorepo npm workspaces: `backend/`, `frontend/`, `shared/`.

## Core Goal

Cung cấp giao diện web quản lý Thread network:
- Xem trạng thái thiết bị và network (state, dataset, IP, version)
- Xem và phân tích Router Table, Child Table, Joiner Table
- Cấu hình OpenThread (PAN ID, Channel, Network Name, keys)
- Quản lý Commissioner (thêm joiner)
- Reset / Factory Reset thiết bị

## Scope

### In Scope
- Backend Node.js: D-Bus client (OtbrDbusClient) gọi otbr-agent, WebSocket relay
- Backend CoAP server (UDP 5683, IPv6): nhận dữ liệu từ Thread-Node qua path /device/ (register, update, ping), payload CBOR; parse CBOR → log JSON, trả 2.01; không emit lên frontend
- Frontend React: Status (OTBR, OpenThread, System IPv4/IPv6), Nodes (Router/Child/Joiner List + Commission Node modal), Settings
- Shared package: types, events, validation, constants (EVENTS: SYSTEM_INFO, …)
- SQLite: app settings (thread_run_on_connect)
- Real-time: D-Bus signals (PropertiesChanged) khi state thay đổi; poll tables khi có frontend và state active
- Không còn BrConnectionConfigService / form lưu BR host-port; kết nối OTBR chỉ qua D-Bus (backend container dùng volume otbr-dbus chung với OTBR để thấy otbr-agent)

### Out of Scope (hiện tại)
- Authentication / HTTPS (để sau nếu cần)
- Live UART terminal realtime
- Command history / shortcuts

## Target Device

- **OpenThread Border Router** (otbr-agent trong container): giao tiếp qua **D-Bus** (volume socket chung với backend).
- **Thread-Node** (child/endpoint): gửi dữ liệu lên backend qua **CoAP** (UDP 5683), payload **CBOR**. BR chỉ route IP. Hướng dẫn: [docs/coap/thread_node_coap.md](../docs/coap/thread_node_coap.md) (nếu có).

## Key Constraints

- Giao tiếp với OTBR qua D-Bus (dbus-next); không dùng CLI OpenThread trực tiếp
- Frontend phải hoạt động từ LAN (Vite host: true)

## Documents

- OTBR D-Bus: `docs/otbr/dbus_backend.md`
- OTBR config từ backend (tùy chọn): `docs/otbr/otbr_config_from_backend.md`
- Thread-Node CoAP: `docs/coap/thread_node_coap.md` — hướng dẫn child gửi dữ liệu (CoAP + CBOR) lên backend.
