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

## USB CDC Frame (Custom frames qua USB)

Tính năng: Giao tiếp với Node/backend qua USB CDC theo cấu trúc khung định nghĩa trong [docs/usb_cdc_frame_structure.md](docs/usb_cdc_frame_structure.md).

### Cấu trúc khung (tóm tắt)

- **SOF** 0xAA | **Frame ID** (1 byte) | **CMD** (1 byte) | **LEN** (2 bytes big-endian, max 2048) | **DATA** | **CRC8** | **EOF** 0x55
- **CRC8:** CRC-8/MAXIM (poly 0x31, init 0x00) trên `[Frame ID, CMD, LEN_HIGH, LEN_LOW, DATA...]`

### Các bước cần làm (ESP32 – BR)

1. **Parser/Serializer khung**
   - Parse từ stream: tìm SOF 0xAA, đọc Frame ID, CMD, LEN (big-endian), DATA (LEN bytes), CRC8, EOF 0x55. Chỉ chấp nhận LEN ≤ 2048.
   - Serialize khung khi gửi: SOF, Frame ID, CMD, LEN_HIGH, LEN_LOW, DATA, CRC8, EOF.

2. **CRC8**
   - Implement CRC-8/MAXIM (poly 0x31, init 0x00); dùng chung cho tính và kiểm tra.

3. **Xử lý CMD (Pull từ Node → ESP32)**
   - **CMD_PING (0x04):** Trả CMD_ACK, Frame ID echo.
   - **CMD_RESET (0x10):** Reset thiết bị; trả CMD_ACK.
   - **CMD_FACTORY (0x11):** Factory reset (DATA = 0xAA); trả CMD_ACK hoặc CMD_NACK (invalid param nếu thiếu 0xAA).
   - **CMD_NETWORK_NAME (0x12):** Đọc tên mạng Thread; trả CMD_ACK + chuỗi UTF-8 (1–16 bytes).
   - **CMD_PAN_ID (0x13):** Đọc PAN ID; trả CMD_ACK + 2 bytes [PAN_HIGH, PAN_LOW].
   - **CMD_CHANNEL (0x14):** Đọc Channel; trả CMD_ACK + 1 byte (11–26).
   - **CMD_DATASET_ACTIVE (0x15):** Đọc Active Dataset; trả CMD_ACK + TLV binary.
   - **CMD_IP_ADDR (0x16):** Đọc IPv6 leader; trả CMD_ACK + 16 bytes.

4. **Phản hồi Pull (ACK/NACK)**
   - Luôn echo **cùng Frame ID** trong CMD_ACK/CMD_NACK.
   - CMD_NACK: DATA = 1 byte error code (Invalid CMD 0x01, Not ready 0x02, Timeout 0x03, Invalid param 0x04, Busy 0x05).

5. **Push (ESP32 → Node)**
   - **CMD_DATA (0x01):** Gửi CBOR từ child/router lên Node; tăng Frame ID cho mỗi khung.

6. **USB CDC + FreeRTOS**
   - Dùng 2 task: một cho TX, một cho RX (hoặc một task RX + queue sang task xử lý) để xử lý đồng thời.
   - USB CDC trên ESP32-S3: cấu hình USB CDC trong sdkconfig (không dùng cho console), đọc/ghi qua driver CDC.

### Lưu ý

- SOF/EOF không escape; parser dựa vào LEN để biết độ dài DATA (trong DATA có thể chứa mọi byte).
- PAN ID hợp lệ: 0x0000–0xFFFE (0xFFFF là broadcast).
- Chi tiết bảng CMD, error codes: xem [docs/usb_cdc_frame_structure.md](docs/usb_cdc_frame_structure.md).
