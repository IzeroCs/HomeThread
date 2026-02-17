/*
 * Device Registry - CoAP client wrapper: gui entity_model len Leader qua CoAP POST.
 * Dung OpenThread CoAP API (otCoap) de register device khi join hoac thay doi role.
 */
#pragma once

#include "esp_err.h"
#include "openthread/ip6.h"
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Callback khi register device thanh cong hoac that bai.
 * @param success true neu Leader tra ve 2.01 Created, false neu loi.
 * @param ctx context truyen vao device_registry_register().
 */
typedef void (*device_registry_callback_fn)(bool success, void *ctx);

/**
 * Update Leader RLOC address (gọi khi join hoặc state change).
 * Tự động được gọi trong thread_endpoint_core, nhưng có thể gọi thủ công nếu cần.
 */
void device_registry_update_leader_rloc(void);

/**
 * Get Leader RLOC address đã lưu.
 * @param leader_rloc Output: Leader RLOC address
 * @return true nếu có Leader RLOC hợp lệ, false nếu chưa có
 */
bool device_registry_get_leader_rloc(otIp6Address *leader_rloc);

/**
 * Khoi tao Device Registry: start CoAP client.
 * Can goi sau khi OpenThread da start va device da join.
 * @return ESP_OK neu thanh cong, ESP_ERR_INVALID_STATE neu CoAP da start roi.
 */
esp_err_t device_registry_init(void);

/**
 * Register device len Leader: gui CoAP POST /devices/register voi entity_model.
 * Payload: JSON hoac text format chua rloc16, ml_eid, parent, entity_model.
 * @param callback callback khi nhan response (co the NULL).
 * @param ctx context truyen vao callback.
 * @return ESP_OK neu gui request thanh cong, ESP_ERR_INVALID_STATE neu chua init hoac chua join.
 */
esp_err_t device_registry_register(device_registry_callback_fn callback, void *ctx);

#ifdef __cplusplus
}
#endif
