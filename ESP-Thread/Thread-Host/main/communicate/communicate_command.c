/*
 * Communicate command: handler cho CMD STATE, DATASET_ACTIVE, IP_ADDR.
 */

#include "communicate/communicate_command.h"
#include "communicate/communicate.h"
#include "communicate/communicate_task.h"
#include "esp_log.h"
#include "esp_openthread.h"
#include "esp_openthread_lock.h"
#include "openthread/commissioner.h"
#include "openthread/device_role.h"
#include "openthread/dataset.h"
#include "openthread/instance.h"
#include "openthread/ip6.h"
#include "openthread/thread.h"
#include "openthread/thread_ftd.h"
#include <string.h>

#define TAG "communicate_cmd"

#define LEADER_RLOC_LEN 16

/* Cache leader RLOC (16 byte); refresh khi backend pull CMD_IP_ADDR. */
static uint8_t s_cached_leader_rloc[LEADER_RLOC_LEN];
static bool s_cached_leader_rloc_valid = false;

static void refresh_leader_rloc_cache(void)
{
    otInstance *instance = esp_openthread_get_instance();
    if (instance == NULL) {
        return;
    }
    if (!esp_openthread_lock_acquire(pdMS_TO_TICKS(500))) {
        return;
    }
    otIp6Address addr;
    if (otThreadGetLeaderRloc(instance, &addr) == OT_ERROR_NONE) {
        memcpy(s_cached_leader_rloc, addr.mFields.m8, LEADER_RLOC_LEN);
        s_cached_leader_rloc_valid = true;
    }
    esp_openthread_lock_release();
}

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
    if (!s_cached_leader_rloc_valid) {
        refresh_leader_rloc_cache();
    }
    if (!s_cached_leader_rloc_valid) {
        send_nack(frame_id, 0x02); /* Not ready */
        return -1;
    }
    esp_err_t err = communicate_send_frame(frame_id, CMD_ACK, s_cached_leader_rloc, LEADER_RLOC_LEN);
    if (err == ESP_OK) {
        communicate_task_mark_ip_response_pending(frame_id);
    }
    return (err == ESP_OK) ? 0 : -1;
}

int communicate_command_handle_router_table(uint8_t frame_id)
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
    uint8_t buf[256];
    uint8_t *p = buf + 1;
    uint8_t count = 0;
    for (uint8_t router_id = 0; router_id <= 62; router_id++) {
        otRouterInfo router_info;
        if (otThreadGetRouterInfo(instance, router_id, &router_info) == OT_ERROR_NONE && router_info.mAllocated) {
            if (p + 15 > buf + sizeof(buf)) {
                break;
            }
            *p++ = router_info.mRouterId;
            *p++ = (uint8_t)(router_info.mRloc16 >> 8);
            *p++ = (uint8_t)(router_info.mRloc16 & 0xFF);
            memcpy(p, router_info.mExtAddress.m8, 8);
            p += 8;
            *p++ = router_info.mLinkQualityIn;
            *p++ = router_info.mLinkQualityOut;
            *p++ = (uint8_t)(router_info.mAge >> 8);
            *p++ = (uint8_t)(router_info.mAge & 0xFF);
            count++;
        }
    }
    esp_openthread_lock_release();
    buf[0] = count;
    esp_err_t err = communicate_send_frame(frame_id, CMD_ACK, buf, (size_t)(p - buf));
    return (err == ESP_OK) ? 0 : -1;
}

int communicate_command_handle_child_table(uint8_t frame_id)
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
    uint8_t buf[512];
    uint8_t *p = buf + 1;
    uint8_t count = 0;
    uint16_t max_children = otThreadGetMaxAllowedChildren(instance);
    for (uint16_t index = 0; index < max_children; index++) {
        otChildInfo child_info;
        if (otThreadGetChildInfoByIndex(instance, index, &child_info) == OT_ERROR_NONE) {
            if (p + 17 > buf + sizeof(buf)) {
                break;
            }
            *p++ = child_info.mChildId;
            *p++ = (uint8_t)(child_info.mRloc16 >> 8);
            *p++ = (uint8_t)(child_info.mRloc16 & 0xFF);
            memcpy(p, child_info.mExtAddress.m8, 8);
            p += 8;
            *p++ = child_info.mLinkQualityIn;
            *p++ = (uint8_t)child_info.mAverageRssi;
            *p++ = child_info.mFullThreadDevice ? 1 : 0;
            *p++ = child_info.mRxOnWhenIdle ? 1 : 0;
            *p++ = (uint8_t)(child_info.mAge >> 8);
            *p++ = (uint8_t)(child_info.mAge & 0xFF);
            count++;
        }
    }
    esp_openthread_lock_release();
    buf[0] = count;
    esp_err_t err = communicate_send_frame(frame_id, CMD_ACK, buf, (size_t)(p - buf));
    return (err == ESP_OK) ? 0 : -1;
}

int communicate_command_handle_joiner_table(uint8_t frame_id)
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
    uint8_t buf[512];
    uint8_t *p = buf + 1;
    uint8_t count = 0;
    uint16_t iterator = 0;
    otJoinerInfo joiner_info;
    while (otCommissionerGetNextJoinerInfo(instance, &iterator, &joiner_info) == OT_ERROR_NONE) {
        if (p + 50 > buf + sizeof(buf)) {
            break;
        }
        *p++ = (uint8_t)joiner_info.mType;
        if (joiner_info.mType == OT_JOINER_INFO_TYPE_EUI64) {
            memcpy(p, joiner_info.mSharedId.mEui64.m8, 8);
            p += 8;
        } else if (joiner_info.mType == OT_JOINER_INFO_TYPE_DISCERNER) {
            uint64_t discerner_val = joiner_info.mSharedId.mDiscerner.mValue;
            uint8_t discerner_len = joiner_info.mSharedId.mDiscerner.mLength;
            *p++ = discerner_len;
            uint8_t discerner_bytes = (discerner_len + 7) / 8;
            for (int i = discerner_bytes - 1; i >= 0; i--) {
                *p++ = (uint8_t)((discerner_val >> (i * 8)) & 0xFF);
            }
        } else {
            memset(p, 0, 8);
            p += 8;
        }
        size_t pskd_len = strlen((const char *)joiner_info.mPskd.m8);
        if (pskd_len > 32) {
            pskd_len = 32;
        }
        *p++ = (uint8_t)pskd_len;
        memcpy(p, joiner_info.mPskd.m8, pskd_len);
        p += pskd_len;
        *p++ = (uint8_t)(joiner_info.mExpirationTime >> 24);
        *p++ = (uint8_t)(joiner_info.mExpirationTime >> 16);
        *p++ = (uint8_t)(joiner_info.mExpirationTime >> 8);
        *p++ = (uint8_t)(joiner_info.mExpirationTime & 0xFF);
        count++;
    }
    esp_openthread_lock_release();
    buf[0] = count;
    esp_err_t err = communicate_send_frame(frame_id, CMD_ACK, buf, (size_t)(p - buf));
    return (err == ESP_OK) ? 0 : -1;
}

int communicate_command_handle_set_panid(uint8_t frame_id, const uint8_t *data, size_t len)
{
    if (len != 2) {
        send_nack(frame_id, 0x04); /* Invalid param */
        return -1;
    }
    uint16_t panid = ((uint16_t)data[0] << 8) | data[1];
    if (panid == 0xFFFF) {
        send_nack(frame_id, 0x04); /* Invalid param (0xFFFF reserved) */
        return -1;
    }
    otInstance *instance = esp_openthread_get_instance();
    if (instance == NULL) {
        send_nack(frame_id, 0x02); /* Not ready */
        return -1;
    }
    if (!esp_openthread_lock_acquire(pdMS_TO_TICKS(1000))) {
        send_nack(frame_id, 0x03); /* Timeout */
        return -1;
    }
    otOperationalDataset dataset;
    otError ot_err = otDatasetGetActive(instance, &dataset);
    if (ot_err != OT_ERROR_NONE) {
        esp_openthread_lock_release();
        ESP_LOGE(TAG, "otDatasetGetActive failed %d", ot_err);
        send_nack(frame_id, 0x02); /* Not ready */
        return -1;
    }
    dataset.mPanId = panid;
    dataset.mComponents.mIsPanIdPresent = true;
    ot_err = otDatasetSetActive(instance, &dataset);
    esp_openthread_lock_release();
    if (ot_err != OT_ERROR_NONE) {
        ESP_LOGE(TAG, "otDatasetSetActive failed %d", ot_err);
        send_nack(frame_id, 0x02); /* Not ready */
        return -1;
    }
    esp_err_t err = communicate_send_frame(frame_id, CMD_ACK, NULL, 0);
    return (err == ESP_OK) ? 0 : -1;
}

int communicate_command_handle_set_channel(uint8_t frame_id, const uint8_t *data, size_t len)
{
    if (len != 1) {
        send_nack(frame_id, 0x04); /* Invalid param */
        return -1;
    }

    uint8_t channel = data[0];
    if (channel < 11 || channel > 26) {
        send_nack(frame_id, 0x04); /* Invalid param */
        return -1;
    }

    otInstance *instance = esp_openthread_get_instance();
    if (instance == NULL) {
        send_nack(frame_id, 0x02); /* Not ready */
        return -1;
    }

    if (!esp_openthread_lock_acquire(pdMS_TO_TICKS(1000))) {
        send_nack(frame_id, 0x03); /* Timeout */
        return -1;
    }

    otOperationalDataset dataset;
    otError ot_err = otDatasetGetActive(instance, &dataset);
    if (ot_err != OT_ERROR_NONE) {
        esp_openthread_lock_release();
        ESP_LOGE(TAG, "otDatasetGetActive failed %d", ot_err);
        send_nack(frame_id, 0x02); /* Not ready */
        return -1;
    }

    dataset.mChannel = channel;
    dataset.mComponents.mIsChannelPresent = true;
    ot_err = otDatasetSetActive(instance, &dataset);
    esp_openthread_lock_release();
    if (ot_err != OT_ERROR_NONE) {
        ESP_LOGE(TAG, "otDatasetSetActive failed %d", ot_err);
        send_nack(frame_id, 0x02); /* Not ready */
        return -1;
    }
    esp_err_t err = communicate_send_frame(frame_id, CMD_ACK, NULL, 0);
    return (err == ESP_OK) ? 0 : -1;
}

int communicate_command_handle_set_network_name(uint8_t frame_id, const uint8_t *data, size_t len)
{
    if (len == 0 || len > OT_NETWORK_NAME_MAX_SIZE) {
        send_nack(frame_id, 0x04); /* Invalid param */
        return -1;
    }
    otInstance *instance = esp_openthread_get_instance();
    if (instance == NULL) {
        send_nack(frame_id, 0x02); /* Not ready */
        return -1;
    }
    if (!esp_openthread_lock_acquire(pdMS_TO_TICKS(1000))) {
        send_nack(frame_id, 0x03); /* Timeout */
        return -1;
    }
    otOperationalDataset dataset;
    otError ot_err = otDatasetGetActive(instance, &dataset);
    if (ot_err != OT_ERROR_NONE) {
        esp_openthread_lock_release();
        ESP_LOGE(TAG, "otDatasetGetActive failed %d", ot_err);
        send_nack(frame_id, 0x02); /* Not ready */
        return -1;
    }
    size_t name_len = len;
    if (name_len > OT_NETWORK_NAME_MAX_SIZE - 1) {
        name_len = OT_NETWORK_NAME_MAX_SIZE - 1;
    }
    memcpy(dataset.mNetworkName.m8, data, name_len);
    dataset.mNetworkName.m8[name_len] = '\0';
    dataset.mComponents.mIsNetworkNamePresent = true;
    ot_err = otDatasetSetActive(instance, &dataset);
    esp_openthread_lock_release();
    if (ot_err != OT_ERROR_NONE) {
        ESP_LOGE(TAG, "otDatasetSetActive failed %d", ot_err);
        send_nack(frame_id, 0x02); /* Not ready */
        return -1;
    }
    esp_err_t err = communicate_send_frame(frame_id, CMD_ACK, NULL, 0);
    return (err == ESP_OK) ? 0 : -1;
}

int communicate_command_handle_set_extended_panid(uint8_t frame_id, const uint8_t *data, size_t len)
{
    if (len != 8) {
        send_nack(frame_id, 0x04); /* Invalid param */
        return -1;
    }
    otInstance *instance = esp_openthread_get_instance();
    if (instance == NULL) {
        send_nack(frame_id, 0x02); /* Not ready */
        return -1;
    }
    if (!esp_openthread_lock_acquire(pdMS_TO_TICKS(1000))) {
        send_nack(frame_id, 0x03); /* Timeout */
        return -1;
    }
    otOperationalDataset dataset;
    otError ot_err = otDatasetGetActive(instance, &dataset);
    if (ot_err != OT_ERROR_NONE) {
        esp_openthread_lock_release();
        ESP_LOGE(TAG, "otDatasetGetActive failed %d", ot_err);
        send_nack(frame_id, 0x02); /* Not ready */
        return -1;
    }
    memcpy(dataset.mExtendedPanId.m8, data, 8);
    dataset.mComponents.mIsExtendedPanIdPresent = true;
    ot_err = otDatasetSetActive(instance, &dataset);
    esp_openthread_lock_release();
    if (ot_err != OT_ERROR_NONE) {
        ESP_LOGE(TAG, "otDatasetSetActive failed %d", ot_err);
        send_nack(frame_id, 0x02); /* Not ready */
        return -1;
    }
    esp_err_t err = communicate_send_frame(frame_id, CMD_ACK, NULL, 0);
    return (err == ESP_OK) ? 0 : -1;
}

int communicate_command_handle_set_network_key(uint8_t frame_id, const uint8_t *data, size_t len)
{
    if (len != OT_NETWORK_KEY_SIZE) {
        send_nack(frame_id, 0x04); /* Invalid param */
        return -1;
    }
    otInstance *instance = esp_openthread_get_instance();
    if (instance == NULL) {
        send_nack(frame_id, 0x02); /* Not ready */
        return -1;
    }
    if (!esp_openthread_lock_acquire(pdMS_TO_TICKS(1000))) {
        send_nack(frame_id, 0x03); /* Timeout */
        return -1;
    }
    otOperationalDataset dataset;
    otError ot_err = otDatasetGetActive(instance, &dataset);
    if (ot_err != OT_ERROR_NONE) {
        esp_openthread_lock_release();
        ESP_LOGE(TAG, "otDatasetGetActive failed %d", ot_err);
        send_nack(frame_id, 0x02); /* Not ready */
        return -1;
    }
    memcpy(dataset.mNetworkKey.m8, data, OT_NETWORK_KEY_SIZE);
    dataset.mComponents.mIsNetworkKeyPresent = true;
    ot_err = otDatasetSetActive(instance, &dataset);
    esp_openthread_lock_release();
    if (ot_err != OT_ERROR_NONE) {
        ESP_LOGE(TAG, "otDatasetSetActive failed %d", ot_err);
        send_nack(frame_id, 0x02); /* Not ready */
        return -1;
    }
    esp_err_t err = communicate_send_frame(frame_id, CMD_ACK, NULL, 0);
    return (err == ESP_OK) ? 0 : -1;
}

int communicate_command_handle_thread_start(uint8_t frame_id)
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
    (void)otIp6SetEnabled(instance, true);
    (void)otThreadSetEnabled(instance, true);
    esp_openthread_lock_release();
    esp_err_t err = communicate_send_frame(frame_id, CMD_ACK, NULL, 0);
    return (err == ESP_OK) ? 0 : -1;
}

int communicate_command_handle_thread_stop(uint8_t frame_id)
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
    (void)otThreadSetEnabled(instance, false);
    (void)otIp6SetEnabled(instance, false);
    esp_openthread_lock_release();
    esp_err_t err = communicate_send_frame(frame_id, CMD_ACK, NULL, 0);
    return (err == ESP_OK) ? 0 : -1;
}

int communicate_command_handle_thread_version(uint8_t frame_id)
{
    const char *version = otGetVersionString();
    if (version == NULL) {
        send_nack(frame_id, 0x02); /* Not ready */
        return -1;
    }
    size_t len = strlen(version);
    if (len > 64) {
        len = 64;
    }
    esp_err_t err = communicate_send_frame(frame_id, CMD_ACK, (const uint8_t *)version, len);
    return (err == ESP_OK) ? 0 : -1;
}
