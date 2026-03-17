/*
 * Boot button: phát hiện long press trên một GPIO.
 * Dùng cho factory reset hoặc chức năng khác (callback on_long_press).
 */

#pragma once

#include "esp_err.h"
#include "freertos/FreeRTOS.h"
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/** Mức logic khi nút được nhấn (0 = active low với pull-up). */
#ifndef BOOT_BTN_ACTIVE_LEVEL
#define BOOT_BTN_ACTIVE_LEVEL  0
#endif

/** Callback khi long press: (ctx). */
typedef void (*boot_btn_long_press_cb_t)(void *ctx);

/** Cấu hình boot button. */
typedef struct {
    int gpio_num;                    /**< GPIO nút (input, pull-up). */
    uint32_t hold_ms;                /**< Thời gian giữ (ms) để coi là long press. */
    uint32_t poll_ms;                /**< Chu kỳ poll (ms). */
    boot_btn_long_press_cb_t on_long_press;  /**< Callback khi long press; có thể NULL. */
    void *ctx;                       /**< Context truyền vào on_long_press. */
    uint32_t task_stack_size;        /**< Stack size task; 0 = default 4096. */
    UBaseType_t task_priority;       /**< Priority task; 0 = default 4. */
} boot_btn_config_t;

/**
 * Khởi tạo và chạy task đọc nút; khi long press gọi on_long_press(ctx).
 *
 * @param config Cấu hình (gpio_num, hold_ms, poll_ms, on_long_press, ctx, ...).
 * @return ESP_OK nếu thành công.
 */
esp_err_t boot_btn_start(const boot_btn_config_t *config);

#ifdef __cplusplus
}
#endif
