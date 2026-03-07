# Thread-Node — Active Context

## Focus hiện tại (2026-03-06)

Dự án đang ở giai đoạn **hoàn thiện hạ tầng Backend communication**. Device register và ping chạy trong **thread_node** (discovery + refresh task + ping task); **device** component gồm **device_registry** (build payload, API public) và **device_coap** (transport CoAP: POST /device/register, GET /device/ping, token, lock). Log backend IP: **chỉ log 1 lần** khi có IP và **log lại khi IP thay đổi** (thread_node log INFO; thread_discovery trả cache/static/SRP ở LOGD). Công việc còn lại: **Entity CoAP Server** (handlers 5.01) và **CBOR** cho switch/fan/climate/binary_sensor.

## Recent changes

- **thread_endpoint → thread_node**: Đổi tên file và API (`thread_node_config_t`, `thread_node_start()`). Entry point bootstrap.
- **backend_discovery → thread_discovery**: Đổi tên component và API (`thread_discovery_init`, `thread_discovery_get_endpoint`, `thread_discovery_endpoint_t`, `thread_discovery_cfg_t`).
- **thread_coap** ngang hàng với thread_node, thread_joiner trong `components/thread/` (một component `thread` với nhiều .c).
- **device_registry → device/** (thư mục): Trong `components/thread/device/` có `device_registry.c/.h` và **device_coap.c/.h**. device_registry: build payload (device_model, entity_serialization), gọi device_coap_send_register/device_coap_ping. device_coap: transport (CoAP client, token 2 byte, lock, POST /device/register với payload do caller đưa, GET /device/ping, xử lý response timestamp → callback re-register).
- **Backend communication trong thread_node**: Khi `enable_device_registry`: thread_node gọi thread_discovery_init(), discovery lần đầu, tạo task refresh 60s (thread_discovery_get_endpoint, so sánh addr/port, chỉ cập nhật và log khi đổi), task ping 10s (device_registry_ping → device_coap_ping; nếu response timestamp khác → callback → backend_trigger_register). App (main.c) không gọi discovery/register/ping; chỉ implement on_joined (device_model, entity, entity_coap_server_start).
- **GET /device/ping**: Node gửi GET /device/ping mỗi 10s; backend reply 4-byte timestamp (LE). Nếu timestamp khác lần trước → node gửi lại POST /device/register (backend restart / re-register).
- **CoAP token**: Mọi request (register, ping) dùng CoAP token 2 byte (trong device_coap); tái sử dụng cho resource CoAP khác sau này.
- **Backend discovery log**: Log backend IP **1 lần** khi có IP, **log lại khi IP thay đổi**. thread_node log INFO "Backend discovered" / "Backend endpoint updated". thread_discovery: "Discovered backend via SRP", "Using cached SRP backend endpoint", "Using static backend endpoint from NVS" chuyển sang LOGD để tránh spam.
- **Discovery retry khi chưa có backend**: Task refresh dùng delay **10s** khi `!s_backend_ep_valid`, **60s** khi đã có backend (DEFAULT_DISCOVERY_RETRY_MS / DEFAULT_DISCOVERY_REFRESH_MS) — tránh đợi 60s mới retry lần đầu.
- **sys_evt stack overflow**: Handler OpenThread event (on_openthread_event: update_attached_led_role, log_leader_data) chạy trong task "sys_evt"; mặc định stack 2048 gây Stack protection fault. **light_on_off** đặt CONFIG_ESP_SYSTEM_EVENT_TASK_STACK_SIZE=4096 trong sdkconfig.defaults.
- **Log node IPv6 khi join xong**: Trong on_joined_wrapper, log Mesh-Local EID (otThreadGetMeshLocalEid) và RLOC16 (otThreadGetRloc16) ngay sau khi có instance.
- **CoAP response / callback**: Backend phải **echo đúng CoAP token** từ request sang response (RFC 7252) thì OpenThread mới gọi response handler. thread_node gọi device_registry_register(ep, **NULL**, NULL) nên không có callback khi register xong. Ping callback (backend_on_ping_timestamp_changed) chỉ gọi khi **timestamp trong response thay đổi** so với lần trước (lần đầu nhận ping không gọi). Backend ping reply: **2.05 Content**, payload 4 byte timestamp LE.
- **device_registry_is_registered()**: true khi Backend đã ACK (2.01/2.04/2.05) ít nhất một lần.

## Công việc đang pending

### 1. Entity CoAP Server (struct-based)

**File**: `components/entity/coap_server/entity_coap_server.c`

Tất cả handlers đang return `5.01 Not Implemented`. Cần implement GET /entities, GET /entities/{id}, PUT|POST /entities/{id}/{attr} dùng entity_model + thread_coap_send_response.

### 2. CBOR serialization

**File**: `components/entity/serialization/entity_serialization.c`

Đã có: light, sensor. Còn thiếu: switch, fan, climate, binary_sensor.

### 3. main/main.c

Stub; root project không buildable. Quyết định: template tối thiểu hay chỉ dùng examples.

## Files quan trọng

| File | Trạng thái | Ghi chú |
|------|------------|---------|
| `components/thread/thread_node.c/.h` | ✅ | Entry point; enable_device_registry; discovery + ping + register nội bộ |
| `components/thread/thread_discovery.c/.h` | ✅ | SRP/DNS-SD _dashboard._udp; thread_discovery_get_endpoint; cache NVS; log IP ở LOGD |
| `components/thread/device/device_registry.c/.h` | ✅ | Build payload, device_registry_register/ping/is_registered; gọi device_coap |
| `components/thread/device/device_coap.c/.h` | ✅ | CoAP transport: init, send_register(payload), ping, token, response handler (timestamp changed → callback) |
| `components/thread/thread_coap.c/.h` | ✅ | Shared CoAP server manager |
| `components/entity/coap_server/entity_coap_server.c` | ❌ Stub | 5.01 |
| `components/entity/serialization/entity_serialization.c` | ⚠️ Partial | light+sensor OK |
| `examples/light_on_off/main/main.c` | ✅ | thread_node_start; on_joined chỉ setup device + entities + entity_coap_server_start |

## Các bước tiếp theo

1. Implement entity_coap_server handlers (GET/PUT entities).
2. Hoàn thiện CBOR cho switch, fan, climate, binary_sensor.
3. Thêm examples (sensor, switch).
4. Quyết định main/main.c template.
