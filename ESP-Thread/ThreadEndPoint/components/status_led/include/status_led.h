/*
 * Status LED - Core: RGB LED (WS2812) hien thi trang thai Thread.
 * Boot = do nhap nhay, chua join = vang nhap nhay, detached = xanh duong nhap nhay.
 * Attached: Leader = tim tinh, Router = xanh duong tinh, Child = xanh la tinh (goi status_led_set_attached_role).
 */
#pragma once

#include <stdbool.h>
#include "esp_err.h"
#include "freertos/FreeRTOS.h"

#ifdef __cplusplus
extern "C" {
#endif

/** Trang thai den: ung voi mau va kieu sang. */
typedef enum {
    STATUS_LED_BOOT,       /**< Do nhap nhay - moi boot. */
    STATUS_LED_NOT_JOINED, /**< Vang nhap nhay - chua join. */
    STATUS_LED_DETACHED,   /**< Xanh duong nhap nhay - da join nhung detached. */
    STATUS_LED_ATTACHED,   /**< Attached: mau phu thuoc status_led_set_attached_role (leader=tim, router=xanh duong, child=xanh la). */
} status_led_state_t;

/** Role khi attached: ung voi mau tinh. */
typedef enum {
    STATUS_LED_ATTACHED_CHILD,  /**< Xanh la tinh. */
    STATUS_LED_ATTACHED_ROUTER, /**< Xanh duong tinh. */
    STATUS_LED_ATTACHED_LEADER, /**< Tim tinh. */
} status_led_attached_role_t;

/** Cau hinh (neu 0 dung default tu Kconfig). */
typedef struct {
    int gpio_num;           /**< GPIO data WS2812 (0 = CONFIG_STATUS_LED_GPIO_DEFAULT). */
    unsigned blink_ms;      /**< Chu ky nhap nhay (0 = CONFIG_STATUS_LED_BLINK_MS). */
    uint32_t task_stack;    /**< Stack task (0 = 2048). */
    UBaseType_t task_prio;  /**< Priority (0 = 2). */
} status_led_config_t;

/**
 * Khoi dong status LED: tao RMT channel, task cap nhat mau theo state.
 * State ban dau la STATUS_LED_BOOT.
 *
 * @param config NULL hoac config tuy chinh (gpio_num/blink_ms 0 = default).
 * @return ESP_OK khi thanh cong.
 */
esp_err_t status_led_start(const status_led_config_t *config);

/**
 * Doi trang thai den. Co the goi tu bat ky task nao.
 *
 * @param state Trang thai moi.
 */
void status_led_set_state(status_led_state_t state);

/**
 * Dat role khi attached: Leader = tim tinh, Router = xanh duong tinh, Child = xanh la tinh.
 * Chi ap dung khi state la STATUS_LED_ATTACHED. Goi sau status_led_set_state(STATUS_LED_ATTACHED)
 * hoac khi nhan OPENTHREAD_EVENT_ROLE_CHANGED.
 *
 * @param role STATUS_LED_ATTACHED_LEADER / ROUTER / CHILD.
 */
void status_led_set_attached_role(status_led_attached_role_t role);

#ifdef __cplusplus
}
#endif
