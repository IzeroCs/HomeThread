# Thread-Node — Active Context

## Focus hiện tại (2026-03-10)

Dự án đang ở giai đoạn **hoàn thiện hạ tầng Backend communication**. Device register **align backend**: (1) POST /device/register/info — chỉ device info (keys 0–7); (2) POST /device/register/entity — mac (key 7) + array entities (key 9). Mỗi entity item gửi keys 0–12 và **key 13 (restore_mode)**; node encode restore_mode (mặc định 0) để backend mergeEntity nhận đủ. **device** component ở **components/device/**; **thread** core ở **components/thread/core/** (thread_node, thread_joiner, thread_coap, thread_discovery). Ping và discovery như trước; **chờ register thành công** (retry 2s) rồi mới gửi entities. Công việc còn lại: **Entity CoAP Server** (handlers 5.01) và **CBOR** cho switch/fan/climate/binary_sensor.

## Recent changes

- **thread_endpoint → thread_node**: Đổi tên file và API (`thread_node_config_t`, `thread_node_start()`). Entry point bootstrap.
- **backend_discovery → thread_discovery**: Đổi tên component và API (`thread_discovery_init`, `thread_discovery_get_endpoint`, `thread_discovery_endpoint_t`, `thread_discovery_cfg_t`).
- **thread_coap** ngang hàng với thread_node, thread_joiner trong `components/thread/` (một component `thread` với nhiều .c).
- **device → components/device/**: `device_registry.c/.h` và **device_coap.c/.h** nằm ở **components/device/** (tách khỏi thread). device_registry: gọi entity_serialize_info_cbor (keys 1–7), device_coap_send_register → path /device/register/info; **chỉ khi register success** (callback) mới gọi device_coap_send_entities → path /device/register/entity (payload mac 7 + key 9); topology/state: topology **role-based** (entity_serialize_topology_child_cbor hoặc entity_serialize_topology_router_leader_cbor theo role), entity_serialize_state_cbor → POST /device/update/topology, POST /device/update/state; register fail thì retry (2s). device_coap: POST /device/register/info, POST /device/register/entity, GET /device/ping; token 2B, lock; response handler register/entities; ping timestamp → callback re-register.
- **Backend communication trong thread_node**: Khi `enable_device_registry`: thread_node gọi thread_discovery_init(), discovery lần đầu, tạo task discovery (delay 10s khi chưa có backend, 60s khi đã có; thread_discovery_get_endpoint, so sánh addr/port, chỉ cập nhật và log khi đổi), task ping 10s (device_registry_ping → device_coap_ping; nếu response timestamp khác → callback → backend_trigger_register). App (main.c) không gọi discovery/register/ping; chỉ implement on_joined (device_model, entity, entity_coap_server_start).
- **GET /device/ping**: Node gửi GET /device/ping mỗi 10s; backend reply 4-byte timestamp (LE). Nếu timestamp khác lần trước → node gửi lại POST /device/register (backend restart / re-register).
- **CoAP token**: Mọi request (register, ping) dùng CoAP token 2 byte (trong device_coap); tái sử dụng cho resource CoAP khác sau này.
- **Backend discovery log**: Log backend IP **1 lần** khi có IP, **log lại khi IP thay đổi**. thread_node log INFO "Backend discovered" / "Backend endpoint updated". thread_discovery: "Discovered backend via SRP", "Using cached SRP backend endpoint", "Using static backend endpoint from NVS" chuyển sang LOGD để tránh spam.
- **Discovery retry khi chưa có backend**: Task refresh dùng delay **10s** khi `!s_backend_ep_valid`, **60s** khi đã có backend (DEFAULT_DISCOVERY_RETRY_MS / DEFAULT_DISCOVERY_REFRESH_MS) — tránh đợi 60s mới retry lần đầu.
- **sys_evt stack overflow**: Handler OpenThread event (on_openthread_event: update_attached_led_role, log_leader_data) chạy trong task "sys_evt"; mặc định stack 2048 gây Stack protection fault. **light_on_off** đặt CONFIG_ESP_SYSTEM_EVENT_TASK_STACK_SIZE=4096 trong sdkconfig.defaults.
- **Log node IPv6 khi join xong**: Trong on_joined_wrapper, log Mesh-Local EID (otThreadGetMeshLocalEid) và RLOC16 (otThreadGetRloc16) ngay sau khi có instance.
- **CoAP response / callback**: Backend phải **echo đúng CoAP token** từ request sang response (RFC 7252) thì OpenThread mới gọi response handler. thread_node gọi device_registry_register(ep, **NULL**, NULL) nên không có callback khi register xong. Ping callback (backend_on_ping_timestamp_changed) chỉ gọi khi **timestamp trong response thay đổi** so với lần trước (lần đầu nhận ping không gọi). Backend ping reply: **2.05 Content**, payload 4 byte timestamp LE.
- **device_registry_is_registered()**: true khi Backend đã ACK (2.01/2.04/2.05) ít nhất một lần.
- **Entity restore_mode (key 13)**: Trong register/entity payload, mỗi entity map gửi thêm key 13 = restore_mode (uint). Backend dùng cho mergeEntity. Node: `cbor_register_keys.h` có `CBOR_K_ENT_RESTORE_MODE 13`; `serialize_light_entity` và `serialize_sensor_entity` encode key 13 với giá trị mặc định 0 (entity model chưa có trường restore_mode). Sau có thể thêm vào entity_base_t và đọc từ struct.
- **Topology role-based + key 6 (neighbors):** Child gửi keys 0–5 (mac, rloc16, role=0, parent_rloc16, parent_rssi, parent_lq); Router/Leader gửi keys 0,1,2,6 (mac, rloc16, role, array TopologyNeighbor). Hai API: `entity_serialize_topology_child_cbor`, `entity_serialize_topology_router_leader_cbor`; `entity_serialize_topology_cbor` đã xóa. device_registry branch theo role; router/leader thu thập neighbors qua `otThreadGetNextNeighborInfo`. cbor_register_keys.h: key 6 + neighbor keys 0–4; struct `topology_neighbor_t` trong entity_serialization.h. Docs: thread_node_coap.md đã ghi otThreadGetNextNeighborInfo cho key 6.

**Build warnings (tùy chọn xử lý):** `entity_serialization.c`: `cbor_start_map` defined but not used; `device_registry.c` trong `try_send_register`: biến `parent_rloc16` unused (register/info không dùng parent, chỉ topology dùng).

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
| `components/device/device_registry.c/.h` | ✅ | Build device-only + entities; register → send_register rồi send_entities (liên tiếp); ping/is_registered |
| `components/device/device_coap.c/.h` | ✅ | CoAP: send_register, send_entities, ping; token 2B; response handlers; timestamp → callback re-register |
| `components/thread/thread_coap.c/.h` | ✅ | Shared CoAP server manager |
| `components/entity/coap_server/entity_coap_server.c` | ❌ Stub | 5.01 |
| `components/entity/serialization/entity_serialization.c` | ⚠️ Partial | entity_serialize_info_cbor, entity_serialize_entities_cbor, topology **role-based** (entity_serialize_topology_child_cbor, entity_serialize_topology_router_leader_cbor; key 6 neighbors cho router/leader), entity_serialize_state_cbor; light+sensor encode keys 0–13 (restore_mode); switch/fan/climate/binary_sensor chưa |
| `examples/light_on_off/main/main.c` | ✅ | thread_node_start; on_joined chỉ setup device + entities + entity_coap_server_start |

## Docs

- **Node-side register flow:** `docs/README.md` (hai request: register rồi entities; serialization + transport).
- **Backend contract (payload, response):** repo root `Documents/coap/border_router_coap_server.md`.

## Các bước tiếp theo

1. Implement entity_coap_server handlers (GET/PUT entities).
2. Hoàn thiện CBOR cho switch, fan, climate, binary_sensor.
3. Thêm examples (sensor, switch).
4. Quyết định main/main.c template.
