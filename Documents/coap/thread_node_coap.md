# Thread-Node: Gửi dữ liệu lên Dashboard (CoAP + CBOR)

Tài liệu này dành cho **Thread-Node** (firmware thiết bị router/child/endpoint) khi cần gửi dữ liệu lên OpenThread Dashboard backend. Backend nhận qua **CoAP** (UDP 5683, IPv6), payload **CBOR**. Backend parse CBOR, log JSON ra console và trả **2.01 Created**; không gửi dữ liệu lên frontend.

## Luồng tổng quan

```
Thread-Node  --[CoAP + CBOR, path /device/...]-->  Backend (Dashboard)
Backend       parse CBOR → log JSON, tra 2.01.     (khong push len frontend)
```

- **Thread-Node → Backend**: Gửi request CoAP tới path **/device/register**, **/device/update**, **/device/ping** (hoặc path con khác dưới /device/), body = payload CBOR.
- **Backend**: Listen UDP 5683 trên IPv6 ([::]); parse CBOR bằng thư viện `cbor2`; log `CoAP CBOR -> JSON: {...}` và type/rloc16; trả CoAP 2.01. Không emit WebSocket lên frontend.

## Lấy Backend IP/port bằng SRP/DNS-SD (tự scan)

- **Ưu tiên:** Thread-Node **tự scan** service `_dashboard._udp` trên mạng Thread (qua SRP server của BR) để lấy IP và port backend, không cần hardcode.
- **Cách làm:** Browse `_dashboard._udp.default.svc.arpa` (OpenThread DNS client / DNS-SD browse) → chọn instance → đọc SRV (port, hostname) → resolve AAAA → được **IPv6 + port**.
- **Cache:** Lưu IP + port vào NVS; refresh khi CoAP fail hoặc định kỳ.
- **Fallback:** Nếu không thấy service → dùng cấu hình tĩnh (IP/port trong NVS hoặc commissioning).

**Spec service (backend đăng ký):** type `_dashboard._udp`, domain `default.svc.arpa`, port 5683. Backend gửi đăng ký qua frame CMD_SRP_REGISTER (0x44) tới BR khi BR là leader. Chi tiết: [../architecture/real_br_integration.md](../architecture/real_br_integration.md).

### Ghi chú triển khai (Thread-Node)

- **Module**: `ESP-Thread/Thread-Node/components/thread/backend_discovery/backend_discovery.c` + header.
- **API**: `backend_discovery_init()`, `backend_discovery_get_endpoint(&ep, force_refresh)` → dùng `ep.addr` (IPv6) và `ep.port` (5683) để gửi CoAP tới `coap://[<IPv6>]:5683/device/<type>`.

### Device register (`/device/register`) — gửi tới Backend

- **Path**: POST `/device/register` tới Backend. IP và port lấy từ `backend_discovery_get_endpoint()`.
- **Trigger**: (1) Sau khi discovery backend thành công (vd. trong `on_joined` hoặc task); (2) Khi refresh task (vd. 60s) phát hiện endpoint (addr/port) thay đổi → gọi lại register.
- **Payload**: CBOR device model (device info + entities). Response: 2.01/2.04/2.05 (ACK) hoặc 4.xx/5.xx (NACK). Backend phải luôn trả response (xem [border_router_coap_server.md](border_router_coap_server.md) ACK/NACK).
- **API**: `device_registry_init()` (gọi khi enable_device_registry); `device_registry_register(endpoint, callback, ctx)` với `device_registry_endpoint_t` tương thích với `backend_endpoint_t` (addr, port). Example: `examples/light_on_off/main/main.c` — `trigger_register()` khi có endpoint, refresh task cập nhật endpoint và gọi lại.

## CoAP

- **Giao thức**: CoAP (không HTTP).
- **Port**: **5683** (UDP). Backend listen trên **IPv6** ([::]:5683).
- **Địa chỉ**: `coap://<IP-backend>:5683/device/<type>`
  - `<IP-backend>`: IPv6 của máy chạy backend (từ SRP discovery hoặc cấu hình tĩnh; route được từ Thread qua BR).
  - `<type>`: `register` | `update` | `ping` hoặc path tùy chọn (backend dùng làm type trong log).

### Resource paths

| Path | Ý nghĩa (gợi ý) |
|------|------------------|
| `/device/register` | Đăng ký node (lần đầu / sau khi join) |
| `/device/update`   | Cập nhật trạng thái / sensor / metadata |
| `/device/ping`    | Ping / keepalive |

Method: POST (CoAP request có body). Body = payload CBOR.

## Payload CBOR

- **Format**: CBOR (Concise Binary Object Representation).
- **Gợi ý schema** (numeric key để ít byte):
  - **Register**: `{ 0: "register", 1: rloc16, 2: extAddr?, 3: metadata? }`
  - **Update**: `{ 0: "update", 1: rloc16, 2: data? }`
  - **Ping**: `{ 0: "ping", 1: rloc16 }`

Backend đọc key `1` làm RLOC16 cho log. Toàn bộ object parse được log ra dạng JSON trong console.

## Backend nhận và trả về

- Backend listen UDP 5683 trên **[::]** (IPv6). Parse CBOR (thư viện `cbor2`), log:
  - `CoAP request POST /device/<type>`
  - `CoAP CBOR -> JSON: {"0":"register","1":"0xfc01",...}`
  - `CoAP /device/<type> -> 2.01 type=<type> rloc16=...`
- CoAP response: **2.01 Created**.
- Không có WebSocket event hay section UI cho device data; chỉ log backend.

## Ví dụ (pseudo)

- Gửi register: `POST coap://[fd00::1]:5683/device/register`, body = CBOR `{ 0: "register", 1: "0xfc01", 2: "ext-addr-hex" }`.
- Backend log: `CoAP device server listening on [::]:5683 (path /device/...)` khi khởi động; khi nhận request log dòng CoAP request + CBOR JSON + 2.01.

## Tài liệu liên quan

- Backend CoAP server: `backend/src/server/CoapDeviceServer.ts`
- SRP/BR integration: `docs/architecture/real_br_integration.md`
