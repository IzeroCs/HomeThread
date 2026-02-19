/*
 * Communicate: khung frame (SOF/ID/CMD/LEN/DATA/CRC8/EOF) trên port cấu hình (UART hoặc CDC).
 * Hiện tại: frame trên UART khi COMMUNICATE_FRAME_PORT_IS_UART = 1.
 */

#ifndef COMMUNICATE_H
#define COMMUNICATE_H

#include "esp_err.h"
#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/** CMD theo docs/usb_cdc_frame_structure.md. 0x05–0x0F reserved mở rộng sau. */
#define CMD_DATA            0x01
#define CMD_ACK             0x02
#define CMD_NACK            0x03
#define CMD_PING            0x04
#define CMD_RESET           0x10
#define CMD_FACTORY         0x11
#define CMD_NETWORK_NAME    0x12
#define CMD_PAN_ID          0x13
#define CMD_CHANNEL         0x14
#define CMD_DATASET_ACTIVE  0x15
#define CMD_IP_ADDR         0x16

/** Callback khi nhận được một frame hợp lệ (frame_id, cmd, data, len). */
typedef void (*communicate_rx_frame_cb_t)(uint8_t frame_id, uint8_t cmd, const uint8_t *data, size_t len, void *ctx);

/**
 * Khởi tạo communicate: init transport (UART nếu FRAME_PORT_IS_UART),
 * bắt đầu nhận và parse frame, gọi rx_cb khi có frame.
 */
esp_err_t communicate_init(communicate_rx_frame_cb_t rx_cb, void *rx_ctx);

/**
 * Gửi một frame: frame_id, cmd, data (có thể NULL nếu len=0), len.
 * CRC8 và SOF/EOF tự thêm.
 */
esp_err_t communicate_send_frame(uint8_t frame_id, uint8_t cmd, const uint8_t *data, size_t len);

#ifdef __cplusplus
}
#endif

#endif /* COMMUNICATE_H */
