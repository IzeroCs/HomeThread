/*
 * Communicate command: handler cho CMD STATE, DATASET_ACTIVE, IP_ADDR.
 */

#include "communicate/communicate_command.h"
#include "communicate/communicate.h"
#include "esp_log.h"
#include "esp_openthread.h"
#include "esp_openthread_lock.h"
#include "openthread/device_role.h"
#include "openthread/dataset.h"
#include "openthread/instance.h"
#include "openthread/thread.h"
#include <string.h>

#define TAG "communicate_cmd"

#define IPADDR_LEN 16

/** Gửi NACK với error code. */
static void send_nack(uint8_t frame_id, uint8_t err_code)
{
    (void)communicate_send_frame(frame_id, CMD_NACK, &err_code, 1);
}

/** Map otDeviceRole sang device_role_t (1 byte) cho ACK CMD_STATE. */
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

int communicate_command_handle_state(uint8_t frame_id)
{
    uint8_t role_byte = (uint8_t)DEVICE_ROLE_DISABLED;
    otInstance *instance = esp_openthread_get_instance();
    if (instance != NULL && esp_openthread_lock_acquire(pdMS_TO_TICKS(500))) {
        role_byte = role_to_byte(otThreadGetDeviceRole(instance));
        esp_openthread_lock_release();
    }
    esp_err_t err = communicate_send_frame(frame_id, CMD_ACK, &role_byte, 1);
    return (err == ESP_OK) ? 0 : -1;
}

int communicate_command_handle_dataset_active(uint8_t frame_id)
{
    otInstance *instance = esp_openthread_get_instance();
    if (instance == NULL) {
        send_nack(frame_id, 0x02); /* Not ready */
        return -1;
    }
    if (!esp_openthread_lock_acquire(pdMS_TO_TICKS(1000))) {
        send_nack(frame_id, 0x03); /* Timeout */
        return -1;
    }
    otOperationalDatasetTlvs tlvs;
    otError ot_err = otDatasetGetActiveTlvs(instance, &tlvs);
    esp_openthread_lock_release();
    if (ot_err != OT_ERROR_NONE) {
        ESP_LOGE(TAG, "otDatasetGetActiveTlvs failed %d", ot_err);
        send_nack(frame_id, 0x02); /* Not ready */
        return -1;
    }
    if (tlvs.mLength == 0 || tlvs.mLength > sizeof(tlvs.mTlvs)) {
        send_nack(frame_id, 0x02);
        return -1;
    }
    esp_err_t err = communicate_send_frame(frame_id, CMD_ACK, tlvs.mTlvs, (size_t)tlvs.mLength);
    return (err == ESP_OK) ? 0 : -1;
}

int communicate_command_handle_ipaddr(uint8_t frame_id)
{
    otInstance *instance = esp_openthread_get_instance();
    if (instance == NULL) {
        send_nack(frame_id, 0x02); /* Not ready */
        return -1;
    }
    if (!esp_openthread_lock_acquire(pdMS_TO_TICKS(1000))) {
        send_nack(frame_id, 0x03); /* Timeout */
        return -1;
    }
    otIp6Address leader_addr;
    otError ot_err = otThreadGetLeaderRloc(instance, &leader_addr);
    esp_openthread_lock_release();
    if (ot_err != OT_ERROR_NONE) {
        ESP_LOGE(TAG, "otThreadGetLeaderRloc failed %d", ot_err);
        send_nack(frame_id, 0x02); /* Not ready */
        return -1;
    }
    esp_err_t err = communicate_send_frame(frame_id, CMD_ACK, leader_addr.mFields.m8, IPADDR_LEN);
    return (err == ESP_OK) ? 0 : -1;
}
