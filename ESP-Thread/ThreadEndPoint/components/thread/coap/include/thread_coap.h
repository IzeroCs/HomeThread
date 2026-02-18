/*
 * Thread CoAP - Shared CoAP server management.
 * 
 * Component để quản lý CoAP server dùng chung cho các component khác
 * (entity_coap_server, network_stop_handler, ...).
 */
#pragma once

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Start CoAP server (idempotent - chỉ start một lần).
 * 
 * @return ESP_OK nếu start thành công hoặc đã start rồi
 * @return ESP_ERR_INVALID_STATE nếu OpenThread instance chưa sẵn sàng
 * @return ESP_FAIL nếu start thất bại
 */
esp_err_t thread_coap_server_start(void);

/**
 * Check xem CoAP server đã start chưa.
 * 
 * @return true nếu đã start, false nếu chưa
 */
bool thread_coap_server_is_started(void);

#ifdef __cplusplus
}
#endif
