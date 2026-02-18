/*
 * Example light_on_off: Thread Endpoint với Entity Model và CoAP.
 *
 * Sử dụng thread/endpoint, entity_coap_server, network_stop handler.
 */
#include "esp_err.h"
#include "esp_log.h"
#include "entity_model.h"
#include "on_off_light.h"
#include "entity_coap_server.h"
#include "thread_endpoint.h"

static const char *TAG = "light_on_off";

#define LIGHT_GPIO  2   /* Den on/off noi ngoai; RGB status dung GPIO 8 */

/* Flag để tránh init nhiều lần khi on_joined() được gọi lại */
static bool s_app_initialized = false;

/* Callback khi đã join Thread network */
static void on_joined(void *ctx)
{
    (void)ctx;

    if (s_app_initialized) {
        ESP_LOGD(TAG, "Already initialized, skipping");
        return;
    }

    ESP_LOGI(TAG, "Joined Thread -> init entity + CoAP server");

    entity_model_init();

    esp_err_t err = on_off_light_register_type();
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
        .on_joined = on_joined,
        .ctx = NULL,
    };

    ESP_ERROR_CHECK(thread_endpoint_start(&config));
}
