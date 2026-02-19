/*
 * Transport UART cho frame: init, gửi/nhận byte.
 * Chỉ dùng khi FRAME_PORT_IS_UART = 1.
 */

#ifndef COMMUNICATE_TRANSPORT_UART_H
#define COMMUNICATE_TRANSPORT_UART_H

#include "esp_err.h"
#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/** Callback khi có byte nhận được (gọi từ task/ISR context tùy impl). */
typedef void (*transport_uart_rx_cb_t)(uint8_t *data, size_t len, void *ctx);

/**
 * Khởi tạo UART cho frame.
 * Sau khi gọi, gửi/nhận qua transport_uart_send; nhận qua callback.
 */
esp_err_t transport_uart_init(transport_uart_rx_cb_t rx_cb, void *rx_ctx);

/** Gửi len byte ra UART. */
esp_err_t transport_uart_send(const uint8_t *data, size_t len);

/** Deinit (tùy chọn). */
void transport_uart_deinit(void);

#ifdef __cplusplus
}
#endif

#endif /* COMMUNICATE_TRANSPORT_UART_H */
