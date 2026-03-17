/*
 * Example light_on_off: Thread Node + Entity Model + CoAP.
 * App chỉ cấu hình device info và driver (light); discovery, ping, register do thread_node xử lý.
 */
#include <string.h>
#include "esp_err.h"
#include "esp_log.h"
#include "on_off_light.h"
#include "entity_model.h"
#include "device_model.h"
#include "entity_coap_server.h"
#include "thread_node.h"

static const char *TAG = "light_on_off";

#define LIGHT_GPIO  2

#define ESP_MANUFACTURER_NAME    "Espressif"
#define ESP_MODEL_IDENTIFIER     "ESP32-C6"
#define ESP_DEVICE_NAME          "Light Controller"
#define ESP_DEVICE_TYPE          DEVICE_TYPE_ON_OFF_LIGHT
#define ESP_SW_VERSION           DEVICE_VERSION(1, 0, 0)
#define ESP_HW_VERSION           DEVICE_VERSION(1, 0, 0)

static bool s_app_initialized = false;

static void on_joined(void *ctx)
{
    (void)ctx;

    if (s_app_initialized) {
        return;
    }

    ESP_LOGI(TAG, "Joined Thread -> init device model + entity model + CoAP server");

    device_info_t device_info = {
        .device_name = ESP_DEVICE_NAME,
        .device_type = ESP_DEVICE_TYPE,
        .manufacturer = ESP_MANUFACTURER_NAME,
        .model = ESP_MODEL_IDENTIFIER,
        .sw_version = ESP_SW_VERSION,
        .hw_version = ESP_HW_VERSION,
    };

    esp_err_t err = device_model_init(&device_info);
    if (err != 0) {
        ESP_LOGE(TAG, "device_model_init failed: %d", err);
        return;
    }

    device_model_t *device = device_model_get();
    if (device) {
        ESP_LOGI(TAG, "Device Model: device_name=%s, mac=0x%016llx", device->info.device_name, (unsigned long long)device->info.mac_address);
    }

    entity_model_init();

    err = on_off_light_register_type();
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "on_off_light_register_type: %s", esp_err_to_name(err));
        return;
    }

    on_off_light_config_t light_cfg = {
        .gpio = LIGHT_GPIO,
        .initial_state = false,
        .invert_logic = false,
        .entity_id = "light.0",
        .name = "Main LED"
    };
    err = on_off_light_add(&light_cfg);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "on_off_light_add: %s", esp_err_to_name(err));
        return;
    }

    err = device_model_sync_entities();
    if (err != 0) {
        ESP_LOGW(TAG, "device_model_sync_entities failed: %d", err);
    }

    err = entity_coap_server_start();
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "entity_coap_server_start: %s", esp_err_to_name(err));
        return;
    }

    s_app_initialized = true;
    ESP_LOGI(TAG, "Application initialized");
}

void app_main(void)
{
    thread_node_config_t config = {
        .pskd = NULL,
        .prefer_not_leader = true,
        .router_selection_jitter = 1,
        .enable_device_registry = true,
        .on_joined = on_joined,
        .ctx = NULL,
    };

    ESP_ERROR_CHECK(thread_node_start(&config));
}
