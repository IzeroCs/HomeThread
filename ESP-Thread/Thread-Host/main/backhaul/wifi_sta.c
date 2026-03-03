/*
 * Wi-Fi STA: kết nối AP, DHCP (Phase 2).
 * SSID/password từ Kconfig (CONFIG_BR_WIFI_SSID, CONFIG_BR_WIFI_PASSWORD).
 */

#include "backhaul/wifi_sta.h"
#include "esp_log.h"
#include "esp_wifi.h"
#include "esp_event.h"
#include "esp_netif.h"
#include "esp_netif_ip_addr.h"
#include "freertos/FreeRTOS.h"
#include "freertos/event_groups.h"
#include "freertos/task.h"
#include <string.h>

#define TAG "wifi_sta"

#define WIFI_CONNECTED_BIT  BIT0
#define WIFI_FAIL_BIT       BIT1
#define WIFI_TIMEOUT_MS     (30 * 1000)

static EventGroupHandle_t s_wifi_event_group;
static int s_retry_count;
#if CONFIG_BR_WIFI_STA_ENABLE
static esp_netif_t *s_sta_netif = NULL;
#endif

static void wifi_event_handler(void *arg, esp_event_base_t event_base,
                               int32_t event_id, void *event_data)
{
    if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_START) {
        esp_wifi_connect();
    } else if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_DISCONNECTED) {
        if (s_retry_count < 5) {
            esp_wifi_connect();
            s_retry_count++;
            ESP_LOGI(TAG, "retry connect %d/5", s_retry_count);
        } else {
            xEventGroupSetBits(s_wifi_event_group, WIFI_FAIL_BIT);
        }
        ESP_LOGW(TAG, "STA disconnect");
    } else if (event_base == IP_EVENT && event_id == IP_EVENT_STA_GOT_IP) {
        ip_event_got_ip_t *event = (ip_event_got_ip_t *)event_data;
        ESP_LOGI(TAG, "got IP: " IPSTR, IP2STR(&event->ip_info.ip));
        s_retry_count = 0;
        xEventGroupSetBits(s_wifi_event_group, WIFI_CONNECTED_BIT);
    } else if (event_base == IP_EVENT && event_id == IP_EVENT_GOT_IP6) {
        ip_event_got_ip6_t *event = (ip_event_got_ip6_t *)event_data;
        ESP_LOGI(TAG, "got IPv6: " IPV6STR, IPV62STR(event->ip6_info.ip));
    }
}

esp_err_t wifi_sta_init(void)
{
#if !CONFIG_BR_WIFI_STA_ENABLE
    ESP_LOGI(TAG, "Wi-Fi STA disabled by config");
    return ESP_OK;
#else
    s_wifi_event_group = xEventGroupCreate();
    if (s_wifi_event_group == NULL) {
        ESP_LOGE(TAG, "EventGroup create failed");
        return ESP_ERR_NO_MEM;
    }

    s_sta_netif = esp_netif_create_default_wifi_sta();
    if (s_sta_netif == NULL) {
        ESP_LOGE(TAG, "esp_netif_create_default_wifi_sta failed");
        vEventGroupDelete(s_wifi_event_group);
        return ESP_ERR_NO_MEM;
    }

    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    esp_err_t err = esp_wifi_init(&cfg);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "esp_wifi_init %s", esp_err_to_name(err));
        vEventGroupDelete(s_wifi_event_group);
        return err;
    }

    err = esp_event_handler_instance_register(WIFI_EVENT,
                                              ESP_EVENT_ANY_ID,
                                              &wifi_event_handler,
                                              NULL, NULL);
    if (err != ESP_OK) {
        esp_wifi_deinit();
        vEventGroupDelete(s_wifi_event_group);
        return err;
    }
    err = esp_event_handler_instance_register(IP_EVENT,
                                              IP_EVENT_STA_GOT_IP,
                                              &wifi_event_handler,
                                              NULL, NULL);
    if (err != ESP_OK) {
        esp_event_handler_instance_unregister(WIFI_EVENT, ESP_EVENT_ANY_ID, NULL);
        esp_wifi_deinit();
        vEventGroupDelete(s_wifi_event_group);
        return err;
    }

    err = esp_event_handler_instance_register(IP_EVENT,
                                              IP_EVENT_GOT_IP6,
                                              &wifi_event_handler,
                                              NULL, NULL);
    if (err != ESP_OK) {
        esp_event_handler_instance_unregister(WIFI_EVENT, ESP_EVENT_ANY_ID, NULL);
        esp_event_handler_instance_unregister(IP_EVENT, IP_EVENT_STA_GOT_IP, NULL);
        esp_wifi_deinit();
        vEventGroupDelete(s_wifi_event_group);
        return err;
    }

    wifi_config_t wifi_config = {
        .sta = {
            .threshold.authmode = WIFI_AUTH_WPA2_PSK,
        },
    };
    strncpy((char *)wifi_config.sta.ssid, CONFIG_BR_WIFI_SSID, sizeof(wifi_config.sta.ssid) - 1);
    strncpy((char *)wifi_config.sta.password, CONFIG_BR_WIFI_PASSWORD, sizeof(wifi_config.sta.password) - 1);

    err = esp_wifi_set_mode(WIFI_MODE_STA);
    if (err != ESP_OK) {
        esp_wifi_deinit();
        vEventGroupDelete(s_wifi_event_group);
        return err;
    }
    err = esp_wifi_set_config(WIFI_IF_STA, &wifi_config);
    if (err != ESP_OK) {
        esp_wifi_deinit();
        vEventGroupDelete(s_wifi_event_group);
        return err;
    }

    err = esp_wifi_start();
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "esp_wifi_start %s", esp_err_to_name(err));
        esp_wifi_deinit();
        vEventGroupDelete(s_wifi_event_group);
        return err;
    }

    ESP_LOGI(TAG, "waiting for IP (timeout %d ms)...", (int)WIFI_TIMEOUT_MS);
    EventBits_t bits = xEventGroupWaitBits(s_wifi_event_group,
                                          WIFI_CONNECTED_BIT | WIFI_FAIL_BIT,
                                          pdFALSE, pdFALSE,
                                          pdMS_TO_TICKS(WIFI_TIMEOUT_MS));
    if (bits & WIFI_CONNECTED_BIT) {
        ESP_LOGI(TAG, "Wi-Fi STA init OK");
        return ESP_OK;
    }
    if (bits & WIFI_FAIL_BIT) {
        ESP_LOGE(TAG, "Wi-Fi connect failed (max retries)");
        return ESP_ERR_TIMEOUT;
    }
    ESP_LOGE(TAG, "Wi-Fi connect timeout");
    return ESP_ERR_TIMEOUT;
#endif
}

esp_netif_t *wifi_sta_get_netif(void)
{
#if CONFIG_BR_WIFI_STA_ENABLE
    return s_sta_netif;
#else
    return NULL;
#endif
}
