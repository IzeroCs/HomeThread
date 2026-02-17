/*
 * LED UDP server - nhận lệnh bật/tắt LED qua UDP trên Thread network.
 */
#pragma once

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

/** Port UDP để nhận lệnh LED (on/off). */
#define LED_UDP_PORT 5684

/** Khởi tạo và chạy task UDP server. Gọi khi đã join Thread (có IPv6). */
esp_err_t led_udp_server_start(void);

/** Dừng UDP server. */
void led_udp_server_stop(void);

#ifdef __cplusplus
}
#endif
