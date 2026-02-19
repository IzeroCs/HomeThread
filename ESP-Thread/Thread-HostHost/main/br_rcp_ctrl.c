/*
 * SPDX-FileCopyrightText: 2025-2026 Espressif Systems (Shanghai) CO LTD
 * SPDX-License-Identifier: CC0-1.0
 * Control RESET và BOOT pins của ESP32-H2 RCP từ ESP32-S3 Host.
 */

#include "br_config.h"
#include "br_rcp_ctrl.h"
#include "sdkconfig.h"
#include "esp_log.h"
#include "esp_err.h"
#include "esp_check.h"
#include "driver/gpio.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#define TAG "br_rcp_ctrl"

#define RCP_RESET_PIN CONFIG_PIN_TO_RCP_RESET
#define RCP_BOOT_PIN  CONFIG_PIN_TO_RCP_BOOT

static bool initialized = false;

esp_err_t br_rcp_ctrl_init(void)
{
    if (initialized) {
        return ESP_OK;
    }

    gpio_config_t reset_pin_config = {
        .intr_type = GPIO_INTR_DISABLE,
        .mode = GPIO_MODE_OUTPUT,
        .pin_bit_mask = (1ULL << RCP_RESET_PIN),
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .pull_up_en = GPIO_PULLUP_ENABLE,  // Pull-up để RESET ở HIGH khi không control
    };
    ESP_RETURN_ON_ERROR(gpio_config(&reset_pin_config), TAG, "Failed to config RESET pin");

    gpio_config_t boot_pin_config = {
        .intr_type = GPIO_INTR_DISABLE,
        .mode = GPIO_MODE_OUTPUT,
        .pin_bit_mask = (1ULL << RCP_BOOT_PIN),
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .pull_up_en = GPIO_PULLUP_ENABLE,  // Pull-up để BOOT ở HIGH (boot từ flash)
    };
    ESP_RETURN_ON_ERROR(gpio_config(&boot_pin_config), TAG, "Failed to config BOOT pin");

    // Set initial state: RESET HIGH (not reset), BOOT HIGH (boot from flash)
    gpio_set_level(RCP_RESET_PIN, 1);
    gpio_set_level(RCP_BOOT_PIN, 1);

    initialized = true;
    ESP_LOGI(TAG, "RCP control pins initialized: RESET=GPIO%d, BOOT=GPIO%d", RCP_RESET_PIN, RCP_BOOT_PIN);
    return ESP_OK;
}

void br_rcp_reset(void)
{
    if (!initialized) {
        ESP_LOGE(TAG, "br_rcp_ctrl_init() must be called first");
        return;
    }

    ESP_LOGI(TAG, "Resetting RCP...");
    gpio_set_level(RCP_RESET_PIN, 0);  // Pull RESET LOW
    vTaskDelay(pdMS_TO_TICKS(10));
    gpio_set_level(RCP_RESET_PIN, 1);  // Pull RESET HIGH
    vTaskDelay(pdMS_TO_TICKS(30));
    ESP_LOGI(TAG, "RCP reset complete");
}

void br_rcp_enter_download_mode(void)
{
    if (!initialized) {
        ESP_LOGE(TAG, "br_rcp_ctrl_init() must be called first");
        return;
    }

    ESP_LOGI(TAG, "Entering RCP download mode...");
    gpio_set_level(RCP_BOOT_PIN, 0);   // Pull BOOT LOW (download mode)
    gpio_set_level(RCP_RESET_PIN, 0);  // Pull RESET LOW
    vTaskDelay(pdMS_TO_TICKS(10));
    gpio_set_level(RCP_RESET_PIN, 1);  // Pull RESET HIGH
    // Giữ BOOT LOW trong khi flash
    ESP_LOGI(TAG, "RCP in download mode (BOOT=LOW)");
}

void br_rcp_exit_download_mode(void)
{
    if (!initialized) {
        ESP_LOGE(TAG, "br_rcp_ctrl_init() must be called first");
        return;
    }

    ESP_LOGI(TAG, "Exiting RCP download mode...");
    gpio_set_level(RCP_BOOT_PIN, 1);   // Pull BOOT HIGH (boot from flash)
    gpio_set_level(RCP_RESET_PIN, 0);  // Pull RESET LOW
    vTaskDelay(pdMS_TO_TICKS(10));
    gpio_set_level(RCP_RESET_PIN, 1);  // Pull RESET HIGH
    ESP_LOGI(TAG, "RCP booting from flash (BOOT=HIGH)");
}
