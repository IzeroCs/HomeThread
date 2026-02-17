/*
 * ThreadEndPoint - ESP32-C6 OpenThread Joiner + LED on/off qua UDP.
 *
 * - Chạy OpenThread ở chế độ Joiner, dùng PSKd để Commissioner (border router) add vào mạng.
 * - Sau khi join, lắng nghe UDP port 5684, nhận lệnh "on" / "off" để bật/tắt LED.
 */
#include <stdio.h>
#include <string.h>
#include "esp_err.h"
#include "esp_event.h"
#include "esp_log.h"
#include "esp_mac.h"
#include "esp_netif.h"
#include "esp_openthread.h"
#include "esp_openthread_lock.h"
#include "esp_openthread_netif_glue.h"
#include "esp_openthread_types.h"
#include "esp_ot_config.h"
#include "esp_vfs_eventfd.h"
#include "nvs_flash.h"
#include "openthread/error.h"
#include "openthread/ip6.h"
#include "openthread/joiner.h"
#include "openthread/thread.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "led_udp_server.h"

#if CONFIG_OPENTHREAD_CLI
#include "ot_examples_common.h"
#endif

static const char *TAG = "thread_ep";

/* Joiner Credential (PSKd) - Thread spec "base32-thread": 6-32 ký tự, chỉ 0-9 và A-Y (loại I,O,Q,Z).
 * Một số Commissioner chỉ chấp nhận dạng: 1 chữ cái đầu + dãy số + rồi mới tới chữ (vd J01NME).
 * Phải trùng với lệnh commissioner joiner add trên Border Router.
 */
#define JOINER_PSKD "H01THREAD"

static bool s_joined = false;

static void joiner_callback(otError aError, void *aContext)
{
    (void)aContext;
    if (aError == OT_ERROR_NONE) {
        otInstance *instance = esp_openthread_get_instance();
        if (instance) {
            /* Sau khi nhan dataset tu Commissioner, phai "thread start" de attach vao mesh (xuat hien trong router/child table) */
            otError ot_err = otThreadSetEnabled(instance, true);
            if (ot_err == OT_ERROR_NONE) {
                ESP_LOGI(TAG, "Thread started (attach) - endpoint se xuat hien trong router/child table");
            } else {
                ESP_LOGE(TAG, "otThreadSetEnabled failed: %s (%d)", otThreadErrorToString(ot_err), ot_err);
            }
        }
        s_joined = true;
        esp_err_t err = led_udp_server_start();
        if (err != ESP_OK) {
            ESP_LOGE(TAG, "led_udp_server_start failed: %s", esp_err_to_name(err));
        }
    } else {
        ESP_LOGW(TAG, "Joiner failed: %s (%d)", otThreadErrorToString(aError), aError);
    }
}

static void start_joiner(void)
{
    ESP_LOGI(TAG, "start_joiner() called, PSKd=\"%s\"", JOINER_PSKD);

    otInstance *instance = esp_openthread_get_instance();
    if (!instance) {
        ESP_LOGE(TAG, "OpenThread instance NULL");
        return;
    }

    if (otThreadGetDeviceRole(instance) != OT_DEVICE_ROLE_DISABLED) {
        ESP_LOGI(TAG, "Already attached, start LED server");
        s_joined = true;
        led_udp_server_start();
        return;
    }

    if (!esp_openthread_lock_acquire(portMAX_DELAY)) {
        ESP_LOGE(TAG, "lock acquire failed");
        return;
    }

    otError err = otJoinerStart(instance, JOINER_PSKD, NULL, NULL, NULL, NULL, NULL,
                                joiner_callback, NULL);
    esp_openthread_lock_release();

    if (err != OT_ERROR_NONE) {
        ESP_LOGE(TAG, "otJoinerStart failed: %s (%d)", otThreadErrorToString(err), err);
        return;
    }
    ESP_LOGI(TAG, "Joiner started, PSKd=\"%s\" - doi Commissioner add joiner", JOINER_PSKD);
}

static void on_openthread_event(void *arg, esp_event_base_t base, int32_t id, void *data)
{
    (void)arg;
    (void)base;
    (void)data;
    ESP_LOGI(TAG, "on_openthread_event id=%d", (int)id);

    if (id == OPENTHREAD_EVENT_START || id == OPENTHREAD_EVENT_ATTACHED || id == OPENTHREAD_EVENT_IF_UP) {
        if (!s_joined) {
            const char *ev = (id == OPENTHREAD_EVENT_START) ? "START" : (id == OPENTHREAD_EVENT_IF_UP ? "IF_UP" : "ATTACHED");
            ESP_LOGI(TAG, "OpenThread event %s - starting joiner", ev);
            start_joiner();
        }
    }
    if (id == OPENTHREAD_EVENT_DETACHED) {
        ESP_LOGI(TAG, "OpenThread event DETACHED - reset s_joined");
        s_joined = false;
    }
}

void app_main(void)
{
    esp_vfs_eventfd_config_t eventfd_config = { .max_fds = 3 };
    ESP_ERROR_CHECK(nvs_flash_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_vfs_eventfd_register(&eventfd_config));

    ESP_ERROR_CHECK(esp_event_handler_instance_register(OPENTHREAD_EVENT, ESP_EVENT_ANY_ID,
                                                        on_openthread_event, NULL, NULL));
    ESP_LOGI(TAG, "Registered on_openthread_event (OPENTHREAD_EVENT, ANY_ID) - neu khong thay log on_openthread_event id=... thi event khong duoc goi");

    static esp_openthread_config_t config = {
        .netif_config = ESP_NETIF_DEFAULT_OPENTHREAD(),
        .platform_config = {
            .radio_config = ESP_OPENTHREAD_DEFAULT_RADIO_CONFIG(),
            .host_config = ESP_OPENTHREAD_DEFAULT_HOST_CONFIG(),
            .port_config = ESP_OPENTHREAD_DEFAULT_PORT_CONFIG(),
        },
    };
    ESP_ERROR_CHECK(esp_openthread_start(&config));
    esp_netif_set_default_netif(esp_openthread_get_netif());

    /* Mac dinh interface down; joiner can ifconfig up -> bat ngay khi boot */
    {
        otInstance *instance = esp_openthread_get_instance();
        if (instance && esp_openthread_lock_acquire(pdMS_TO_TICKS(1000))) {
            otError err = otIp6SetEnabled(instance, true);
            esp_openthread_lock_release();
            if (err == OT_ERROR_NONE) {
                ESP_LOGI(TAG, "ifconfig up (otIp6SetEnabled)");
            } else {
                ESP_LOGW(TAG, "otIp6SetEnabled failed: %s (%d)", otThreadErrorToString(err), err);
            }
        }
    }

#if CONFIG_OPENTHREAD_CLI
    /* Bat REPL de doc lenh tu UART - khong goi thi nhap CLI khong duoc */
    ot_console_start();
#endif

#if SOC_IEEE802154_SUPPORTED
    /* In EUI64 (8 byte) de dung cho commissioner joiner add <eui64> <pskd> neu muon gioi joiner theo thiet bi */
    uint8_t eui64[8];
    if (esp_read_mac(eui64, ESP_MAC_IEEE802154) == ESP_OK) {
        ESP_LOGI(TAG, "EUI64: %02x%02x%02x%02x%02x%02x%02x%02x (commissioner joiner add <eui64> %s de gioi han 1 thiet bi)",
                 eui64[0], eui64[1], eui64[2], eui64[3], eui64[4], eui64[5], eui64[6], eui64[7], JOINER_PSKD);
    }
#endif

    ESP_LOGI(TAG, "Thread endpoint ready. PSKd=\"%s\" - tren Border Router: commissioner start && commissioner joiner add * %s", JOINER_PSKD, JOINER_PSKD);
}
