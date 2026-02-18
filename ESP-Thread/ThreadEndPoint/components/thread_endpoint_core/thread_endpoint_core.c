/*
 * Thread Endpoint Core - Implementation.
 */
#include <stdio.h>
#include <string.h>
#include "esp_err.h"
#include "esp_log.h"
#include "esp_event.h"
#include "esp_netif.h"
#include "esp_openthread.h"
#include "esp_openthread_lock.h"
#include "esp_openthread_netif_glue.h"
#include "esp_openthread_types.h"
#include "esp_vfs_eventfd.h"
#include "esp_ot_config_defaults.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "nvs_flash.h"
#include "openthread/ip6.h"
#include "openthread/link.h"
#include "openthread/thread.h"
#include "openthread/thread_ftd.h"
#include "thread_endpoint_core.h"
#include "thread_joiner.h"
#include "boot_btn.h"
#include "status_led.h"
#include "device_registry.h"
#include "network_stop_handler.h"

static const char *TAG = "thread_endpoint";

static thread_endpoint_config_t s_config;
static bool s_started = false;
static TaskHandle_t s_registry_task_handle = NULL;

/* Update LED role khi Thread role thay đổi */
static void update_attached_led_role(void)
{
    otInstance *instance = esp_openthread_get_instance();
    if (!instance || !esp_openthread_lock_acquire(pdMS_TO_TICKS(200))) {
        return;
    }

    otDeviceRole role = otThreadGetDeviceRole(instance);
    esp_openthread_lock_release();

    status_led_attached_role_t led_role = STATUS_LED_ATTACHED_CHILD;
    if (role == OT_DEVICE_ROLE_LEADER) {
        led_role = STATUS_LED_ATTACHED_LEADER;
    } else if (role == OT_DEVICE_ROLE_ROUTER) {
        led_role = STATUS_LED_ATTACHED_ROUTER;
    }

    status_led_set_attached_role(led_role);
}

/* Boot button callback: factory reset */
static void on_boot_long_press(void *ctx)
{
    (void)ctx;
    ESP_LOGW(TAG, "Boot button long press -> factory reset");
    thread_joiner_factory_reset(true);
}

/* Task để register device (tránh stack overflow trong event handler) */
static void registry_task(void *pvParameters)
{
    (void)pvParameters;

    while (1) {
        /* Wait for notification */
        ulTaskNotifyTake(pdTRUE, portMAX_DELAY);

        /* Delay để network ready */
        vTaskDelay(pdMS_TO_TICKS(1000));

        /* Register device */
        device_registry_register(NULL, NULL);
    }
}


/* Thread event handler */
static void on_openthread_event(void *arg, esp_event_base_t base, int32_t id, void *data)
{
    (void)arg;
    (void)base;
    (void)data;

    if (id == (int32_t)OPENTHREAD_EVENT_DETACHED) {
        status_led_set_state(STATUS_LED_DETACHED);
    } else if (id == (int32_t)OPENTHREAD_EVENT_ROLE_CHANGED && thread_joiner_is_joined()) {
        status_led_set_state(STATUS_LED_ATTACHED);
        update_attached_led_role();

        /* Update Leader RLOC khi role thay đổi */
        device_registry_update_leader_rloc();

        /* Re-register device khi role thay đổi - TẮT ở main */
        /* if (s_registry_task_handle) {
            xTaskNotifyGive(s_registry_task_handle);
        } */
    }
}

/* Thread joiner callback wrapper */
static void on_joined_wrapper(void *ctx)
{
    otInstance *instance = esp_openthread_get_instance();

    /* Set prefer not leader */
    if (s_config.prefer_not_leader) {
        thread_joiner_set_prefer_not_leader(true);
    }

    /* Set Leader Weight = -16 để tránh trở thành Leader */
    if (instance && esp_openthread_lock_acquire(pdMS_TO_TICKS(500))) {
        otThreadSetLocalLeaderWeight(instance, 0);
        esp_openthread_lock_release();
        ESP_LOGI(TAG, "Leader Weight set to -16");
    }

    /* Set router selection jitter */
    if (s_config.router_selection_jitter > 0) {
        if (instance && esp_openthread_lock_acquire(pdMS_TO_TICKS(500))) {
            otThreadSetRouterSelectionJitter(instance, s_config.router_selection_jitter);
            esp_openthread_lock_release();
            ESP_LOGI(TAG, "Router selection jitter = %d s", s_config.router_selection_jitter);
        }
    }

    /* Update LED */
    status_led_set_state(STATUS_LED_ATTACHED);
    update_attached_led_role();

    /* Update Leader RLOC sau khi join */
    // device_registry_update_leader_rloc();

    /* Register CoAP resource /network/stop (nếu bật trong config) */
    if (s_config.enable_network_stop_handler) {
        esp_err_t err = network_stop_handler_register();
        if (err != ESP_OK) {
            ESP_LOGW(TAG, "Failed to register network stop handler: %s", esp_err_to_name(err));
        }
    }

    /* Call user callback */
    if (s_config.on_joined) {
        s_config.on_joined(s_config.ctx);
    }

    /* Auto register device lên Border Router - TẮT tạm */
    /* esp_err_t err = device_registry_init();
    if (err == ESP_OK && s_registry_task_handle) {
        xTaskNotifyGive(s_registry_task_handle);
    } */
}

esp_err_t thread_endpoint_start(const thread_endpoint_config_t *config)
{
    if (s_started) {
        ESP_LOGW(TAG, "Already started");
        return ESP_ERR_INVALID_STATE;
    }

    /* Copy config */
    if (config) {
        s_config = *config;
    } else {
        memset(&s_config, 0, sizeof(s_config));
    }

    /* Set defaults */
    if (s_config.pskd == NULL) {
        s_config.pskd = CONFIG_THREAD_JOINER_PSKD_DEFAULT;
    }
    if (s_config.prefer_not_leader == false && config == NULL) {
        s_config.prefer_not_leader = true;  /* Default: prefer not leader */
    }
    if (config == NULL) {
        s_config.enable_network_stop_handler = true;  /* Default: bật /network/stop handler */
    }

    /* Init ESP-IDF components */
    esp_vfs_eventfd_config_t eventfd_config = { .max_fds = 3 };
    ESP_ERROR_CHECK(nvs_flash_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_vfs_eventfd_register(&eventfd_config));

    /* Start OpenThread */
    esp_openthread_config_t ot_config = {
        .netif_config = ESP_NETIF_DEFAULT_OPENTHREAD(),
    };
    /* Initialize platform config using macros (compound literals) */
    esp_openthread_radio_config_t radio_cfg = ESP_OPENTHREAD_DEFAULT_RADIO_CONFIG();
    esp_openthread_host_connection_config_t host_cfg = ESP_OPENTHREAD_DEFAULT_HOST_CONFIG();
    esp_openthread_port_config_t port_cfg = ESP_OPENTHREAD_DEFAULT_PORT_CONFIG();
    ot_config.platform_config.radio_config = radio_cfg;
    ot_config.platform_config.host_config = host_cfg;
    ot_config.platform_config.port_config = port_cfg;
    ESP_ERROR_CHECK(esp_openthread_start(&ot_config));
    esp_netif_set_default_netif(esp_openthread_get_netif());

    /* Start status LED */
    ESP_ERROR_CHECK(status_led_start(NULL));
    status_led_set_state(STATUS_LED_NOT_JOINED);

    /* Register OpenThread event handler */
    ESP_ERROR_CHECK(esp_event_handler_instance_register(
        OPENTHREAD_EVENT, ESP_EVENT_ANY_ID, on_openthread_event, NULL, NULL));

    /* Enable IPv6 */
    otInstance *instance = esp_openthread_get_instance();
    if (instance && esp_openthread_lock_acquire(pdMS_TO_TICKS(1000))) {
        otIp6SetEnabled(instance, true);
        esp_openthread_lock_release();
    }

    /* Start thread joiner */
    thread_joiner_config_t joiner_cfg = {
        .pskd = s_config.pskd,
        .on_joined = on_joined_wrapper,
        .ctx = NULL,
    };
    ESP_ERROR_CHECK(thread_joiner_start(&joiner_cfg));

    /* Log EUI64 */
    if (instance && esp_openthread_lock_acquire(pdMS_TO_TICKS(500))) {
        otExtAddress eui64;
        otLinkGetFactoryAssignedIeeeEui64(instance, &eui64);
        esp_openthread_lock_release();
        ESP_LOGI(TAG, "EUI64: %02x%02x%02x%02x%02x%02x%02x%02x",
                 eui64.m8[0], eui64.m8[1], eui64.m8[2], eui64.m8[3],
                 eui64.m8[4], eui64.m8[5], eui64.m8[6], eui64.m8[7]);
    }

    /* Start boot button */
    const boot_btn_config_t boot_cfg = {
        .gpio_num = CONFIG_BOOT_BTN_GPIO_DEFAULT,
        .hold_ms = CONFIG_BOOT_BTN_HOLD_MS_DEFAULT,
        .poll_ms = CONFIG_BOOT_BTN_POLL_MS_DEFAULT,
        .on_long_press = on_boot_long_press,
        .ctx = NULL,
        .task_stack_size = 4096,
        .task_priority = 4,
    };
    ESP_ERROR_CHECK(boot_btn_start(&boot_cfg));

    /* Create registry task để tránh stack overflow trong event handler */
    xTaskCreate(registry_task, "registry", 4096, NULL, 5, &s_registry_task_handle);
    if (!s_registry_task_handle) {
        ESP_LOGE(TAG, "Failed to create registry task");
        return ESP_ERR_NO_MEM;
    }

    ESP_LOGI(TAG, "Thread Endpoint Core started");
    ESP_LOGI(TAG, "PSKd=\"%s\" - Commissioner: joiner add * %s",
             s_config.pskd, s_config.pskd);
    ESP_LOGI(TAG, "Hold BOOT button (GPIO %d) ~%lu s for factory reset",
             boot_cfg.gpio_num, (unsigned long)(boot_cfg.hold_ms / 1000));

    s_started = true;
    return ESP_OK;
}
