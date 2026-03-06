/*
 * Example light_on_off: Thread Endpoint với Entity Model và CoAP.
 *
 * Sử dụng thread/endpoint, entity_coap_server, network_stop handler.
 */
#include <string.h>
#include "esp_err.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "on_off_light.h"
#include "entity_model.h"
#include "device_model.h"
#include "entity_coap_server.h"
#include "thread_endpoint.h"
#include "backend_discovery.h"
#include "openthread/ip6.h"

static const char *TAG = "light_on_off";

#define LIGHT_GPIO  2   /* Den on/off noi ngoai; RGB status dung GPIO 8 */

// Device info: strings = manufacturer, model, device_name; numbers = device_type, sw_version, hw_version (save bandwidth)
#define ESP_MANUFACTURER_NAME    "Espressif"
#define ESP_MODEL_IDENTIFIER     "ESP32-C6"
#define ESP_DEVICE_NAME          "Light Controller"
#define ESP_DEVICE_TYPE          DEVICE_TYPE_ON_OFF_LIGHT
#define ESP_SW_VERSION           DEVICE_VERSION(1, 0, 0)
#define ESP_HW_VERSION           DEVICE_VERSION(1, 0, 0)

/* Flag để tránh init nhiều lần khi on_joined() được gọi lại */
static bool s_app_initialized = false;
static bool s_backend_ep_valid = false;
static backend_endpoint_t s_backend_ep;

#define BACKEND_DISCOVERY_REFRESH_MS  60000   /* Chu kỳ re-discovery (60s) để nhận backend đổi IPv6 không cần reboot */

/** Task định kỳ: gọi get_endpoint(..., false); TTL trong backend_discovery sẽ làm cache hết hạn sau cache_ttl_sec, khi đó sẽ SRP lại. Cập nhật s_backend_ep nếu endpoint thay đổi. */
static void backend_discovery_refresh_task(void *pvParameters)
{
    (void)pvParameters;
    const TickType_t delay_ticks = pdMS_TO_TICKS(BACKEND_DISCOVERY_REFRESH_MS);

    for (;;) {
        vTaskDelay(delay_ticks);

        backend_endpoint_t ep;
        esp_err_t err = backend_discovery_get_endpoint(&ep, false);
        if (err != ESP_OK) {
            continue;
        }

        bool addr_eq = (memcmp(ep.addr.mFields.m8, s_backend_ep.addr.mFields.m8, 16) == 0);
        bool port_eq = (ep.port == s_backend_ep.port);
        if (addr_eq && port_eq) {
            continue;   /* Không đổi */
        }

        if (!s_backend_ep_valid) {
            s_backend_ep = ep;
            s_backend_ep_valid = true;
            char addr_str[40];
            otIp6AddressToString(&s_backend_ep.addr, addr_str, sizeof(addr_str));
            ESP_LOGI(TAG, "Backend endpoint discovered (refresh): [%s]:%u (from_srp=%s)",
                     addr_str, (unsigned int)s_backend_ep.port, s_backend_ep.from_srp ? "yes" : "no");
        } else {
            s_backend_ep = ep;
            char addr_str[40];
            otIp6AddressToString(&s_backend_ep.addr, addr_str, sizeof(addr_str));
            ESP_LOGI(TAG, "Backend endpoint updated: [%s]:%u (from_srp=%s)",
                     addr_str, (unsigned int)s_backend_ep.port, s_backend_ep.from_srp ? "yes" : "no");
        }
    }
}

/* Callback khi đã join Thread network */
static void on_joined(void *ctx)
{
    (void)ctx;

    if (s_app_initialized) {
        ESP_LOGD(TAG, "Already initialized, skipping");
        return;
    }

    ESP_LOGI(TAG, "Joined Thread -> init device model + entity model + CoAP server + backend discovery");

    // Initialize Device Model with device info (ESP-IDF style: designated initializers)
    // device_id and mac_address will be auto-generated if not provided
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

    // Get device_id from Device Model (after auto-generation)
    device_model_t *device = device_model_get();
    if (device) {
        ESP_LOGI(TAG, "Device Model initialized: device_id=%s", device->info.device_id);
    }

    /* Backend discovery init + first scan. cache_ttl_sec=60: cache SRP hết hạn sau 60s, refresh task gọi get_endpoint(..., false) sẽ trigger re-discovery. */
    backend_discovery_cfg_t disc_cfg = {
        .nvs_namespace = NULL,
        .cache_key_srp = NULL,
        .cache_key_static = NULL,
        .cache_ttl_sec = 60,
    };
    backend_discovery_init(&disc_cfg);
    backend_endpoint_t ep;
    err = backend_discovery_get_endpoint(&ep, true);   /* force_refresh: boot/join luôn quét lại SRP */
    if (err == ESP_OK) {
        s_backend_ep = ep;
        s_backend_ep_valid = true;

        char addr_str[40];
        otIp6AddressToString(&s_backend_ep.addr, addr_str, sizeof(addr_str));
        ESP_LOGI(TAG, "Backend endpoint discovered: [%s]:%u (from_srp=%s)",
                 addr_str,
                 (unsigned int)s_backend_ep.port,
                 s_backend_ep.from_srp ? "yes" : "no");
    } else {
        ESP_LOGW(TAG, "Initial backend discovery failed: %s", esp_err_to_name(err));
    }

    /* Task định kỳ re-discovery: mỗi BACKEND_DISCOVERY_REFRESH_MS gọi get_endpoint(..., false); khi cache hết TTL sẽ SRP lại và cập nhật s_backend_ep nếu backend đổi IPv6. */
    if (xTaskCreate(backend_discovery_refresh_task, "backend_disc_refresh",
                    4096, NULL, 5, NULL) != pdPASS) {
        ESP_LOGE(TAG, "Failed to create backend discovery refresh task");
    }

    // Initialize entity model
    entity_model_init();

    // Register light type
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

    // Sync entities to Device Model (for serialization)
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
    ESP_LOGI(TAG, "Application initialized successfully");
}

void app_main(void)
{
    thread_endpoint_config_t config = {
        .pskd = NULL,
        .prefer_not_leader = true,
        .router_selection_jitter = 1,
        .enable_network_stop_handler = true,
        .enable_device_registry = true,   /* CoAP POST /device/register lên Leader (BR phải trả ACK/NACK) */
        .on_joined = on_joined,
        .ctx = NULL,
    };

    ESP_ERROR_CHECK(thread_endpoint_start(&config));
}
