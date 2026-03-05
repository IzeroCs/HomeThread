/*
 * Communicate command: handler cho CMD STATE, DATASET_ACTIVE, IP_ADDR.
 */

#include "communicate/communicate_command.h"
#include "communicate/communicate.h"
#include "communicate/communicate_task.h"
#include "esp_log.h"
#include "esp_openthread.h"
#include "esp_openthread_lock.h"
#include "esp_partition.h"
#include "esp_system.h"
#include "esp_timer.h"
#include "nvs_flash.h"
#include "openthread/commissioner.h"
#include "openthread/device_role.h"
#include "openthread/dataset.h"
#include "openthread/instance.h"
#include "openthread/ip6.h"
#include "openthread/thread.h"
#include "openthread/thread_ftd.h"
#include "openthread/srp_client.h"
#include <string.h>

#define TAG "communicate_cmd"

#define LEADER_RLOC_LEN 16
/** Độ trễ (µs) trước khi thực thi reset/factory sau khi đã gửi ACK. */
#define CMD_EXEC_DELAY_US  (2000000ULL)

/* Cache leader RLOC (16 byte); refresh khi backend pull CMD_IP_ADDR. */
static uint8_t s_cached_leader_rloc[LEADER_RLOC_LEN];
static bool s_cached_leader_rloc_valid = false;

/* ---- Deferred reset / factory-reset (timer-based) ---- */

static esp_timer_handle_t s_reset_timer   = NULL;
static esp_timer_handle_t s_factory_timer = NULL;

/* SRP client: 1 service `_dashboard._udp` để backend tự đăng ký. */
#define SRP_HOSTNAME_MAX_LEN 63

static otSrpClientService s_srp_dashboard_service;
static bool s_srp_dashboard_service_inited = false;
/* OT SRP client lưu con trỏ hostname, không copy; phải dùng buffer tĩnh để tránh dangling pointer. */
static char s_srp_hostname[SRP_HOSTNAME_MAX_LEN + 1];

/** Dừng Thread stack và hạ IPv6 interface trước khi reset/factory. */
static void thread_graceful_shutdown(void)
{
    otInstance *instance = esp_openthread_get_instance();
    if (instance == NULL) {
        return;
    }
    if (!esp_openthread_lock_acquire(pdMS_TO_TICKS(2000))) {
        ESP_LOGW(TAG, "graceful shutdown: lock timeout, skipping");
        return;
    }
    (void)otThreadSetEnabled(instance, false);
    (void)otIp6SetEnabled(instance, false);
    esp_openthread_lock_release();
    ESP_LOGI(TAG, "graceful shutdown: thread stopped, ip6 down");
}

static void reset_timer_cb(void *arg)
{
    (void)arg;
    ESP_LOGW(TAG, "CMD_RESET: stopping thread then restarting");
    thread_graceful_shutdown();
    esp_restart();
}

/**
 * Erase NVS partition hoàn toàn ở mức flash raw.
 * KHÔNG dừng OpenThread trước — tránh OT write-back dataset vào NVS sau khi đã erase.
 * esp_restart() cắt đứt toàn bộ, không có gì kịp ghi lại.
 */
static void do_nvs_erase_and_restart(void)
{
    nvs_flash_deinit();

    const esp_partition_t *nvs_part = esp_partition_find_first(
        ESP_PARTITION_TYPE_DATA, ESP_PARTITION_SUBTYPE_DATA_NVS, "nvs");
    if (nvs_part != NULL) {
        esp_err_t err = esp_partition_erase_range(nvs_part, 0, nvs_part->size);
        if (err == ESP_OK) {
            ESP_LOGI(TAG, "NVS partition erased OK (%lu bytes)", (unsigned long)nvs_part->size);
        } else {
            ESP_LOGE(TAG, "partition erase failed: %s", esp_err_to_name(err));
        }
    } else {
        ESP_LOGW(TAG, "NVS partition not found, fallback nvs_flash_erase");
        nvs_flash_erase();
    }
    esp_restart();
}

static void factory_timer_cb(void *arg)
{
    (void)arg;
    ESP_LOGW(TAG, "CMD_FACTORY: erasing NVS partition then restarting");
    do_nvs_erase_and_restart();
}

/**
 * Tạo timer lần đầu (nếu chưa có) rồi start one-shot 2s.
 * Nếu timer đang chạy (lệnh reset/factory trước đó), stop rồi restart.
 */
static esp_err_t start_deferred_timer(esp_timer_handle_t *handle, esp_timer_cb_t cb, const char *name)
{
    if (*handle == NULL) {
        const esp_timer_create_args_t args = {
            .callback        = cb,
            .arg             = NULL,
            .dispatch_method = ESP_TIMER_TASK,
            .name            = name,
        };
        if (esp_timer_create(&args, handle) != ESP_OK) {
            return ESP_FAIL;
        }
    }
    esp_timer_stop(*handle); /* không lỗi nếu timer chưa chạy */
    return esp_timer_start_once(*handle, CMD_EXEC_DELAY_US);
}

/* ---- end deferred timer ---- */

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

int communicate_command_handle_reset(uint8_t frame_id)
{
    /* Gửi ACK ngay để backend nhận xác nhận, sau đó thực thi restart sau 2s. */
    esp_err_t err = communicate_send_frame(frame_id, CMD_ACK, NULL, 0);
    if (err != ESP_OK) {
        return -1;
    }
    if (start_deferred_timer(&s_reset_timer, reset_timer_cb, "cmd_reset") != ESP_OK) {
        ESP_LOGE(TAG, "CMD_RESET: timer failed, restarting immediately");
        esp_restart();
    }
    ESP_LOGW(TAG, "CMD_RESET: ACK sent, restarting in 2s");
    return 0;
}

int communicate_command_handle_factory(uint8_t frame_id)
{
    esp_err_t err = communicate_send_frame(frame_id, CMD_ACK, NULL, 0);
    if (err != ESP_OK) {
        return -1;
    }
    if (start_deferred_timer(&s_factory_timer, factory_timer_cb, "cmd_factory") != ESP_OK) {
        ESP_LOGE(TAG, "CMD_FACTORY: timer failed, doing factory reset immediately");
        nvs_flash_erase();
        esp_restart();
    }
    ESP_LOGW(TAG, "CMD_FACTORY: ACK sent, factory reset in 2s");
    return 0;
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

int communicate_command_handle_commissioner_joiner(uint8_t frame_id, const uint8_t *data, size_t len)
{
    /* Minimum: EUI64(8) + PSKD_len(1) + PSKD(min 1) + Timeout(4) = 14 bytes */
    if (data == NULL || len < 14) {
        send_nack(frame_id, 0x04); /* Invalid param */
        return -1;
    }

    const uint8_t *p = data;
    uint8_t eui64[8];
    memcpy(eui64, p, 8);
    p += 8;

    uint8_t pskd_len = *p++;
    if (pskd_len == 0 || pskd_len > OT_JOINER_MAX_PSKD_LENGTH) {
        send_nack(frame_id, 0x04); /* Invalid param */
        return -1;
    }

    /* Validate total frame length: 8 + 1 + pskd_len + 4 */
    if (len != (size_t)(8 + 1 + pskd_len + 4)) {
        send_nack(frame_id, 0x04); /* Invalid param */
        return -1;
    }

    char pskd_str[OT_JOINER_MAX_PSKD_LENGTH + 1];
    memcpy(pskd_str, p, pskd_len);
    pskd_str[pskd_len] = '\0';
    p += pskd_len;

    uint32_t timeout_s = ((uint32_t)p[0] << 24) | ((uint32_t)p[1] << 16)
                       | ((uint32_t)p[2] << 8)  |  (uint32_t)p[3];

    /* EUI64 all-zero → wildcard */
    static const uint8_t k_zero_eui64[8] = {0};
    bool is_wildcard = (memcmp(eui64, k_zero_eui64, 8) == 0);

    otInstance *instance = esp_openthread_get_instance();
    if (instance == NULL) {
        send_nack(frame_id, 0x02); /* Not ready */
        return -1;
    }

    if (!esp_openthread_lock_acquire(pdMS_TO_TICKS(2000))) {
        send_nack(frame_id, 0x03); /* Timeout */
        return -1;
    }

    /* Start commissioner nếu chưa active */
    otCommissionerState comm_state = otCommissionerGetState(instance);
    if (comm_state != OT_COMMISSIONER_STATE_ACTIVE) {
        otError start_err = otCommissionerStart(instance, NULL, NULL, NULL);
        if (start_err != OT_ERROR_NONE && start_err != OT_ERROR_ALREADY) {
            esp_openthread_lock_release();
            ESP_LOGE(TAG, "otCommissionerStart failed: %d", start_err);
            send_nack(frame_id, 0x02); /* Not ready */
            return -1;
        }
        esp_openthread_lock_release();

        /* Chờ commissioner chuyển sang ACTIVE; release lock giữa các lần check
         * để OT task xử lý được petition. Timeout 5s. */
        ESP_LOGI(TAG, "Commissioner: waiting for ACTIVE state...");
        const TickType_t deadline = xTaskGetTickCount() + pdMS_TO_TICKS(1000);
        bool became_active = false;
        while (xTaskGetTickCount() < deadline) {
            vTaskDelay(pdMS_TO_TICKS(200));
            if (!esp_openthread_lock_acquire(pdMS_TO_TICKS(500))) {
                continue;
            }
            comm_state = otCommissionerGetState(instance);
            esp_openthread_lock_release();
            if (comm_state == OT_COMMISSIONER_STATE_ACTIVE) {
                became_active = true;
                break;
            }
        }

        if (!became_active) {
            ESP_LOGE(TAG, "Commissioner: timed out waiting for ACTIVE (state=%d)", (int)comm_state);
            send_nack(frame_id, 0x02); /* Not ready */
            return -1;
        }

        ESP_LOGI(TAG, "Commissioner: ACTIVE");
        if (!esp_openthread_lock_acquire(pdMS_TO_TICKS(2000))) {
            send_nack(frame_id, 0x03); /* Timeout */
            return -1;
        }
    }

    otExtAddress ot_eui64;
    memcpy(ot_eui64.m8, eui64, 8);

    otError ot_err = otCommissionerAddJoiner(
        instance,
        is_wildcard ? NULL : &ot_eui64,
        pskd_str,
        timeout_s
    );
    esp_openthread_lock_release();

    if (ot_err != OT_ERROR_NONE) {
        ESP_LOGE(TAG, "otCommissionerAddJoiner failed: %d (pskd=%s, timeout=%lu, wildcard=%d)",
                 ot_err, pskd_str, (unsigned long)timeout_s, (int)is_wildcard);
        uint8_t nack_code = (ot_err == OT_ERROR_INVALID_ARGS) ? 0x04 : 0x02;
        send_nack(frame_id, nack_code);
        return -1;
    }

    ESP_LOGI(TAG, "Commissioner: joiner added pskd=%s timeout=%lus wildcard=%d",
             pskd_str, (unsigned long)timeout_s, (int)is_wildcard);
    esp_err_t err = communicate_send_frame(frame_id, CMD_ACK, NULL, 0);
    return (err == ESP_OK) ? 0 : -1;
}

int communicate_command_handle_srp_register(uint8_t frame_id, const uint8_t *data, size_t len)
{
    if (data == NULL || len < (size_t)(1 + 16 + 2)) {
        send_nack(frame_id, 0x04); /* Invalid param */
        return -1;
    }

    const uint8_t *p = data;
    uint8_t hostname_len = *p++;
    if (hostname_len == 0 || hostname_len > SRP_HOSTNAME_MAX_LEN) {
        send_nack(frame_id, 0x04); /* Invalid param */
        return -1;
    }

    /* Tổng độ dài: 1 + hostname_len + 16 (IPv6) + 2 (port) */
    if (len != (size_t)(1 + hostname_len + 16 + 2)) {
        send_nack(frame_id, 0x04); /* Invalid param (TXT chưa được hỗ trợ trong phiên bản này) */
        return -1;
    }

    char hostname[SRP_HOSTNAME_MAX_LEN + 1];
    memcpy(hostname, p, hostname_len);
    hostname[hostname_len] = '\0';
    p += hostname_len;

    if (hostname[0] == '\0') {
        ESP_LOGW(TAG, "SRP: hostname empty (len=%u), reject", (unsigned)hostname_len);
        send_nack(frame_id, 0x04);
        return -1;
    }
    memcpy(s_srp_hostname, hostname, (size_t)hostname_len + 1);

    otIp6Address backend_addr;
    memcpy(&backend_addr, p, sizeof(backend_addr));
    p += sizeof(backend_addr);

    uint16_t port = ((uint16_t)p[0] << 8) | (uint16_t)p[1];
    if (port == 0) {
        send_nack(frame_id, 0x04); /* Invalid param */
        return -1;
    }

    {
        char ip6_str[44];
        const uint8_t *a = backend_addr.mFields.m8;
        snprintf(ip6_str, sizeof(ip6_str),
                 "%02x%02x:%02x%02x:%02x%02x:%02x%02x:%02x%02x:%02x%02x:%02x%02x:%02x%02x",
                 a[0], a[1], a[2], a[3], a[4], a[5], a[6], a[7],
                 a[8], a[9], a[10], a[11], a[12], a[13], a[14], a[15]);
        ESP_LOGI(TAG, "SRP register from backend: host=%s port=%u ipv6=%s",
                 hostname, (unsigned)port, ip6_str);
    }

    otInstance *instance = esp_openthread_get_instance();
    if (instance == NULL) {
        send_nack(frame_id, 0x02); /* Not ready */
        return -1;
    }

    if (!esp_openthread_lock_acquire(pdMS_TO_TICKS(2000))) {
        send_nack(frame_id, 0x03); /* Timeout */
        return -1;
    }

    /* Bật auto-start mode để SRP client tự tìm SRP server trong mesh. */
    (void)otSrpClientEnableAutoStartMode(instance, NULL, NULL);

    /* Clear host + services cũ trước khi đăng ký lại. */
    (void)otSrpClientClearHostAndServices(instance);

    otError ot_err = otSrpClientSetHostName(instance, s_srp_hostname);
    if (ot_err != OT_ERROR_NONE) {
        esp_openthread_lock_release();
        ESP_LOGE(TAG, "SRP: otSrpClientSetHostName failed: %d", ot_err);
        send_nack(frame_id, 0x02); /* Not ready */
        return -1;
    }

    ot_err = otSrpClientSetHostAddresses(instance, &backend_addr, 1);
    if (ot_err != OT_ERROR_NONE) {
        esp_openthread_lock_release();
        ESP_LOGE(TAG, "SRP: otSrpClientSetHostAddresses failed: %d", ot_err);
        send_nack(frame_id, 0x02); /* Not ready */
        return -1;
    }

    /* Lease: server requires key lease >= lease; use 60/120 to avoid server reject. */
    (void)otSrpClientSetLeaseInterval(instance, 60);
    (void)otSrpClientSetKeyLeaseInterval(instance, 120);

    if (!s_srp_dashboard_service_inited) {
        memset(&s_srp_dashboard_service, 0, sizeof(s_srp_dashboard_service));
        s_srp_dashboard_service.mName = "_dashboard._udp";
        s_srp_dashboard_service.mInstanceName = "dashboard";
        s_srp_dashboard_service.mPriority = 0;
        s_srp_dashboard_service.mWeight = 0;
        s_srp_dashboard_service.mSubTypeLabels = NULL;
        s_srp_dashboard_service.mTxtEntries = NULL;
        s_srp_dashboard_service.mNumTxtEntries = 0;
        s_srp_dashboard_service.mLease = 60;
        s_srp_dashboard_service.mKeyLease = 120;
        s_srp_dashboard_service_inited = true;
    }

    s_srp_dashboard_service.mPort = port;

    ot_err = otSrpClientAddService(instance, &s_srp_dashboard_service);
    esp_openthread_lock_release();
    if (ot_err != OT_ERROR_NONE) {
        ESP_LOGE(TAG, "SRP: otSrpClientAddService failed: %d", ot_err);
        send_nack(frame_id, 0x02); /* Not ready */
        return -1;
    }

    /* SRP client đã bật auto-start; sau khi set host + address + add service sẽ tự gửi SRP Update.
     * Không gọi otSrpClientStart(instance, NULL) — API dereference server addr → crash. */
    ESP_LOGI(TAG, "SRP register OK: _dashboard._udp -> %s port %u (ACK sent)", hostname, (unsigned)port);
    esp_err_t err = communicate_send_frame(frame_id, CMD_ACK, NULL, 0);
    return (err == ESP_OK) ? 0 : -1;
}
