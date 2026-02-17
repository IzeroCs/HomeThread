/*
 * Example light_on_off: Thread Endpoint với Entity Model và CoAP.
 *
 * Sử dụng thread_endpoint_core để tự động setup:
 * - OpenThread initialization
 * - Status LED (auto update theo Thread state/role)
 * - Boot button (factory reset)
 * - Thread joiner
 * - Device registry (auto register khi join)
 *
 * User chỉ cần implement on_joined() callback để setup application-specific.
 */
#include "esp_err.h"
#include "esp_log.h"
#include "entity_model.h"
#include "on_off_light.h"
#include "entity_coap_server.h"
#include "thread_endpoint_core.h"

static const char *TAG = "light_on_off";

#define LIGHT_GPIO  2   /* Den on/off noi ngoai; RGB status dung GPIO 8 */

/* Flag để tránh init nhiều lần khi on_joined() được gọi lại */
static bool s_app_initialized = false;

/* Callback khi đã join Thread network */
static void on_joined(void *ctx)
{
    (void)ctx;

    /* Idempotent: nếu đã init rồi thì skip */
    if (s_app_initialized) {
        ESP_LOGD(TAG, "Already initialized, skipping");
        return;
    }

    ESP_LOGI(TAG, "Joined Thread -> init entity + CoAP server");

    /* Init entity model */
    entity_model_init();

    /* Đăng ký type on_off_light */
    esp_err_t err = on_off_light_register_type();
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "on_off_light_register_type: %s", esp_err_to_name(err));
        return;
    }

    /* Thêm instance đèn */
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
    
    /* Start CoAP server */
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
    /* Cấu hình Thread Endpoint Core */
    thread_endpoint_config_t config = {
        .pskd = NULL,                      /* Dùng CONFIG_THREAD_JOINER_PSKD_DEFAULT */
        .prefer_not_leader = true,         /* Tránh trở thành Leader */
        .router_selection_jitter = 1,      /* 1s để thử lên Router sớm */
        .on_joined = on_joined,            /* Callback khi join */
        .ctx = NULL,
    };

    /* Start Thread Endpoint Core - tự động setup mọi thứ */
    ESP_ERROR_CHECK(thread_endpoint_start(&config));
}
