# communicate

Kết nối frame (SOF/Frame ID/CMD/LEN/DATA/CRC8/EOF) trên UART hoặc USB CDC. Cấu hình chọn port nào là **log** (esp_log/console), port nào là **frame**.

## Transport

- **Transport USB CDC** (transport_usb): đã dùng trên Thread-Host; frame trên USB Serial/JTAG, log trên UART.
- **Transport UART** (transport_uart): code đã có; **sẽ phát triển tiếp sau** (ví dụ menuconfig, board khác). Khi `COMMUNICATE_FRAME_PORT_IS_UART = 1`, frame chạy trên UART.

## Cấu hình

- **`communicate_config.h`**
  - `COMMUNICATE_FRAME_PORT_IS_UART = 1`: frame trên UART, log trên CDC (hoặc UART tùy sdkconfig).
  - `= 0`: frame trên CDC, log trên UART (mặc định trên Thread-Host).
  - Khi frame = UART: chỉnh `COMMUNICATE_UART_NUM`, `COMMUNICATE_UART_TX_GPIO`, `COMMUNICATE_UART_RX_GPIO`, baud theo board.

- **Log port** do sdkconfig quyết định (CONFIG_ESP_CONSOLE_*). Để CDC = log: primary console = USB Serial/JTAG. Để UART = log: primary console = UART.

## API

- `communicate_init(rx_cb, rx_ctx)`: khởi tạo transport (UART hoặc USB CDC), bắt đầu nhận frame; khi có frame hợp lệ gọi `rx_cb(frame_id, cmd, data, len, ctx)`.
- `communicate_send_frame(frame_id, cmd, data, len)`: gửi một frame (CRC8/SOF/EOF tự thêm).

**communicate_task** (Thread-Host): main gọi `communicate_task_start()` — init communicate + queue + RX callback (STATE→ACK, lệnh khác→NACK) + state watchdog (backend gửi STATE interval; không nhận state trong 5 lần × 15s → restart). **Push BR→backend:** khi OpenThread role thay đổi (`br_state_change`), BR gửi CMD_STATE với 1 byte (0=disabled..4=leader); không nhận ACK trong 1s thì gửi lại. **communicate_queue:** timeout gửi 500 ms (queue đầy → NACK 0x05 Busy), log khi item chờ xử lý &gt; 2 s. File: `communicate_task.c`, `communicate_queue.c`, header: `communicate_task.h`, `communicate_queue.h`.
