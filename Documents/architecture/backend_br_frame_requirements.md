## Dashboard-Thread Backend — BR frame requirements

> Mục đích: checklist “backend cần làm gì” khi kết nối tới BR (Thread-Host) qua TCP frame protocol.

### Kết nối
- **TCP** tới `BR_IP:5000` (hoặc port cấu hình trong menuconfig BR).
- Giao thức frame: xem `docs/protocol/usb_cdc_frame_structure.md`.

### Keepalive bắt buộc (tránh BR tự restart)
BR có **state watchdog**: nếu backend không gửi `CMD_STATE` định kỳ, BR sẽ coi như mất kết nối và **tự restart**.

- **Backend phải gửi** `CMD_STATE` theo interval phù hợp với watchdog (mặc định BR check mỗi 15s, miss 5 lần).
- Khi backend gửi `CMD_STATE`, BR trả `CMD_ACK` với **1 byte role**.

### ACK bắt buộc cho `CMD_IP_ADDR` (tránh BR retry)
`CMD_IP_ADDR` có cơ chế xác nhận riêng:

- Backend gửi `CMD_IP_ADDR` (LEN=0)
- BR trả `CMD_ACK` kèm **16 bytes** (Leader RLOC)
- **Backend phải gửi lại** một frame `CMD_ACK` **LEN=0** với **cùng Frame ID** để BR dừng retry.

### Polling (hiện trạng) và giảm polling (roadmap)
- **Hiện trạng:** backend thường pull:
  - `CMD_STATE` (keepalive)
  - `CMD_DATASET_ACTIVE`, `CMD_IP_ADDR` khi cần
  - `CMD_ROUTER_TABLE / CMD_CHILD_TABLE / CMD_JOINER_TABLE` khi UI cần refresh
- **Roadmap:** BR đã có OpenThread change detector (callback → debounce → snapshot diff) nhưng **chưa push notify**. Khi có notify, backend sẽ:
  - nhận bitmask “đã thay đổi gì”
  - chỉ pull những bảng/field tương ứng
  - giảm polling định kỳ

### Gợi ý thực tế để giảm traffic ngay (không cần thay đổi BR)
- Giữ `CMD_STATE` làm keepalive (theo watchdog).
- Chỉ pull tables khi:
  - UI đang mở tab tương ứng, hoặc
  - user bấm refresh, hoặc
  - vừa thực hiện action có khả năng đổi bảng (commissioner add joiner, thread start/stop, set_*).

