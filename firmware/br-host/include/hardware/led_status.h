/*
 * LED status cho Thread Border Router trên ESP32-S3.
 * - Disabled: nhấp nháy đỏ
 * - Detached: nhấp nháy xanh dương
 * - Leader: xanh lá tĩnh
 * - Router: tím tĩnh
 * - Child: xanh dương tĩnh
 * 
 * Sử dụng WS2812/WS2812B addressable RGB LED qua RMT peripheral.
 * ESP32-S3 DevKit thường dùng GPIO 48 cho onboard LED hoặc GPIO 5 cho external LED.
 */

#pragma once

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

/** Cấu hình: GPIO data cho WS2812 (0 = dùng default từ menuconfig). */
typedef struct {
    int gpio_data;  /**< GPIO pin cho data line của WS2812. 0 = dùng CONFIG_LED_STATUS_GPIO */
} led_status_config_t;

/** 
 * Khởi tạo và chạy task LED trạng thái. 
 * 
 * @param config Cấu hình GPIO. Nếu NULL hoặc gpio_data = 0, sẽ dùng GPIO từ menuconfig.
 * @return ESP_OK nếu thành công, mã lỗi khác nếu thất bại.
 */
esp_err_t led_status_start(const led_status_config_t *config);

#ifdef __cplusplus
}
#endif
