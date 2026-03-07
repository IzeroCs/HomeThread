/*
 * Transport TCP cho frame (Phase 2): BR listen port, accept 1 client, byte stream.
 * API: init với rx_cb, send, deinit.
 */

#ifndef COMMUNICATE_TRANSPORT_TCP_H
#define COMMUNICATE_TRANSPORT_TCP_H

#include "esp_err.h"
#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/** Callback khi có byte nhận được (gọi từ RX task). */
typedef void (*transport_tcp_rx_cb_t)(uint8_t *data, size_t len, void *ctx);

/**
 * Khởi tạo TCP server: listen port (từ Kconfig), accept 1 client, RX task đọc socket.
 * Gọi sau khi BR đã có IP (vd. sau khi Ethernet W5500 link up).
 */
esp_err_t transport_tcp_init(transport_tcp_rx_cb_t rx_cb, void *rx_ctx);

/** Gửi len byte ra socket client đã accept (nếu chưa có client thì trả lỗi). */
esp_err_t transport_tcp_send(const uint8_t *data, size_t len);

/** Deinit: đóng socket, dừng RX task. */
void transport_tcp_deinit(void);

#ifdef __cplusplus
}
#endif

#endif /* COMMUNICATE_TRANSPORT_TCP_H */
