/*
 * Device Registry - CoAP client: gửi device_model lên Backend qua CoAP POST /device/register.
 * Chỉ gửi sau khi đã discovery được backend (thread_discovery). Khi backend IPv6 đổi thì gửi lại.
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
 * Callback khi GET /device/ping nhận response và timestamp backend khác với lần trước
 * (vd. backend restart) — app nên gọi lại device_registry_register().
 * @param ctx context truyền vào device_registry_ping().
 */
typedef void (*device_registry_ping_timestamp_changed_fn)(void *ctx);

/**
 * Backend endpoint (IPv6 + port) cho CoAP register. Từ thread_discovery.
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
 * Gửi CoAP POST /device/register tới backend (endpoint từ thread_discovery).
 * Gọi sau khi discovery được backend; khi backend IPv6 đổi thì gọi lại với endpoint mới.
 *
 * @param endpoint Backend (IPv6 + port), từ thread_discovery_get_endpoint().
 * @param callback Callback khi nhận response (có thể NULL).
 * @param ctx      Context cho callback.
 * @return ESP_OK nếu gửi request thành công.
 */
esp_err_t device_registry_register(const device_registry_endpoint_t *endpoint,
                                  device_registry_callback_fn callback,
                                  void *ctx);

/**
 * Gửi CoAP GET /device/ping tới backend. Response chứa 4-byte timestamp (LE).
 * Nếu timestamp khác lần trước thì gọi on_timestamp_changed (app nên gửi lại /device/register).
 * Mỗi request đều có CoAP token (set tự động).
 *
 * @param endpoint           Backend (từ thread_discovery_get_endpoint()).
 * @param on_timestamp_changed Callback khi timestamp trong response thay đổi (có thể NULL).
 * @param ctx                Context cho callback.
 * @return ESP_OK nếu gửi request thành công.
 */
esp_err_t device_registry_ping(const device_registry_endpoint_t *endpoint,
                               device_registry_ping_timestamp_changed_fn on_timestamp_changed,
                               void *ctx);

#ifdef __cplusplus
}
#endif
