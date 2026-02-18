/*
 * Thread Endpoint Core - Application framework wrapper.
 *
 * Tích hợp các phần common cho Thread endpoint:
 * - OpenThread initialization
 * - Status LED (auto update theo Thread state/role)
 * - Boot button (factory reset)
 * - Thread joiner
 * - Device registry (auto register khi join)
 * - Event handling
 *
 * User chỉ cần implement callback on_joined() để setup application-specific.
 */
#pragma once

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Callback khi device đã join Thread network.
 * User implement callback này để:
 * - Init entity model
 * - Register entity types
 * - Add entities
 * - Start CoAP server
 * - Setup application-specific logic
 *
 * @param ctx User context (từ config)
 */
typedef void (*thread_endpoint_on_joined_fn)(void *ctx);

/**
 * Cấu hình Thread Endpoint Core.
 */
typedef struct {
    const char *pskd;                    ///< PSKd cho Thread joiner (NULL = dùng CONFIG_THREAD_JOINER_PSKD_DEFAULT)
    bool prefer_not_leader;              ///< Set Leader Weight -16 để tránh trở thành Leader (default: true)
    uint8_t router_selection_jitter;     ///< Router selection jitter (seconds, 0 = default 120s)
    bool enable_network_stop_handler;    ///< Register CoAP /network/stop handler (default: true)
    thread_endpoint_on_joined_fn on_joined; ///< Callback khi join thành công
    void *ctx;                            ///< User context cho callbacks
} thread_endpoint_config_t;

/**
 * Khởi động Thread Endpoint Core.
 *
 * Hàm này sẽ:
 * 1. Init NVS, event loop, netif, OpenThread
 * 2. Start status LED (auto update theo Thread state)
 * 3. Start boot button (factory reset)
 * 4. Start thread joiner
 * 5. Register event handlers (auto update LED, auto register device)
 * 6. Log EUI64
 *
 * @param config Cấu hình (NULL = dùng defaults)
 * @return ESP_OK nếu thành công
 *
 * @note Sau khi join thành công, on_joined callback sẽ được gọi.
 * @note Status LED sẽ tự động update theo Thread state và role.
 * @note Device sẽ tự động register lên Border Router khi join.
 */
esp_err_t thread_endpoint_start(const thread_endpoint_config_t *config);

#ifdef __cplusplus
}
#endif
