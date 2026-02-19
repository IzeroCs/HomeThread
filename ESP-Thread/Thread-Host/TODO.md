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
