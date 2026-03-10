# Thread-Node — Docs

## Device register flow (Node → Backend)

Node gửi **hai request** khi đăng ký (sau discovery hoặc khi ping phát hiện backend đổi), **align contract backend**:

1. **POST /device/register/info**  
   Payload CBOR: **chỉ keys 0–7** (device info, không có key 8 topology).  
   Build: `entity_serialize_register_info_cbor(buffer, size)`.

2. **POST /device/register/entity**  
   Payload CBOR: map **key 7** = mac_address, **key 9** = array entities.  
   Build: `entity_serialize_entities_cbor(buffer, size)`.

Register/info gửi trước; **chờ response thành công** (retry 2s nếu fail) rồi mới gửi register/entity. Cả hai dùng CoAP confirmable và có response handler; Backend phải **echo CoAP token** trong response (RFC 7252).

- **Serialization:** `components/entity/serialization/entity_serialization.c` (`entity_serialize_register_info_cbor`, `entity_serialize_entities_cbor`).
- **Transport:** `components/device/device_coap.c` (`device_coap_send_register`, `device_coap_send_entities`).
- **Orchestration:** `components/device/device_registry.c` (`device_registry_register`).

## Backend contract

Backend cần implement hai endpoint và parse CBOR đúng format trên. Chi tiết payload (key số, type, entity map format) và response: xem **`Documents/coap/border_router_coap_server.md`** (trong repo HomeThread). Luồng đầy đủ (discovery, ping, register, entities) từ góc nhìn Node: **`Documents/coap/thread_node_coap.md`**.
