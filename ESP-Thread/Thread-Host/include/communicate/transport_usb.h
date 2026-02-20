/*
 * Transport USB CDC (USB Serial/JTAG) cho frame: init, gửi/nhận byte.
 * Chỉ dùng khi FRAME_PORT_IS_UART = 0 (frame trên CDC).
 */

#ifndef COMMUNICATE_TRANSPORT_USB_H
#define COMMUNICATE_TRANSPORT_USB_H

#include "esp_err.h"
#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/** Callback khi có byte nhận được (gọi từ RX task). */
typedef void (*transport_usb_rx_cb_t)(uint8_t *data, size_t len, void *ctx);

/**
 * Khởi tạo USB CDC (USB Serial/JTAG) cho frame.
 * Sau khi gọi, gửi qua transport_usb_send; nhận qua callback.
 */
esp_err_t transport_usb_init(transport_usb_rx_cb_t rx_cb, void *rx_ctx);

/** Gửi len byte ra USB CDC. */
esp_err_t transport_usb_send(const uint8_t *data, size_t len);

/** Deinit (tùy chọn). */
void transport_usb_deinit(void);

#ifdef __cplusplus
}
#endif

#endif /* COMMUNICATE_TRANSPORT_USB_H */
