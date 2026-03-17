/*
 * Cấu hình communicate: frame protocol chạy trên TCP (BR listen, dashboard kết nối BR_IP:port).
 * Log: output esp_log/console do sdkconfig (CONFIG_ESP_CONSOLE_*).
 */

#ifndef COMMUNICATE_CONFIG_H
#define COMMUNICATE_CONFIG_H

/* Giới hạn payload theo spec (docs/protocol/usb_cdc_frame_structure.md). */
#define COMMUNICATE_FRAME_MAX_DATA_LEN  2048

#endif /* COMMUNICATE_CONFIG_H */
