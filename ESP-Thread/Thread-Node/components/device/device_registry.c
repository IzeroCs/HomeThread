/*
 * Device Registry - đăng ký device lên Backend (align backend contract).
 * Bước 1: POST /device/register/info (device info keys 0–7 only).
 * Bước 2: Chỉ khi register/info thành công mới gửi POST /device/register/entity (mac 7 + key 9).
 * Register thất bại: retry sau 2s đến khi thành công.
 */
#include <string.h>
#include "esp_err.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "esp_openthread.h"
#include "esp_openthread_lock.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/task.h"
#include "openthread/instance.h"
#include "openthread/ip6.h"
#include "openthread/thread.h"
#include "openthread/thread_ftd.h"
#include "device_registry.h"
#include "device_coap.h"
#include "device_model.h"
#include "entity_serialization.h"

static const char *TAG = "device_registry";

#define DEVICE_CBOR_MAX 512
#define ENTITIES_CBOR_MAX 1024
#define REGISTRY_RETRY_DELAY_MS 2000
#define RETRY_MSG_REGISTER  0
#define RETRY_MSG_ENTITIES  1

typedef struct {
    device_coap_endpoint_t endpoint;
    device_registry_callback_fn fn;
    void *user_ctx;
} register_ctx_t;

static QueueHandle_t s_retry_queue = NULL;
static TaskHandle_t s_retry_task_handle = NULL;
static esp_timer_handle_t s_retry_timer = NULL;
static esp_timer_handle_t s_entities_retry_timer = NULL;
static register_ctx_t s_register_ctx;

static esp_err_t try_send_register(void);
static esp_err_t try_send_entities(void);

static uint8_t get_role_enum(otDeviceRole role)
{
    switch (role) {
        case OT_DEVICE_ROLE_CHILD:
            return 0;
        case OT_DEVICE_ROLE_ROUTER:
            return 1;
        case OT_DEVICE_ROLE_LEADER:
            return 2;
        default:
            return 0;
    }
}

static uint16_t get_parent_rloc16(otInstance *instance, otDeviceRole role)
{
    if (role != OT_DEVICE_ROLE_CHILD) {
        return 0;
    }
    otRouterInfo parent_info;
    memset(&parent_info, 0, sizeof(parent_info));
    if (otThreadGetParentInfo(instance, &parent_info) != OT_ERROR_NONE) {
        return 0;
    }
    return parent_info.mRloc16;
}

static void on_entities_response(bool success, void *ctx)
{
    register_ctx_t *c = (register_ctx_t *)ctx;
    if (!success) {
        ESP_LOGW(TAG, "Entities failed, retry in %d ms", REGISTRY_RETRY_DELAY_MS);
        if (s_entities_retry_timer) {
            esp_timer_start_once(s_entities_retry_timer, (uint64_t)REGISTRY_RETRY_DELAY_MS * 1000);
        }
    }
    if (c && c->fn) {
        c->fn(success, c->user_ctx);
    }
}

static void on_register_response(bool success, void *ctx)
{
    register_ctx_t *c = (register_ctx_t *)ctx;
    if (!success) {
        ESP_LOGW(TAG, "Register failed, retry in %d ms", REGISTRY_RETRY_DELAY_MS);
        if (s_retry_timer) {
            esp_timer_start_once(s_retry_timer, (uint64_t)REGISTRY_RETRY_DELAY_MS * 1000);
        }
        return;
    }
    uint8_t entities_buffer[ENTITIES_CBOR_MAX];
    int entities_len = entity_serialize_entities_cbor(entities_buffer, sizeof(entities_buffer));
    if (entities_len <= 0) {
        device_coap_set_entities_acked(true);
        if (c->fn) {
            c->fn(true, c->user_ctx);
        }
        return;
    }
    esp_err_t err = device_coap_send_entities(&c->endpoint, entities_buffer, entities_len,
                                             on_entities_response, c);
    if (err == ESP_OK) {
        ESP_LOGI(TAG, "Register/info OK, POST /device/register/entity sent");
        return;
    }
    if (c->fn) {
        c->fn(true, c->user_ctx);
    }
}

bool device_registry_is_registered(void)
{
    return device_coap_is_registered();
}

static void retry_timer_cb(void *arg)
{
    (void)arg;
    if (s_retry_queue) {
        uint8_t msg = RETRY_MSG_REGISTER;
        xQueueSend(s_retry_queue, &msg, 0);
    }
}

static void entities_retry_timer_cb(void *arg)
{
    (void)arg;
    if (s_retry_queue) {
        uint8_t msg = RETRY_MSG_ENTITIES;
        xQueueSend(s_retry_queue, &msg, 0);
    }
}

static void retry_task(void *arg)
{
    (void)arg;
    uint8_t msg;
    for (;;) {
        if (xQueueReceive(s_retry_queue, &msg, portMAX_DELAY) == pdTRUE) {
            if (msg == RETRY_MSG_REGISTER) {
                try_send_register();
            } else {
                try_send_entities();
            }
        }
    }
}

static esp_err_t try_send_register(void)
{
    otInstance *instance = esp_openthread_get_instance();
    if (!instance) {
        return ESP_ERR_INVALID_STATE;
    }
    if (!esp_openthread_lock_acquire(pdMS_TO_TICKS(200))) {
        return ESP_ERR_TIMEOUT;
    }
    otDeviceRole role = otThreadGetDeviceRole(instance);
    if (role == OT_DEVICE_ROLE_DISABLED || role == OT_DEVICE_ROLE_DETACHED) {
        esp_openthread_lock_release();
        return ESP_ERR_INVALID_STATE;
    }
    uint16_t rloc16 = otThreadGetRloc16(instance);
    uint16_t parent_rloc16 = get_parent_rloc16(instance, role);
    const otIp6Address *ml_eid = otThreadGetMeshLocalEid(instance);
    uint8_t role_enum = get_role_enum(role);
    esp_openthread_lock_release();

    device_model_t *device = device_model_get();
    if (!device) {
        return ESP_ERR_INVALID_STATE;
    }
    uint8_t ipv6_bytes[16] = {0};
    if (ml_eid) {
        memcpy(ipv6_bytes, ml_eid->mFields.m8, 16);
    }
    device_model_update_network(rloc16, ipv6_bytes, role_enum);

    uint8_t device_buffer[DEVICE_CBOR_MAX];
    int device_len = entity_serialize_register_info_cbor(device_buffer, sizeof(device_buffer));
    if (device_len < 0) {
        ESP_LOGE(TAG, "Failed to serialize register/info to CBOR");
        return ESP_FAIL;
    }

    return device_coap_send_register(&s_register_ctx.endpoint, device_buffer, device_len, on_register_response, &s_register_ctx);
}

static esp_err_t try_send_entities(void)
{
    uint8_t entities_buffer[ENTITIES_CBOR_MAX];
    int entities_len = entity_serialize_entities_cbor(entities_buffer, sizeof(entities_buffer));
    if (entities_len <= 0) {
        device_coap_set_entities_acked(true);
        return ESP_OK;
    }
    esp_err_t err = device_coap_send_entities(&s_register_ctx.endpoint, entities_buffer, entities_len,
                                               on_entities_response, &s_register_ctx);
    if (err == ESP_OK) {
        ESP_LOGD(TAG, "POST /device/register/entity sent (retry)");
    }
    return err;
}

esp_err_t device_registry_init(void)
{
    esp_err_t err = device_coap_init();
    if (err != ESP_OK) {
        return err;
    }
    if (s_retry_queue == NULL) {
        s_retry_queue = xQueueCreate(1, sizeof(uint8_t));
        if (s_retry_queue == NULL) {
            ESP_LOGE(TAG, "Failed to create retry queue");
            return ESP_ERR_NO_MEM;
        }
    }
    if (s_retry_timer == NULL) {
        const esp_timer_create_args_t args = {
            .callback = &retry_timer_cb,
            .arg = NULL,
            .dispatch_method = ESP_TIMER_TASK,
            .name = "reg_retry",
        };
        if (esp_timer_create(&args, &s_retry_timer) != ESP_OK) {
            s_retry_timer = NULL;
            return ESP_FAIL;
        }
    }
    if (s_entities_retry_timer == NULL) {
        const esp_timer_create_args_t args = {
            .callback = &entities_retry_timer_cb,
            .arg = NULL,
            .dispatch_method = ESP_TIMER_TASK,
            .name = "ent_retry",
        };
        if (esp_timer_create(&args, &s_entities_retry_timer) != ESP_OK) {
            s_entities_retry_timer = NULL;
            return ESP_FAIL;
        }
    }
    if (s_retry_task_handle == NULL) {
        BaseType_t ok = xTaskCreate(retry_task, "dev_reg_retry", 3072, NULL, 5, &s_retry_task_handle);
        if (ok != pdPASS) {
            ESP_LOGE(TAG, "Failed to create retry task");
            return ESP_FAIL;
        }
    }
    return ESP_OK;
}

esp_err_t device_registry_register(const device_coap_endpoint_t *endpoint,
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

    esp_openthread_lock_release();

    device_model_t *device = device_model_get();
    if (!device) {
        ESP_LOGE(TAG, "Device Model not initialized");
        return ESP_ERR_INVALID_STATE;
    }

    if (device_model_sync_entities() < 0) {
        ESP_LOGE(TAG, "Failed to sync entities");
        return ESP_FAIL;
    }

    memcpy(&s_register_ctx.endpoint, endpoint, sizeof(device_coap_endpoint_t));
    s_register_ctx.fn = callback;
    s_register_ctx.user_ctx = ctx;

    esp_err_t ret = try_send_register();
    if (ret == ESP_OK) {
        ESP_LOGI(TAG, "CoAP POST /device/register/info sent (port=%u)", endpoint->port);
    }
    return ret;
}

esp_err_t device_registry_ping(const device_coap_endpoint_t *endpoint,
                               device_registry_ping_timestamp_changed_fn on_timestamp_changed,
                               void *ctx)
{
    if (!endpoint) {
        ESP_LOGE(TAG, "endpoint is NULL");
        return ESP_ERR_INVALID_ARG;
    }
    return device_coap_ping(endpoint, on_timestamp_changed, ctx);
}

esp_err_t device_registry_send_update_topology(const device_coap_endpoint_t *endpoint)
{
    if (!endpoint) {
        ESP_LOGE(TAG, "endpoint is NULL");
        return ESP_ERR_INVALID_ARG;
    }
    otInstance *instance = esp_openthread_get_instance();
    if (!instance) {
        return ESP_ERR_INVALID_STATE;
    }
    if (!esp_openthread_lock_acquire(pdMS_TO_TICKS(200))) {
        return ESP_ERR_TIMEOUT;
    }
    otDeviceRole role = otThreadGetDeviceRole(instance);
    if (role == OT_DEVICE_ROLE_DISABLED || role == OT_DEVICE_ROLE_DETACHED) {
        esp_openthread_lock_release();
        return ESP_ERR_INVALID_STATE;
    }
    uint16_t rloc16 = otThreadGetRloc16(instance);
    uint16_t parent_rloc16 = get_parent_rloc16(instance, role);
    const otIp6Address *ml_eid = otThreadGetMeshLocalEid(instance);
    uint8_t role_enum = get_role_enum(role);
    char ml_eid_str[40] = {0};
    uint8_t ipv6_bytes[16] = {0};
    if (ml_eid) {
        otIp6AddressToString(ml_eid, ml_eid_str, sizeof(ml_eid_str));
        memcpy(ipv6_bytes, ml_eid->mFields.m8, 16);
    }
    esp_openthread_lock_release();

    device_model_t *device = device_model_get();
    if (!device) {
        return ESP_ERR_INVALID_STATE;
    }
    device_model_update_network(rloc16, ipv6_bytes, role_enum);

    uint8_t topology_buffer[DEVICE_CBOR_MAX];
    int len = entity_serialize_device_cbor(rloc16, ml_eid_str, parent_rloc16,
                                          topology_buffer, sizeof(topology_buffer));
    if (len < 0) {
        ESP_LOGE(TAG, "Failed to serialize topology CBOR");
        return ESP_FAIL;
    }
    return device_coap_send_update_topology(endpoint, topology_buffer, len, NULL, NULL);
}

esp_err_t device_registry_send_update_state(const device_coap_endpoint_t *endpoint)
{
    if (!endpoint) {
        ESP_LOGE(TAG, "endpoint is NULL");
        return ESP_ERR_INVALID_ARG;
    }
    uint8_t state_buffer[ENTITIES_CBOR_MAX];
    int len = entity_serialize_updates_cbor(state_buffer, sizeof(state_buffer));
    if (len <= 0) {
        return ESP_OK;
    }
    return device_coap_send_update_state(endpoint, state_buffer, len, NULL, NULL);
}