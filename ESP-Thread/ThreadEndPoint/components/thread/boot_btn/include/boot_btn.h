/*
 * Boot Button - Core: nut BOOT (hoac bat ky GPIO nao) long-press -> callback.
 * Dung de factory reset, vao config mode, etc. Tai su dung giua cac example.
 */
#pragma once

#include <stdint.h>
#include "esp_err.h"
#include "freertos/FreeRTOS.h"

#ifdef __cplusplus
extern "C" {
#endif

/** Low = nut nhan (pull-up), High = tha. */
#define BOOT_BTN_ACTIVE_LEVEL  0

/** Callback khi nhan giu nut du thoi gian hold_ms. */
typedef void (*boot_btn_long_press_cb_t)(void *ctx);

/** Cau hinh nut. */
typedef struct {
    int gpio_num;                         /**< GPIO (vd. 9 cho BOOT tren ESP32-C6-DevKitC-1). */
    uint32_t hold_ms;                     /**< Giu bao lau (ms) de coi la long press. */
    uint32_t poll_ms;                     /**< Chu ky poll (ms). */
    boot_btn_long_press_cb_t on_long_press; /**< Goi khi long press (co the NULL). */
    void *ctx;                            /**< Context truyen vao on_long_press. */
    uint32_t task_stack_size;             /**< Stack size cho task (0 = dung default 4096). */
    UBaseType_t task_priority;            /**< Priority (0 = dung default 4). */
} boot_btn_config_t;

/**
 * Bat dau task doc nut: poll moi poll_ms, neu nut o muc active (low) lien tuc
 * trong hold_ms thi goi on_long_press(ctx). Task chay vo han.
 *
 * @param config gpio_num, hold_ms, poll_ms, on_long_press, ctx (khong duoc NULL).
 * @return ESP_OK khi tao task thanh cong.
 */
esp_err_t boot_btn_start(const boot_btn_config_t *config);

#ifdef __cplusplus
}
#endif
