/*
 * SPDX-FileCopyrightText: 2025
 *
 * SPDX-License-Identifier: CC0-1.0
 *
 * OpenThread CoAP Endpoint for RGB LED Control on ESP32-C6
 */

#pragma once

#include <stdint.h>
#include <stdbool.h>
#include "esp_err.h"
#include "openthread/instance.h"
#include "openthread/coap.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * @brief RGB LED configuration structure
 */
typedef struct {
    uint8_t red;      ///< Red component (0-255)
    uint8_t green;    ///< Green component (0-255)
    uint8_t blue;     ///< Blue component (0-255)
    uint8_t brightness; ///< Overall brightness (0-255)
} rgb_led_color_t;

/**
 * @brief GPIO pin configuration for RGB LED
 */
typedef struct {
    int red_pin;      ///< GPIO pin for red channel
    int green_pin;    ///< GPIO pin for green channel
    int blue_pin;     ///< GPIO pin for blue channel
} rgb_led_pins_t;

/**
 * @brief Initialize RGB LED endpoint
 * 
 * @param instance OpenThread instance
 * @param pins GPIO pin configuration for RGB LED
 * @return esp_err_t ESP_OK on success
 */
esp_err_t rgb_led_endpoint_init(otInstance *instance, const rgb_led_pins_t *pins);

/**
 * @brief Deinitialize RGB LED endpoint
 * 
 * @return esp_err_t ESP_OK on success
 */
esp_err_t rgb_led_endpoint_deinit(void);

/**
 * @brief Set RGB LED color
 * 
 * @param color RGB color structure
 * @return esp_err_t ESP_OK on success
 */
esp_err_t rgb_led_set_color(const rgb_led_color_t *color);

/**
 * @brief Get current RGB LED color
 * 
 * @param color Pointer to store current color
 * @return esp_err_t ESP_OK on success
 */
esp_err_t rgb_led_get_color(rgb_led_color_t *color);

/**
 * @brief Turn off RGB LED
 * 
 * @return esp_err_t ESP_OK on success
 */
esp_err_t rgb_led_off(void);

#ifdef __cplusplus
}
#endif
