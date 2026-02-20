/*
 * BR state change: đăng ký otSetStateChangedCallback, log state/ipaddr/dataset thay đổi.
 * Khi state (role) thay đổi: gửi CMD_STATE tới backend kèm 1 byte (0=disabled..4=leader).
 */

#include "br_state_change.h"
#include "openthread/device_role.h"
#include "communicate/communicate_task.h"
#include "esp_log.h"
#include "esp_openthread.h"
#include "esp_openthread_lock.h"
#include "openthread/instance.h"
#include "openthread/thread.h"
#include <string.h>

static const char *TAG = "br_state_change";

/** Map otDeviceRole sang device_role_t (1 byte) gửi trong CMD_STATE. */
static uint8_t role_to_byte(otDeviceRole role)
{
    switch (role) {
        case OT_DEVICE_ROLE_DISABLED: return (uint8_t)DEVICE_ROLE_DISABLED;
        case OT_DEVICE_ROLE_DETACHED: return (uint8_t)DEVICE_ROLE_DETACHED;
        case OT_DEVICE_ROLE_CHILD:    return (uint8_t)DEVICE_ROLE_CHILD;
        case OT_DEVICE_ROLE_ROUTER:   return (uint8_t)DEVICE_ROLE_ROUTER;
        case OT_DEVICE_ROLE_LEADER:   return (uint8_t)DEVICE_ROLE_LEADER;
        default:                      return (uint8_t)DEVICE_ROLE_DISABLED;
    }
}

static void on_state_changed(otChangedFlags flags, void *ctx)
{
    otInstance *instance = (otInstance *)ctx;
    if (flags == 0) {
        return;
    }
#if defined(OT_CHANGED_THREAD_ROLE)
    if (flags & OT_CHANGED_THREAD_ROLE) {
        ESP_LOGI(TAG, "changed: THREAD_ROLE");
        if (instance && esp_openthread_lock_acquire(pdMS_TO_TICKS(200))) {
            otDeviceRole role = otThreadGetDeviceRole(instance);
            esp_openthread_lock_release();
            communicate_task_send_state_to_backend(role_to_byte(role));
        }
    }
#endif
#if defined(OT_CHANGED_IP6_ADDRESS_ADDED)
    if (flags & OT_CHANGED_IP6_ADDRESS_ADDED) {
        ESP_LOGI(TAG, "changed: IP6_ADDRESS_ADDED");
    }
#endif
#if defined(OT_CHANGED_IP6_ADDRESS_REMOVED)
    if (flags & OT_CHANGED_IP6_ADDRESS_REMOVED) {
        ESP_LOGI(TAG, "changed: IP6_ADDRESS_REMOVED");
    }
#endif
#if defined(OT_CHANGED_ACTIVE_DATASET)
    if (flags & OT_CHANGED_ACTIVE_DATASET) {
        ESP_LOGI(TAG, "changed: ACTIVE_DATASET");
    }
#endif
#if defined(OT_CHANGED_PENDING_DATASET)
    if (flags & OT_CHANGED_PENDING_DATASET) {
        ESP_LOGI(TAG, "changed: PENDING_DATASET");
    }
#endif
#if defined(OT_CHANGED_THREAD_NETIF_STATE)
    if (flags & OT_CHANGED_THREAD_NETIF_STATE) {
        ESP_LOGI(TAG, "changed: THREAD_NETIF_STATE");
    }
#endif
#if defined(OT_CHANGED_THREAD_LL_ADDR)
    if (flags & OT_CHANGED_THREAD_LL_ADDR) {
        ESP_LOGI(TAG, "changed: THREAD_LL_ADDR");
    }
#endif
#if defined(OT_CHANGED_THREAD_ML_ADDR)
    if (flags & OT_CHANGED_THREAD_ML_ADDR) {
        ESP_LOGI(TAG, "changed: THREAD_ML_ADDR");
    }
#endif
}

esp_err_t br_state_change_init(void)
{
    otInstance *instance = esp_openthread_get_instance();
    if (instance == NULL) {
        ESP_LOGE(TAG, "OpenThread instance NULL");
        return ESP_ERR_INVALID_STATE;
    }
    otError err = otSetStateChangedCallback(instance, on_state_changed, instance);
    if (err != OT_ERROR_NONE) {
        ESP_LOGE(TAG, "otSetStateChangedCallback failed %d", err);
        return ESP_FAIL;
    }
    ESP_LOGI(TAG, "state change callback registered");
    return ESP_OK;
}
