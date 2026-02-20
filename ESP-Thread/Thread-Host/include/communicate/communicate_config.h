/*
 * Cấu hình kết nối: chọn port nào là log, port nào là frame.
 *
 * - Log: output esp_log/console, do sdkconfig quyết định (CONFIG_ESP_CONSOLE_*).
 * - Frame: protocol SOF/Frame ID/CMD/LEN/DATA/CRC8/EOF chạy trên port do config dưới đây.
 *
 * Hai chế độ:
 * - CDC = log, UART = frame: set FRAME_PORT_IS_UART = 1, và sdkconfig primary console = USB Serial/JTAG (CDC).
 * - CDC = frame, UART = log: set FRAME_PORT_IS_UART = 0, và sdkconfig primary console = UART.
 *
 * Hiện tại: frame trên USB CDC (FRAME_PORT_IS_UART = 0), log trên UART.
 */

#ifndef COMMUNICATE_CONFIG_H
#define COMMUNICATE_CONFIG_H

/** 1 = frame truyền trên UART, log trên CDC; 0 = frame trên CDC, log trên UART. */
#define COMMUNICATE_FRAME_PORT_IS_UART  0

#if COMMUNICATE_FRAME_PORT_IS_UART

/* Cấu hình UART dùng cho frame (chỉ khi FRAME_PORT_IS_UART = 1).
 * Trên BR: UART0 = console, UART1 = Host–RCP → dùng UART2 cho frame (hoặc đổi khi dùng board khác). */
#define COMMUNICATE_UART_NUM            UART_NUM_2
#define COMMUNICATE_UART_BAUD           115200
#define COMMUNICATE_UART_TX_GPIO        17
#define COMMUNICATE_UART_RX_GPIO        18

#define COMMUNICATE_UART_RX_BUF_SIZE    (1024)
#define COMMUNICATE_UART_TX_BUF_SIZE    (512)

#else

/* Cấu hình USB CDC (USB Serial/JTAG) dùng cho frame (khi FRAME_PORT_IS_UART = 0). */
#define COMMUNICATE_CDC_RX_BUF_SIZE    (1024)
#define COMMUNICATE_CDC_TX_BUF_SIZE    (512)

#endif /* COMMUNICATE_FRAME_PORT_IS_UART */

/* Giới hạn payload theo spec (docs/usb_cdc_frame_structure.md). */
#define COMMUNICATE_FRAME_MAX_DATA_LEN  2048

#endif /* COMMUNICATE_CONFIG_H */
