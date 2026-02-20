/*
 * Communicate queue: enqueue frame nhận được, task riêng xử lý (gọi command handler).
 * Tránh block RX callback khi xử lý lâu (dataset, ipaddr).
 */

#ifndef COMMUNICATE_QUEUE_H
#define COMMUNICATE_QUEUE_H

#include "esp_err.h"
#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Khởi tạo queue và task xử lý.
 * Gọi trước communicate_init(); rx_cb sẽ gọi communicate_queue_post().
 */
esp_err_t communicate_queue_init(void);

/**
 * Đẩy frame vào queue (non-blocking).
 * data có thể NULL nếu len = 0. Trả ESP_ERR_TIMEOUT nếu queue đầy (gửi NACK Busy từ rx_cb).
 */
esp_err_t communicate_queue_post(uint8_t frame_id, uint8_t cmd, const uint8_t *data, size_t len);

#ifdef __cplusplus
}
#endif

#endif /* COMMUNICATE_QUEUE_H */
