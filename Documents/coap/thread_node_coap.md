# Thread-Node: Gửi dữ liệu lên Dashboard (CoAP + CBOR)

Tài liệu này dành cho **Thread-Node** (firmware thiết bị router/child/endpoint) khi cần gửi dữ liệu lên OpenThread Dashboard backend. Backend nhận qua **CoAP** (UDP 5683, IPv6), payload **CBOR**. Backend parse CBOR, log JSON ra console và trả **2.01 Created**; không gửi dữ liệu lên frontend.

## Luồng tổng quan

```
Thread-Node  --[CoAP + CBOR, path /device/...]-->  Backend (Dashboard)
Backend       parse CBOR → log JSON, tra 2.01.     (khong push len frontend)
```

- **Thread-Node → Backend**: Gửi **GET** tới `/device/ping` (không body); gửi **POST** tới `/device/register`, `/device/update` với body CBOR.
- **Backend**: Listen UDP 5683 trên IPv6 ([::]). **GET /device/ping** → trả **2.05 Content**, payload 4 byte = timestamp uint32 little-endian (giá trị lúc server khởi động; restart = timestamp mới; node so sánh và gửi lại register nếu khác). **POST** register/update: parse CBOR bằng **thư viện nội bộ** (`backend/src/cbor`); log JSON + structure; trả 2.01. Không emit WebSocket lên frontend.

## Lấy Backend IP/port bằng SRP/DNS-SD (tự scan)

- **Ưu tiên:** Thread-Node **tự scan** service `_dashboard._udp` trên mạng Thread (qua SRP server của BR) để lấy IP và port backend, không cần hardcode.
- **Cách làm:** Browse `_dashboard._udp.default.svc.arpa` (OpenThread DNS client / DNS-SD browse) → chọn instance → đọc SRV (port, hostname) → resolve AAAA → được **IPv6 + port**.
- **Cache:** Lưu IP + port vào NVS; refresh khi CoAP fail hoặc định kỳ.
- **Fallback:** Nếu không thấy service → dùng cấu hình tĩnh (IP/port trong NVS hoặc commissioning).

**Spec service (backend đăng ký):** type `_dashboard._udp`, domain `default.svc.arpa`, port 5683. Backend gửi đăng ký qua frame CMD_SRP_REGISTER (0x44) tới BR khi BR là leader. Chi tiết: [../architecture/real_br_integration.md](../architecture/real_br_integration.md).

### Ghi chú triển khai (Thread-Node)

- **Discovery**: `components/thread/thread_discovery.c/.h` — `thread_discovery_init()`, `thread_discovery_get_endpoint(&ep, force_refresh)`. Endpoint: `thread_discovery_endpoint_t` (addr, port, from_srp).
- **Device layer**: `components/thread/device/` — **device_registry** (build payload, API `device_registry_register`, `device_registry_ping`, `device_registry_is_registered`) và **device_coap** (transport: POST /device/register, GET /device/ping, CoAP token 2 byte). **thread_node** khi `enable_device_registry` chạy discovery (task delay 10s khi chưa có backend, 60s khi đã có), task ping 10s, và gọi register/ping nội bộ; app không gọi discovery/register/ping.

### Device register (`/device/register`) — gửi tới Backend

- **Path**: POST `/device/register`. IP/port từ `thread_discovery_get_endpoint()` (thread_node giữ endpoint).
- **Trigger**: (1) Lần đầu discovery thành công; (2) Task discovery (10s/60s) phát hiện endpoint (addr/port) đổi; (3) Ping task 10s nhận GET /device/ping response có timestamp khác (backend restart) → gửi lại register.
- **Payload**: CBOR device model (device_registry build qua device_model + entity_serialization). Response: 2.01/2.04/2.05 (ACK). Backend phải trả response (xem [border_router_coap_server.md](border_router_coap_server.md)).
- **API**: `device_registry_init()` (gọi từ thread_node); `device_registry_register(endpoint, callback, ctx)`; `device_registry_ping(endpoint, on_timestamp_changed, ctx)`.
- **CoAP token (RFC 7252)**: Node gửi request với token 2 byte. Backend **phải echo đúng token** trong response thì OpenThread mới match và gọi response handler; nếu không echo token, node sẽ không nhận callback.
- **Callback**: thread_node gọi `device_registry_register(ep, NULL, NULL)` nên không có user callback khi register xong. Ping callback (`on_timestamp_changed`) chỉ được gọi khi **timestamp trong response thay đổi** so với lần trước (lần đầu nhận ping không gọi).

## CoAP

- **Giao thức**: CoAP (không HTTP).
- **Port**: **5683** (UDP). Backend listen trên **IPv6** ([::]:5683).
- **Địa chỉ**: `coap://<IP-backend>:5683/device/<type>`
  - `<IP-backend>`: IPv6 của máy chạy backend (từ SRP discovery hoặc cấu hình tĩnh; route được từ Thread qua BR).
  - `<type>`: `register` | `update` | `ping` hoặc path tùy chọn (backend dùng làm type trong log).

### Resource paths

| Path | Method | Ý nghĩa |
|------|--------|---------|
| `/device/register` | POST | Đăng ký node (payload CBOR: device info + entities). Response 2.01. |
| `/device/update`   | POST | Cập nhật trạng thái / sensor (payload CBOR). Response 2.01. |
| `/device/ping`     | **GET** | Ping; backend trả **2.05 Content**, payload **4 byte** = timestamp uint32 LE (giá trị lúc server khởi động). Node so sánh timestamp; nếu khác → backend đã restart → gửi lại register. |

POST: body = payload CBOR. GET /device/ping: không body.

## Payload CBOR

- **Format**: CBOR (Concise Binary Object Representation).
- **Register payload** (numeric key, xem `cbor_register_keys.h` trên Thread-Node): device_id(0), device_name(1), device_type(2), manufacturer(3), model(4), sw_version(5), hw_version(6), mac_address(7), network(8) = { rloc16(0), **role(1)** = số 0=child 1=router 2=leader, ipv6(2), parent(3)? }, entities(9) = array. Backend log JSON + structure (device_id, rloc16, role, entities count).

## Backend nhận và trả về

- Backend listen UDP 5683 trên **[::]** (IPv6).
  - **GET /device/ping**: Trả **2.05 Content**, payload 4 byte timestamp uint32 LE (giá trị lúc server khởi động). Log: `CoAP GET /device/ping -> 2.05 timestamp=...`
  - **POST /device/register**, update: Parse CBOR (thư viện nội bộ `backend/src/cbor`), log `CoAP CBOR -> JSON: {...}` và `CoAP /device/register structure: device_id=... rloc16=... role=... entities=...`. Trả **2.01 Created**.
- Không có WebSocket event hay section UI cho device data; chỉ log backend.

## Ví dụ (pseudo)

- **Ping:** `GET coap://[fd00::1]:5683/device/ping` → response 2.05, body 4 byte (timestamp LE). Node lưu; lần sau nếu timestamp khác → gửi lại register.
- **Register:** `POST coap://[fd00::1]:5683/device/register`, body = CBOR (device model với key 0–9, role = 0|1|2).
- Backend log: `CoAP device server listening on [::]:5683 (path /device/...)` khi khởi động; khi nhận request log CoAP request + CBOR JSON + structure + 2.01 hoặc 2.05.

## Troubleshooting: ResponseTimeout

Khi node báo **Ping response error: ResponseTimeout** hoặc **Register response error: ResponseTimeout**, handler vẫn được gọi nhưng với **lỗi timeout** (OpenThread không nhận được response trong thời gian chờ). Nguyên nhân thường là **response từ backend không tới được node** (routing/forwarding), không phải lỗi token/messageId hay backend logic.

- **Backend (node-coap):** Gửi response về đúng **rsinfo** (source IP + port của request). Request từ node có source = địa chỉ OMR (vd. `fdb8:3795:e886:1:...`) và port 5683.
- **Trên host chạy backend:** Cần có **route** tới prefix Thread (vd. `fdb8:3795:e886:1::/64`) qua BR. Kiểm tra: `ip -6 route get <node_ula>` → phải ra next-hop là BR (link-local hoặc ULA của BR) và dev đúng interface.
- **Border Router:** BR phải **forward** packet từ backhaul (Ethernet/Wi‑Fi) vào Thread mesh. Với BR **ESP32-S3 + RCP (ESP32-H2)**: border routing trong firmware; đảm bảo BR quảng bá OMR prefix và forward đích đến prefix đó vào mesh. Với **OTBR trên Linux**: cần `net.ipv6.conf.all.forwarding=1` và firewall ip6tables cho phép FORWARD vào interface Thread (wpan0).
- **Địa chỉ node:** Node có **mesh-local** (fd18:... theo MESH LOCAL PREFIX của BR) và **OMR** (fdb8:...); backend nhận request từ OMR và gửi response về OMR. Đảm bảo node join đúng mạng (cùng BR) và BR có prefix OMR tương ứng.

Chi tiết kiến trúc BR và routing: [../architecture/real_br_integration.md](../architecture/real_br_integration.md) (phần 6 — Troubleshooting CoAP response).

## Tài liệu liên quan

- Backend CoAP server: `backend/src/server/CoapDeviceServer.ts`
- SRP/BR integration: `docs/architecture/real_br_integration.md`
