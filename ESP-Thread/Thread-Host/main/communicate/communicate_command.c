/*
 * Communicate command: handler cho CMD STATE, DATASET_ACTIVE, IP_ADDR.
 */

#include "communicate/communicate_command.h"
#include "communicate/communicate.h"
#include "esp_log.h"
#include "esp_openthread.h"
#include "esp_openthread_lock.h"
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

int communicate_command_handle_state(uint8_t frame_id)
{
    esp_err_t err = communicate_send_frame(frame_id, CMD_ACK, NULL, 0);
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
