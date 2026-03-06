/*
 * Device Registry - CoAP client: gửi device_model lên Backend qua CoAP POST /device/register.
 * Chỉ gửi sau khi đã discovery được backend (backend_discovery). Khi backend IPv6 đổi thì gửi lại.
 *
 * TODO: Migrate to struct-based approach (see MIGRATION_TO_STRUCT_BASED.md)
 */
#pragma once

#include "esp_err.h"
#include "openthread/ip6.h"
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Callback khi register device thành công hoặc thất bại.
 * @param success true nếu server trả 2.01 Created, false nếu lỗi.
 * @param ctx context truyền vào device_registry_register().
 */
typedef void (*device_registry_callback_fn)(bool success, void *ctx);

/**
 * Backend endpoint (IPv6 + port) cho CoAP register. Từ backend_discovery.
 */
typedef struct {
    otIp6Address addr;
    uint16_t port;
} device_registry_endpoint_t;

/**
 * Đã đăng ký thành công với Backend chưa (nhận ACK 2.01/2.04/2.05).
 */
bool device_registry_is_registered(void);

/**
 * Khởi tạo Device Registry: start CoAP client.
 * Gọi sau khi OpenThread đã start và device đã join.
 */
esp_err_t device_registry_init(void);

/**
 * Gửi CoAP POST /device/register tới backend (endpoint từ backend_discovery).
 * Gọi sau khi discovery được backend; khi backend IPv6 đổi thì gọi lại với endpoint mới.
 *
 * @param endpoint Backend (IPv6 + port), từ backend_discovery_get_endpoint().
 * @param callback Callback khi nhận response (có thể NULL).
 * @param ctx      Context cho callback.
 * @return ESP_OK nếu gửi request thành công.
 */
esp_err_t device_registry_register(const device_registry_endpoint_t *endpoint,
                                  device_registry_callback_fn callback,
                                  void *ctx);

#ifdef __cplusplus
}
#endif
