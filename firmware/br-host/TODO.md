# TODO - Thread Border Router

## Auto-flash RCP firmware khi boot

Tính năng: Tự động flash firmware RCP khi BR boot nếu RCP chưa có firmware.

### Các bước cần làm:

1. **Thêm partition rcp_fw vào partitions.csv** để lưu firmware RCP (SPIFFS)
   - Partition type: `data`, subtype: `spiffs`
   - Size: khoảng 640K

2. **Tạo SPIFFS image cho partition rcp_fw** từ thư mục `rcp_fw/` trong CMakeLists.txt
   - Sử dụng `spiffs_create_partition_image(rcp_fw ...)`
   - Đặt binary RCP trong `rcp_fw/` với tên `ot_rcp`

3. **Thêm hàm kiểm tra RCP có firmware hay chưa**
   - Gửi lệnh ping/version qua UART và đợi response
   - Nếu không có response sau timeout → RCP chưa có firmware hoặc không kết nối

4. **Thêm hàm mount SPIFFS partition rcp_fw và đọc file firmware RCP**
   - Mount partition `rcp_fw` với `esp_vfs_spiffs_register()`
   - Đọc file `/rcp_fw/ot_rcp` vào buffer

5. **Thêm hàm flash firmware RCP qua UART**
   - Dùng `esp-serial-flasher` hoặc implement esptool protocol
   - Cần control GPIO RESET và BOOT của RCP để đưa vào download mode
   - Flash firmware qua UART với baudrate phù hợp (115200 cho download, 460800 cho runtime)

6. **Tích hợp vào br_main.c**
   - Kiểm tra và flash RCP trước khi khởi động OpenThread
   - Flow: mount SPIFFS → kiểm tra RCP → nếu cần thì flash → khởi động OpenThread

7. **Thêm config Kconfig cho enable/disable tính năng auto-flash RCP**
   - Config `CONFIG_AUTO_FLASH_RCP_ON_BOOT` (default: y)
   - Có thể tắt nếu không muốn auto-flash

### Lưu ý:

- Cần GPIO RESET và BOOT của RCP để control download mode
- Firmware RCP phải được build và đặt trong `rcp_fw/ot_rcp` trước khi build BR
- Có thể dùng component `esp-serial-flasher` hoặc implement riêng esptool protocol

---

## Frame protocol (BR ↔ dashboard qua TCP)

Tính năng: Giao tiếp với dashboard qua **TCP** (BR listen port, dashboard kết nối BR_IP:port) theo cấu trúc khung định nghĩa trong [documents/protocol/usb_cdc_frame_structure.md](../../documents/protocol/usb_cdc_frame_structure.md).

### Đã có

- **Transport TCP** (transport_tcp.c): BR listen port (menuconfig), accept 1 client, init/send/deinit, RX task gọi callback.
- **Parser/Serializer khung** (communicate.c): parse SOF…EOF, CRC8/MAXIM, `communicate_init()`, `communicate_send_frame()`.
- **communicate_task** (communicate_task.c): `communicate_task_start()` — init communicate + queue + RX callback; RX: STATE từ backend → ACK + 1 byte role, lệnh khác → NACK (0x01); state watchdog: mỗi 15s check, không nhận state trong 5 lần → esp_restart(). Backend pull định kỳ; BR không push.
- **communicate_queue** (communicate_queue.c): queue frame, process task **comm_proc** gọi command handler; stack **4096** bytes (`PROCESS_TASK_STACK`); gửi vào queue timeout 500 ms (queue đầy thì trả ESP_ERR_TIMEOUT, RX gửi NACK 0x05 Busy); log cảnh báo khi item chờ xử lý &gt; 2 s. **Stack monitor:** mỗi 30 s log high water mark (bytes còn lại tối thiểu) và ước lượng stack đã dùng — xem serial monitor tag `communicate_queue`.
- **communicate_task** (communicate_task.c): state watchdog task **state_wdg**, stack **4069** bytes (`STATE_WATCHDOG_TASK_STACK`); **stack monitor:** mỗi ~30 s log high water mark — tag `communicate_task`. RX callback + state watchdog (15s, 5 lần miss → restart) như trên.
- **communicate_command** (communicate_command.c): handler CMD_STATE, DATASET_ACTIVE, IP_ADDR (cache leader RLOC), SET_PANID/CHANNEL/NETWORK_NAME/EXTENDED_PANID/NETWORK_KEY, ROUTER/CHILD/JOINER_TABLE, THREAD_START, THREAD_STOP, THREAD_VERSION. OpenThread lock, trả ACK/NACK. Format table: xem [documents/protocol/table_data_format.md](../../documents/protocol/table_data_format.md). **Ghi chú stack:** OpenThread không công bố stack cần cho `otIp6SetEnabled`/`otThreadSetEnabled`; nên theo dõi high water mark của **comm_proc** để chỉnh `PROCESS_TASK_STACK` nếu cần.

### Cấu trúc khung (tóm tắt)

- **SOF** 0xAA | **Frame ID** (1 byte) | **CMD** (1 byte) | **LEN** (2 bytes big-endian, max 2048) | **DATA** | **CRC8** | **EOF** 0x55
- **CRC8:** CRC-8/MAXIM (poly 0x31, init 0x00) trên `[Frame ID, CMD, LEN_HIGH, LEN_LOW, DATA...]`

### Các bước còn lại (ESP32 – BR)

1. **Xử lý CMD (Pull từ Node → ESP32)** — đã có trong communicate_command + communicate_queue
   - **CMD_STATE (0x12):** Backend gửi interval để check; ESP trả CMD_ACK + 1 byte role. ✅
   - **CMD_RESET (0x10):** Reset thiết bị; trả CMD_ACK rồi sau 2s dừng Thread + restart. ✅
   - **CMD_FACTORY (0x11):** Factory reset; trả CMD_ACK rồi sau 2s xóa NVS partition (raw erase) + restart. ✅
   - **CMD_DATASET_ACTIVE (0x13):** Đọc Active Dataset; trả CMD_ACK + TLV binary. ✅
   - **CMD_IP_ADDR (0x14):** Đọc IPv6 leader; trả CMD_ACK + 16 bytes. ✅
   - **CMD_ROUTER_TABLE (0x30):** Đọc Router Table; trả CMD_ACK + table data (count + entries). ✅
   - **CMD_CHILD_TABLE (0x31):** Đọc Child Table; trả CMD_ACK + table data (count + entries). ✅
   - **CMD_JOINER_TABLE (0x32):** Đọc Joiner Table; trả CMD_ACK + table data (count + variable entries). ✅
   - **CMD_THREAD_START (0x40):** Bật IPv6 + Thread; trả CMD_ACK. ✅
   - **CMD_THREAD_STOP (0x41):** Tắt Thread + IPv6; trả CMD_ACK. ✅
   - **CMD_THREAD_VERSION (0x42):** Trả CMD_ACK + chuỗi version OpenThread (UTF-8). ✅
   - **CMD_COMMISSIONER_JOINER (0x43):** Thêm joiner vào commissioner; DATA = EUI64(8) + PSKD_len(1) + PSKD(1–32) + Timeout(4 big-endian, giây); EUI64 all-zero = wildcard; tự động start commissioner nếu chưa active; trả CMD_ACK hoặc CMD_NACK (0x02 not ready, 0x04 invalid param). ✅

2. **Phản hồi Pull (ACK/NACK)**
   - Luôn echo **cùng Frame ID** trong CMD_ACK/CMD_NACK.
   - CMD_NACK: DATA = 1 byte error code (Invalid CMD 0x01, Not ready 0x02, Timeout 0x03, Invalid param 0x04, Busy 0x05).

3. **Push (ESP32 → Node)**
   - **CMD_DATA (0x01):** Mã CMD vẫn trong protocol; **đã bỏ** logic BR gửi CMD_DATA và chờ ACK (Phase 1). Child gửi thẳng backend trong mô hình BR thật.

   ~~**Device Registry (CoAP → USB frame)**~~ **Đã bỏ (Phase 1)** — BR không còn CoAP server /device/register|update|ping; không forward lên backend. Child gửi trực tiếp tới backend (CoAP/HTTP tới IP).

4. **Push system health (ESP32 → Node)** ❌ Chưa làm
   - **CMD_SYS_HEALTH (TBD):** Push định kỳ (hoặc khi backend pull) thông tin sức khoẻ hệ thống để backend/Node monitor từ xa.
   - **Payload dự kiến:**
     - Stack high water mark của từng task (bytes còn lại tối thiểu): `comm_queue`, `comm_task`, `boot_btn`, `led_status`, `usb_rx`, `stk_mon`
     - Heap free hiện tại (bytes)
     - Heap min free từ trước đến giờ (bytes)
   - **Nguồn dữ liệu:** `uxTaskGetStackHighWaterMark()` + `esp_get_free_heap_size()` + `esp_get_minimum_free_heap_size()` — đã có trong `stack_monitor_task` ở `br_main.c`.
   - **Hướng triển khai:** Thêm handler `communicate_command_handle_sys_health()` trong `communicate_command.c`; backend pull theo interval hoặc ESP push khi heap thấp.

### CMD_IP_ADDR: Leader RLOC vs RLOC của thiết bị (BR)

**Hiện trạng:** `communicate_command_handle_ipaddr` trả về **RLOC của Leader** (16 byte IPv6, luôn dạng `...:fe00:0` vì Leader có RLOC16 = 0). Đây là hành vi đúng theo spec Thread.

**Vấn đề:** Khi chạy `ot ipaddr` trên BR, danh sách địa chỉ có RLOC của **chính BR** (vd. `...:fe00:8c00`). Backend/dashboard có thể cần hiển thị **IP của host (BR)** chứ không phải IP của Leader.

**Cân nhắc (TODO):**

- [ ] Thêm command/API riêng (hoặc mở rộng CMD_IP_ADDR) để backend có thể pull **RLOC của chính thiết bị BR** (local device), ví dụ dùng `otThreadGetRloc()` / `otIp6GetUnicastAddresses` cho RLOC của BR.
- [ ] Cập nhật spec frame (usb_cdc_frame_structure.md) và backend nếu thêm command mới hoặc format payload mới (vd. CMD_IP_ADDR trả 2 địa chỉ: leader 16 byte + local 16 byte, hoặc CMD_LOCAL_IP / CMD_BR_RLOC riêng).

### Lưu ý

- SOF/EOF không escape; parser dựa vào LEN để biết độ dài DATA (trong DATA có thể chứa mọi byte).
- PAN ID hợp lệ: 0x0000–0xFFFE (0xFFFF là broadcast).
- Chi tiết bảng CMD, error codes: xem [documents/protocol/usb_cdc_frame_structure.md](../../documents/protocol/usb_cdc_frame_structure.md).
- Format dữ liệu cho Router/Child/Joiner Table: xem [documents/protocol/table_data_format.md](../../documents/protocol/table_data_format.md).
