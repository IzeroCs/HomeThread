/*
 * Device Registry - đăng ký device lên Backend.
 * Bước 1: POST /device/register (device + network only).
 * Bước 2: POST /device/entities (entities array + device_id).
 * Chỉ gửi sau khi discovery được backend.
 */
#include <string.h>
#include "esp_err.h"
#include "esp_log.h"
#include "esp_openthread.h"
#include "esp_openthread_lock.h"
#include "openthread/instance.h"
#include "openthread/thread.h"
#include "openthread/thread_ftd.h"
#include "device_registry.h"
#include "device_coap.h"
#include "device_model.h"
#include "entity_serialization.h"

static const char *TAG = "device_registry";

typedef struct {
    device_registry_callback_fn fn;
    void *user_ctx;
} register_ctx_t;

static void on_register_response(bool success, void *ctx)
{
    register_ctx_t *c = (register_ctx_t *)ctx;
    if (c && c->fn) {
        c->fn(success, c->user_ctx);
    }
}

bool device_registry_is_registered(void)
{
    return device_coap_is_registered();
}

esp_err_t device_registry_init(void)
{
    return device_coap_init();
}

esp_err_t device_registry_register(const device_registry_endpoint_t *endpoint,
                                  device_registry_callback_fn callback,
                                  void *ctx)
{
    if (!endpoint) {
        ESP_LOGE(TAG, "endpoint is NULL");
        return ESP_ERR_INVALID_ARG;
    }

    otInstance *instance = esp_openthread_get_instance();
    if (!instance) {
        ESP_LOGE(TAG, "OpenThread instance NULL");
        return ESP_ERR_INVALID_STATE;
    }

    if (!esp_openthread_lock_acquire(pdMS_TO_TICKS(200))) {
        return ESP_ERR_TIMEOUT;
    }

    otDeviceRole role = otThreadGetDeviceRole(instance);
    if (role == OT_DEVICE_ROLE_DISABLED || role == OT_DEVICE_ROLE_DETACHED) {
        esp_openthread_lock_release();
        ESP_LOGW(TAG, "Device not joined yet");
        return ESP_ERR_INVALID_STATE;
    }

    uint16_t rloc16 = otThreadGetRloc16(instance);
    uint16_t parent_rloc16 = 0;
    const otIp6Address *ml_eid = otThreadGetMeshLocalEid(instance);
    uint8_t role_enum = 0;

    switch (role) {
        case OT_DEVICE_ROLE_CHILD:
            role_enum = 0;
            {
                otRouterInfo parent_info;
                memset(&parent_info, 0, sizeof(parent_info));
                if (otThreadGetParentInfo(instance, &parent_info) == OT_ERROR_NONE) {
                    parent_rloc16 = parent_info.mRloc16;
                }
            }
            break;
        case OT_DEVICE_ROLE_ROUTER:
            role_enum = 1;
            break;
        case OT_DEVICE_ROLE_LEADER:
            role_enum = 2;
            break;
        default:
            role_enum = 0;
            break;
    }

    esp_openthread_lock_release();

    device_model_t *device = device_model_get();
    if (!device) {
        ESP_LOGE(TAG, "Device Model not initialized");
        return ESP_ERR_INVALID_STATE;
    }

    uint8_t ipv6_bytes[16] = {0};
    if (ml_eid) {
        memcpy(ipv6_bytes, ml_eid->mFields.m8, 16);
    }
    device_model_update_network(rloc16, ipv6_bytes, role_enum);

    if (device_model_sync_entities() < 0) {
        ESP_LOGE(TAG, "Failed to sync entities");
        return ESP_FAIL;
    }

#define DEVICE_CBOR_MAX 512
#define ENTITIES_CBOR_MAX 1024

    uint8_t device_buffer[DEVICE_CBOR_MAX];
    int device_len = entity_serialize_device_cbor(rloc16, NULL, parent_rloc16, device_buffer, sizeof(device_buffer));
    if (device_len < 0) {
        ESP_LOGE(TAG, "Failed to serialize device to CBOR");
        return ESP_FAIL;
    }

    static register_ctx_t register_ctx;
    register_ctx.fn = callback;
    register_ctx.user_ctx = ctx;

    const device_coap_endpoint_t *coap_ep = (const device_coap_endpoint_t *)endpoint;

    esp_err_t ret = device_coap_send_register(coap_ep, device_buffer, device_len,
                                              on_register_response,
                                              &register_ctx);
    if (ret != ESP_OK) {
        return ret;
    }

    uint8_t entities_buffer[ENTITIES_CBOR_MAX];
    int entities_len = entity_serialize_entities_cbor(entities_buffer, sizeof(entities_buffer));
    if (entities_len < 0) {
        ESP_LOGE(TAG, "Failed to serialize entities to CBOR");
        return ESP_FAIL;
    }

    ret = device_coap_send_entities(coap_ep, entities_buffer, entities_len, NULL, NULL);
    if (ret != ESP_OK) {
        return ret;
    }

    ESP_LOGI(TAG, "CoAP POST /device/register + /device/entities sent (rloc16=0x%04x, port=%u)", rloc16, (unsigned)endpoint->port);
    return ESP_OK;
}

esp_err_t device_registry_ping(const device_registry_endpoint_t *endpoint,
                               device_registry_ping_timestamp_changed_fn on_timestamp_changed,
                               void *ctx)
{
    if (!endpoint) {
        ESP_LOGE(TAG, "endpoint is NULL");
        return ESP_ERR_INVALID_ARG;
    }
    const device_coap_endpoint_t *coap_ep = (const device_coap_endpoint_t *)endpoint;
    return device_coap_ping(coap_ep, on_timestamp_changed, ctx);
}