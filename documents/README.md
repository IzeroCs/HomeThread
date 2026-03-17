# Namorix Thread — Tài liệu hệ thống

Tài liệu kiến trúc cho hệ thống **Namorix Thread** gồm ba thành phần chính:

- **Firmware (Endpoint):** Firmware thiết bị endpoint (ESP-IDF + OpenThread). Giao tiếp với Backend qua CoAP/IPv6.
- **Firmware (BR Host):** Border Router Host (ESP32-S3), backhaul Ethernet W5500. Kênh quản lý qua TCP frame protocol.
- **Dashboard:** Node.js/SQLite backend nhận CoAP từ endpoint; frontend Lit/Web Components.

## Sơ đồ kiến trúc

```
                    [Dashboard Frontend]
                           |
                    [Backend Node.js]
                           | WebSocket / REST
                           | CoAP UDP 5683 ← Thread-Node gửi trực tiếp
                           | TCP :5000     ← frame protocol quản lý BR
                           v
  [Thread-Node] --Thread mesh--> [BR / Thread-Host] --Ethernet--> [LAN/Router]
      |                                    |
      +-- CoAP register/update/ping -------+-----------> Backend
      +-- SRP browse (_dashboard._udp) --> BR SRP server
```

> Thread-Node gửi register/update/ping **trực tiếp tới Backend** qua IPv6. BR **không** làm proxy; BR chỉ route IP và cung cấp kênh quản lý (TCP frame).

## Danh mục tài liệu

| File | Nội dung |
|------|----------|
| [architecture/real_br_integration.md](architecture/real_br_integration.md) | Kiến trúc BR thật, tích hợp Dashboard và Thread-Node, troubleshooting routing |
| [protocol/usb_cdc_frame_structure.md](protocol/usb_cdc_frame_structure.md) | Frame protocol BR ↔ Dashboard (TCP), CMD table, CRC8, error codes |
| [protocol/table_data_format.md](protocol/table_data_format.md) | Binary format Router/Child/Joiner Table |
| [coap/device_payload_spec.md](coap/device_payload_spec.md) | **Spec chính:** CoAP endpoints, CBOR payload keys, DB schema, flow đăng ký |
| [coap/backend_discovery_srp.md](coap/backend_discovery_srp.md) | SRP/DNS-SD discovery backend từ Thread-Node |
| [entity-model/entity_model_specification.md](entity-model/entity_model_specification.md) | Firmware entity model (ESP-IDF): struct, API, event system |
| [installation.md](installation.md) | Setup Linux host: nhận route IPv6 từ BR qua RA/RIO |
| [websocket.md](websocket.md) | Backend WebSocket server, handler modules, event routing |

## Luồng đăng ký thiết bị (tóm tắt)

1. Thread-Node join mạng → browse SRP `_dashboard._udp` → lấy Backend IP:port.
2. **POST /device/register/info** (CBOR, keys 0–6) → chờ 2.01/2.04, retry nếu fail.
3. **POST /device/register/entity** (key 0 = mac, key 1 = array entities) → nhận restore state (key 10).
4. Định kỳ: **GET /device/ping?mac=** (heartbeat + restart detection), **POST /device/update/topology**, **POST /device/update/state**.

Chi tiết đầy đủ: [coap/device_payload_spec.md](coap/device_payload_spec.md).
