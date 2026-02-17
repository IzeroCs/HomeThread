/*
 * LED status cho ot-br trên ESP32-H2.
 * - Boot: nhấp nháy đỏ
 * - Detached: nhấp nháy xanh dương
 * - Leader: xanh lá tĩnh
 */

#pragma once

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

/** Cấu hình: GPIO data cho WS2812 (0 = dùng default từ menuconfig, mặc định 8). */
typedef struct {
    int gpio_data;
} led_status_config_t;

/** Khởi tạo và chạy task LED trạng thái. config = NULL để dùng GPIO từ menuconfig (mặc định 8). */
esp_err_t led_status_start(const led_status_config_t *config);

#ifdef __cplusplus
}
#endif
