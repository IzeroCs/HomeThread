/*
 * Device CoAP - CoAP client gửi request tới Backend (transport).
 * POST /device/register (payload do caller cung cấp), GET /device/ping.
 */
#pragma once

#include "esp_err.h"
#include "openthread/ip6.h"
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    otIp6Address addr;
    uint16_t port;
} device_coap_endpoint_t;

typedef void (*device_coap_register_callback_fn)(bool success, void *ctx);
typedef void (*device_coap_ping_ts_changed_fn)(void *ctx);

esp_err_t device_coap_init(void);
bool device_coap_is_registered(void);

esp_err_t device_coap_send_register(const device_coap_endpoint_t *endpoint,
                                     const uint8_t *payload,
                                     int payload_len,
                                     device_coap_register_callback_fn callback,
                                     void *ctx);

esp_err_t device_coap_send_entities(const device_coap_endpoint_t *endpoint,
                                    const uint8_t *payload,
                                    int payload_len,
                                    device_coap_register_callback_fn callback,
                                    void *ctx);

esp_err_t device_coap_ping(const device_coap_endpoint_t *endpoint,
                           device_coap_ping_ts_changed_fn on_timestamp_changed,
                           void *ctx);

#ifdef __cplusplus
}
#endif
