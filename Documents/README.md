# Thread-Node — Docs

## Device register flow (Node → Backend)

Node gửi **hai request** khi đăng ký (sau discovery hoặc khi ping phát hiện backend đổi):

1. **POST /device/register**  
   Payload CBOR: **chỉ keys 0–8** (device + network).  
   Build: `entity_serialize_device_cbor(rloc16, ml_eid_str, parent_rloc16, buffer, size)`.

2. **POST /device/entities**  
   Payload CBOR: map với **key 0** = device_id, **key 9** = array entities.  
   Build: `entity_serialize_entities_cbor(buffer, size)`.

Register gửi trước; **chờ response thành công** (retry 2s nếu fail) rồi mới gửi entities. Cả hai dùng CoAP confirmable và có response handler; Backend phải **echo CoAP token** trong response (RFC 7252).

- **Serialization:** `components/entity/serialization/entity_serialization.c` (helper `encode_device_and_network`, `entity_serialize_device_cbor`, `entity_serialize_entities_cbor`).
- **Transport:** `components/device/device_coap.c` (`device_coap_send_register`, `device_coap_send_entities`).
- **Orchestration:** `components/device/device_registry.c` (`device_registry_register`).

## Backend contract

Backend cần implement hai endpoint và parse CBOR đúng format trên. Chi tiết payload (key số, type, entity map format) và response: xem **`Documents/coap/border_router_coap_server.md`** (trong repo HomeThread). Luồng đầy đủ (discovery, ping, register, entities) từ góc nhìn Node: **`Documents/coap/thread_node_coap.md`**.
