# Border Router CoAP Server - Device Registry

## Tổng quan

CoAP server trên BR (port 5683) nhận đăng ký từ child devices. Trong project: **device_registry_server** + **device_registry_handler** (handler chung cho 3 resource).

## Resources

| Path | Mô tả |
|------|--------|
| `/device/register` | Đăng ký device (payload: rloc16, ml_eid, parent, entity_model…) |
| `/device/update` | Cập nhật (cùng handler, logic chung) |
| `/device/ping` | Ping (cùng handler, logic chung) |

Payload dạng text, ví dụ: `rloc16=0x7c01`, `ml_eid=...`, `parent=0x1001`, `entity_id=... type=... name=...`. Handler enqueue vào queue, process & output (ví dụ qua UART). Response: 2.01 Created hoặc 4.00/5.03 khi lỗi.

## Địa chỉ Leader

Child gửi đến **Leader ALOC** (0xfc00): `mesh_prefix + 0000:00ff:fe00:fc00`. Hoặc dùng `otThreadGetLeaderRloc()` để lấy Leader RLOC. Không hardcode RLOC16 = 0x0000.

## Border Router phải là Leader

CoAP server chạy trên BR; child gửi đến Leader ALOC → message tới Leader hiện tại. **Nếu BR không phải Leader** thì message tới Leader cũ → không xử lý được. Thiết kế: BR form network trước (Leader), Router khác join với weight thấp (0 hoặc -16). BR cấu hình `mLeaderWeightAdjustment = +16`.

## Files trong project

- `main/coap_controller/device_registry_server.c` — init CoAP, đăng ký 3 resource, handler chung.
- `main/coap_controller/device_registry_handler.c` — queue, enqueue, process_and_clear; API: `device_registry_handler_init()`, `device_registry_enqueue_coap_data()`, `device_registry_process_and_clear_queue()`.
- `br_custom_config.h` — bật CoAP API.

Liên quan: Leader Control (GET `/network`) — xem **leader_stop_command_coap.md**.
