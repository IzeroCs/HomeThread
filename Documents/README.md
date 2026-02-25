# HomeThread — Documents

Tài liệu kỹ thuật chung cho toàn bộ project HomeThread (bao gồm **Dashboard-Thread** và **ESP-Thread**).

---

## Cấu trúc

```
Documents/
├── protocol/                    # Giao thức giao tiếp (USB CDC Frame)
│   ├── usb_cdc_frame_structure.md   # Cấu trúc frame, bảng CMD, CRC8, error codes
│   └── table_data_format.md         # Binary format Router/Child/Joiner Table
│
├── iot-entity-model/            # IoT Entity Model
│   ├── entity_model_specification.md  # Firmware spec (ESP-IDF + OpenThread)
│   └── entity_model_schema.md         # SQLite schema (backend / border router)
│
├── coap/                        # CoAP docs (ESP-IDF + OpenThread)
│   ├── border_router_coap_server.md   # CoAP server BR (device registry)
│   ├── leader_stop_command_coap.md    # Leader Control (GET /network)
│   └── coap_client_snippet.md         # Snippet CoAP client thuần (tham khảo)
│
└── dashboard/                   # Dashboard-Thread specific
    └── migration_to_frame_protocol.md  # Migration CLI → Frame, tiến độ và kiến trúc
```

---

## Tài liệu theo chủ đề

### Giao thức USB CDC Frame

| Tài liệu | Mô tả |
|----------|-------|
| [protocol/usb_cdc_frame_structure.md](protocol/usb_cdc_frame_structure.md) | Cấu trúc khung SOF/Frame ID/CMD/LEN/DATA/CRC8/EOF; bảng CMD; error codes; ví dụ |
| [protocol/table_data_format.md](protocol/table_data_format.md) | Binary format cho Router Table (15B/entry), Child Table (17B/entry), Joiner Table (variable) |

### IoT Entity Model

| Tài liệu | Mô tả |
|----------|-------|
| [iot-entity-model/entity_model_specification.md](iot-entity-model/entity_model_specification.md) | Entity model cho firmware (ESP-IDF): struct-based, event-driven, API, validation; **device info**: strings (manufacturer, model, device_name) + numbers (device_type, sw_version, hw_version) |
| [iot-entity-model/entity_model_schema.md](iot-entity-model/entity_model_schema.md) | SQLite schema cho backend/border router: devices (sw_version, hw_version int), entities, entity_*, sensor_history, events |

### CoAP (ESP-IDF + OpenThread)

| Tài liệu | Mô tả |
|----------|-------|
| [coap/border_router_coap_server.md](coap/border_router_coap_server.md) | CoAP server trên BR: device registry, resources /device/register; **ACK/NACK bắt buộc** cho mọi message Node → Leader |
| [coap/leader_stop_command_coap.md](coap/leader_stop_command_coap.md) | Leader Control: GET /network, response copy token, gửi response trước khi stop |
| [coap/coap_client_snippet.md](coap/coap_client_snippet.md) | Snippet CoAP client thuần: NON-CONFIRMABLE GET /ping đến Leader RLOC |

### Dashboard-Thread

| Tài liệu | Mô tả |
|----------|-------|
| [dashboard/migration_to_frame_protocol.md](dashboard/migration_to_frame_protocol.md) | Migration từ CLI sang Frame Protocol: tiến độ, kiến trúc, các bước còn lại |
