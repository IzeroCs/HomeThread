/*
 * SPDX-FileCopyrightText: 2025
 *
 * SPDX-License-Identifier: CC0-1.0
 *
 * OpenThread Endpoint Application for RGB LED Control on ESP32-C6
 */

#include <stdio.h>
#include <string.h>
#include "esp_log.h"
#include "esp_err.h"
#include "esp_event.h"
#include "esp_netif.h"
#include "esp_openthread.h"
#include "esp_openthread_netif_glue.h"
#include "esp_openthread_types.h"
#include "esp_vfs_eventfd.h"
#include "nvs_flash.h"
#include "rgb_led_endpoint.h"
#include "openthread/thread.h"
#include "freertos/task.h"

#define TAG "rgb_led_endpoint_main"

/* Blink period when joined (ms); half period = one on/off cycle */
#define STATUS_BLINK_MS  500

// GPIO pin configuration for RGB LED on ESP32-C6
// Thay đổi các pin này theo hardware của bạn
#define RGB_LED_RED_PIN     8   // GPIO pin cho kênh đỏ
#define RGB_LED_GREEN_PIN   9   // GPIO pin cho kênh xanh lá
#define RGB_LED_BLUE_PIN    10  // GPIO pin cho kênh xanh dương

void app_main(void)
{
    ESP_LOGI(TAG, "Starting RGB LED Thread Endpoint application");
    
    // Initialize eventfd
    esp_vfs_eventfd_config_t eventfd_config = {
        .max_fds = 3,
    };
    ESP_ERROR_CHECK(esp_vfs_eventfd_register(&eventfd_config));
    
    // Initialize NVS
    ESP_ERROR_CHECK(nvs_flash_init());
    
    // Initialize event loop
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    
    // Initialize network interface
    ESP_ERROR_CHECK(esp_netif_init());
    
    // Configure OpenThread at runtime (avoids macro/union initializer issues)
    // ESP_NETIF_DEFAULT_OPENTHREAD() expands to { ... } which is only valid in an initializer,
    // not in assignment; use compound literal for runtime assignment.
    static esp_openthread_config_t config;
    memset(&config, 0, sizeof(config));
    config.netif_config = (esp_netif_config_t){
        .base = &g_esp_netif_inherent_openthread_config,
        .driver = NULL,
        .stack = &g_esp_netif_netstack_default_openthread,
    };
    config.platform_config.radio_config.radio_mode = RADIO_MODE_NATIVE;
    config.platform_config.host_config.host_connection_mode = HOST_CONNECTION_MODE_NONE;
    config.platform_config.port_config.storage_partition_name = "nvs";
    config.platform_config.port_config.netif_queue_size = 10;
    config.platform_config.port_config.task_queue_size = 10;
    
    // Start OpenThread
    ESP_ERROR_CHECK(esp_openthread_start(&config));
    esp_netif_set_default_netif(esp_openthread_get_netif());
    
    ESP_LOGI(TAG, "OpenThread started");
    
    // Wait for OpenThread to be ready
    vTaskDelay(pdMS_TO_TICKS(1000));
    
    // Get OpenThread instance
    otInstance *ot_instance = esp_openthread_get_instance();
    if (ot_instance == NULL) {
        ESP_LOGE(TAG, "Failed to get OpenThread instance");
        return;
    }
    
    // Configure RGB LED pins
    rgb_led_pins_t rgb_pins = {
        .red_pin = RGB_LED_RED_PIN,
        .green_pin = RGB_LED_GREEN_PIN,
        .blue_pin = RGB_LED_BLUE_PIN,
    };
    
    // Initialize RGB LED endpoint
    esp_err_t ret = rgb_led_endpoint_init(ot_instance, &rgb_pins);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to initialize RGB LED endpoint: %s", esp_err_to_name(ret));
        return;
    }
    
    ESP_LOGI(TAG, "RGB LED Thread Endpoint initialized successfully");
    ESP_LOGI(TAG, "CoAP endpoint URI: coap://[IPv6]:5683/rgb/led");
    ESP_LOGI(TAG, "Supported methods: GET (read color), POST/PUT (set color)");
    ESP_LOGI(TAG, "JSON format: {\"r\":0-255,\"g\":0-255,\"b\":0-255,\"brightness\":0-255}");
    
    /* Status LED: red = chưa join, blink xanh = đã join */
    bool joined = false;
    bool green_on = false;
    rgb_led_color_t red_color = { .red = 255, .green = 0, .blue = 0, .brightness = 255 };
    rgb_led_color_t green_on_color = { .red = 0, .green = 255, .blue = 0, .brightness = 255 };
    rgb_led_color_t green_off_color = { .red = 0, .green = 0, .blue = 0, .brightness = 0 };

    while (1) {
        vTaskDelay(pdMS_TO_TICKS(STATUS_BLINK_MS));

        otDeviceRole role = otThreadGetDeviceRole(ot_instance);
        bool is_joined = (role != OT_DEVICE_ROLE_DISABLED);

        if (!is_joined) {
            /* Chưa join mạng → đèn đỏ cố định */
            rgb_led_set_color(&red_color);
            if (joined) {
                ESP_LOGW(TAG, "Thread network not joined");
            }
            joined = false;
            green_on = false;
        } else {
            /* Đã join → blink xanh */
            joined = true;
            green_on = !green_on;
            rgb_led_set_color(green_on ? &green_on_color : &green_off_color);
        }
    }
}
