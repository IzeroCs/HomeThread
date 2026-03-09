# HomeThread — Documents

Tài liệu kỹ thuật chung cho toàn bộ project HomeThread (bao gồm **Dashboard-Thread** và **ESP-Thread**).

---

## Cấu trúc

```
Documents/
├── architecture/                # Kiến trúc BR thật (Thread-Node & Dashboard tích hợp)
│   └── real_br_integration.md      # BR thật: Dashboard↔BR qua TCP; Child↔Backend trực tiếp
│
├── protocol/                    # Giao thức frame (BR ↔ Dashboard)
│   ├── usb_cdc_frame_structure.md   # Cấu trúc frame, bảng CMD, CRC8 (transport: TCP)
│   └── table_data_format.md         # Binary format Router/Child/Joiner Table
│
├── iot-entity-model/            # IoT Entity Model
│   ├── entity_model_specification.md  # Firmware spec (ESP-IDF + OpenThread)
│   └── entity_model_schema.md         # SQLite schema (backend / border router)
│
└── coap/                        # CoAP docs (ESP-IDF + OpenThread)
    ├── border_router_coap_server.md   # Payload format; Backend nhận register từ Child
    ├── backend_discovery_srp.md      # Thread-Node SRP/DNS-SD backend discovery
    └── coap_client_snippet.md         # Snippet CoAP client thuần (tham khảo)
```

---

## Tài liệu theo chủ đề

### Kiến trúc BR thật (Phase 2)

| Tài liệu | Mô tả |
|----------|-------|
| [architecture/real_br_integration.md](architecture/real_br_integration.md) | Hướng dẫn tích hợp: Dashboard kết nối BR qua TCP (frame); Thread-Node gửi register/update/ping thẳng Backend |

### Giao thức Frame (BR ↔ Dashboard)

| Tài liệu | Mô tả |
|----------|-------|
| [protocol/usb_cdc_frame_structure.md](protocol/usb_cdc_frame_structure.md) | Cấu trúc khung SOF/Frame ID/CMD/LEN/DATA/CRC8/EOF; transport TCP; bảng CMD; error codes |
| [protocol/table_data_format.md](protocol/table_data_format.md) | Binary format cho Router Table (15B/entry), Child Table (17B/entry), Joiner Table (variable) |

### IoT Entity Model

| Tài liệu | Mô tả |
|----------|-------|
| [iot-entity-model/entity_model_specification.md](iot-entity-model/entity_model_specification.md) | Entity model cho firmware (ESP-IDF): struct-based, event-driven, API, validation; **device info**: strings (manufacturer, model, device_name) + numbers (device_type, sw_version, hw_version) |
| [iot-entity-model/entity_model_schema.md](iot-entity-model/entity_model_schema.md) | SQLite schema cho backend/border router: devices (sw_version, hw_version int), entities, entity_*, sensor_history, events |

### CoAP (ESP-IDF + OpenThread)

| Tài liệu | Mô tả |
|----------|-------|
| [coap/border_router_coap_server.md](coap/border_router_coap_server.md) | Device registry (legacy trên BR; **hiện Backend** nhận register từ Child). Payload format, ACK/NACK. |
| [coap/backend_discovery_srp.md](coap/backend_discovery_srp.md) | Thread-Node: Backend discovery qua SRP/DNS-SD (_dashboard._udp.default.svc.arpa), cấu hình DNS client, otDnsServiceInfo (mHostNameBuffer), phụ thuộc BR SRP đăng ký service. |
| [coap/coap_client_snippet.md](coap/coap_client_snippet.md) | Snippet CoAP client thuần: NON-CONFIRMABLE GET /ping đến Leader RLOC |
