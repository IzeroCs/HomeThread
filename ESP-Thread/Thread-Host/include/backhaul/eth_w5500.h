/*
 * Ethernet W5500 (SPI) backhaul — Phase 2.6.
 * Backhaul chỉ LAN (Ethernet W5500), không Wi-Fi.
 */

#ifndef ETH_W5500_H
#define ETH_W5500_H

#include "esp_err.h"
#include "esp_netif.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Khởi tạo W5500 (SPI), tạo netif, start driver, chờ IPv4 (DHCP) hoặc IPv6 (link-local/RA) (timeout từ Kconfig).
 * Gọi sau esp_netif_init() và esp_event_loop_create_default().
 * @return ESP_OK khi có link và có IP; ESP_ERR_TIMEOUT hoặc lỗi khác.
 */
esp_err_t eth_w5500_init(void);

/**
 * Trả về netif Ethernet (sau khi eth_w5500_init() thành công).
 * @return esp_netif_t* hoặc NULL nếu chưa init / init thất bại.
 */
esp_netif_t *eth_w5500_get_netif(void);

#ifdef __cplusplus
}
#endif

#endif /* ETH_W5500_H */
