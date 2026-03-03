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

/** CMD theo docs/usb_cdc_frame_structure.md. 0x05–0x0F, 0x15–0x1F, 0x25–0x2F, 0x33–0x3F reserved mở rộng sau. */
#define CMD_DATA                   0x01
#define CMD_ACK                    0x02
#define CMD_NACK                   0x03

#define CMD_RESET                  0x10
#define CMD_FACTORY                0x11
#define CMD_STATE                  0x12
#define CMD_IP_ADDR                0x13
#define CMD_DATASET_ACTIVE         0x14
#define CMD_DATASET_COMMIT_ACTIVE  0x15

/* Set config commands (0x20–0x2F) */
#define CMD_SET_PANID          0x20
#define CMD_SET_CHANNEL        0x21
#define CMD_SET_NETWORK_NAME   0x22
#define CMD_SET_EXTENDED_PANID 0x23
#define CMD_SET_NETWORK_KEY    0x24

/* Table commands (0x30–0x3F) */
#define CMD_ROUTER_TABLE    0x30
#define CMD_CHILD_TABLE     0x31
#define CMD_JOINER_TABLE    0x32

/* Thread start/stop/version, commissioner_joiner, SRP register */
#define CMD_THREAD_START        0x40
#define CMD_THREAD_STOP         0x41
#define CMD_THREAD_VERSION      0x42
#define CMD_COMMISSIONER_JOINER 0x43
#define CMD_SRP_REGISTER        0x44

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

/** Trả về tên command (ví dụ "STATE", "IP_ADDR") để log; unknown trả về "0x%02x". */
const char *communicate_cmd_name(uint8_t cmd);

#ifdef __cplusplus
}
#endif

#endif /* COMMUNICATE_H */
