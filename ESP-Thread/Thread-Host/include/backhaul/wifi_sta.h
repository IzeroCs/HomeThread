/*
 * Wi-Fi STA: kết nối AP, DHCP (Phase 2 backhaul / kênh quản lý qua IP).
 * Chỉ biên dịch khi CONFIG_BR_WIFI_STA_ENABLE=y.
 */

#ifndef WIFI_STA_H
#define WIFI_STA_H

#include "esp_err.h"
#include "esp_netif.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Khởi tạo Wi-Fi STA, kết nối AP (SSID/pass từ menuconfig), chờ DHCP.
 * Gọi sau esp_netif_init() và esp_event_loop_create_default().
 * Block đến khi có IP hoặc timeout (vd. 30s).
 * @return ESP_OK khi đã có IP; ESP_ERR_TIMEOUT hoặc lỗi khác.
 */
esp_err_t wifi_sta_init(void);

/**
 * Trả về backbone netif (Wi-Fi STA) cho border routing.
 * Gọi sau wifi_sta_init() khi CONFIG_BR_WIFI_STA_ENABLE=y.
 * @return esp_netif_t* hoặc NULL nếu Wi-Fi STA tắt.
 */
esp_netif_t *wifi_sta_get_netif(void);

#ifdef __cplusplus
}
#endif

#endif /* WIFI_STA_H */
