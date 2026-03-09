/*
 * Thread Joiner - Implementation.
 * OpenThread event -> otJoinerStart(pskd) -> on_joined khi join xong.
 */
#include <string.h>
#include "esp_err.h"
#include "esp_event.h"
#include "esp_log.h"
#include "esp_openthread.h"
#include "esp_openthread_lock.h"
#include "esp_openthread_types.h"
#include "openthread/dataset.h"
#include "openthread/error.h"
#include "openthread/instance.h"
#include "openthread/ip6.h"
#include "openthread/joiner.h"
#include "openthread/thread.h"
#include "sdkconfig.h"
/* Include OpenThread custom config để có OPENTHREAD_CONFIG_MLE_DEVICE_PROPERTY_LEADER_WEIGHT_ENABLE */
#include "../../../openthread_custom_config.h"
#if OPENTHREAD_FTD && OPENTHREAD_CONFIG_MLE_DEVICE_PROPERTY_LEADER_WEIGHT_ENABLE
#include "openthread/thread_ftd.h"
#endif
#include "thread_joiner.h"
#include "freertos/FreeRTOS.h"
#include "nvs.h"
#include "nvs_flash.h"
#include "esp_system.h"
#include "esp_timer.h"

static const char *TAG = "thread_joiner";

static void joiner_cb_wrapper(otError aError, void *aContext);

static thread_joiner_config_t s_config;
static bool s_joined;
static bool s_registered;
static esp_timer_handle_t s_retry_timer;

static void do_start_joiner(void)
{
    otInstance *instance = esp_openthread_get_instance();
    if (!instance) {
        ESP_LOGE(TAG, "OpenThread instance NULL");
        return;
    }

    /* Đã attach rồi (vd. reboot nhưng đã có dataset, stack tự attach) -> chỉ cần notify. */
    if (otThreadGetDeviceRole(instance) != OT_DEVICE_ROLE_DISABLED) {
        ESP_LOGI(TAG, "Already attached, notify on_joined");
        s_joined = true;
        if (s_config.on_joined) {
            s_config.on_joined(s_config.ctx);
        }
        return;
    }

    /* Có dataset trong NVS (đã join thành công trước đó) -> attach với dataset đó, không chạy joiner. */
    {
        otOperationalDataset dataset;
        if (otDatasetGetActive(instance, &dataset) == OT_ERROR_NONE &&
            dataset.mComponents.mIsChannelPresent) {
            ESP_LOGI(TAG, "Stored dataset found -> attach (no joiner)");
            if (!esp_openthread_lock_acquire(pdMS_TO_TICKS(1000))) {
                ESP_LOGE(TAG, "lock acquire failed");
                return;
            }
            otError err = otIp6SetEnabled(instance, true);
            if (err == OT_ERROR_NONE) {
                err = otThreadSetEnabled(instance, true);
            }
            esp_openthread_lock_release();
            if (err != OT_ERROR_NONE) {
                ESP_LOGW(TAG, "Attach with stored dataset failed: %s - will try joiner", otThreadErrorToString(err));
                /* Fall through to start joiner below. */
            } else {
                /* ATTACHED event sẽ tới sau, lúc đó do_start_joiner được gọi lại và role != DISABLED -> on_joined. */
                return;
            }
        }
    }

    /* Chưa có dataset -> chạy joiner để Commissioner cấp. */
    if (!esp_openthread_lock_acquire(portMAX_DELAY)) {
        ESP_LOGE(TAG, "lock acquire failed");
        return;
    }

    otError err = otIp6SetEnabled(instance, true);
    if (err != OT_ERROR_NONE) {
        ESP_LOGW(TAG, "otIp6SetEnabled: %s", otThreadErrorToString(err));
    }
    err = otJoinerStart(instance, s_config.pskd, NULL, NULL, NULL, NULL, NULL,
                       joiner_cb_wrapper, NULL);
    esp_openthread_lock_release();

    if (err != OT_ERROR_NONE) {
        ESP_LOGE(TAG, "otJoinerStart failed: %s (%d)", otThreadErrorToString(err), (int)err);
        return;
    }
    ESP_LOGI(TAG, "Joiner started, PSKd=\"%s\" - doi Commissioner", s_config.pskd);
}

static void retry_timer_cb(void *arg)
{
    (void)arg;
    if (s_joined) {
        return;
    }
    ESP_LOGI(TAG, "Joiner retry (Commissioner co the da san sang)");
    do_start_joiner();
}

static void joiner_callback(otError aError, void *aContext)
{
    (void)aContext;
    if (aError != OT_ERROR_NONE) {
        int retry_sec = (aError == OT_ERROR_NOT_FOUND)
                            ? (int)CONFIG_THREAD_JOINER_RETRY_NOT_FOUND_SEC
                            : (int)CONFIG_THREAD_JOINER_RETRY_SEC;
        ESP_LOGW(TAG, "Joiner failed: %s (%d) - retry sau %d s", otThreadErrorToString(aError), (int)aError, retry_sec);
        if (s_retry_timer) {
            esp_timer_start_once(s_retry_timer, (uint64_t)retry_sec * 1000000);
        }
        return;
    }

    if (s_retry_timer) {
        esp_timer_stop(s_retry_timer);
    }

    otInstance *instance = esp_openthread_get_instance();
    if (instance && esp_openthread_lock_acquire(pdMS_TO_TICKS(1000))) {
        otError err = otThreadSetEnabled(instance, true);
        esp_openthread_lock_release();
        if (err != OT_ERROR_NONE) {
            ESP_LOGE(TAG, "otThreadSetEnabled: %s", otThreadErrorToString(err));
            return;
        }
        ESP_LOGI(TAG, "Thread started (attach)");
    }

    s_joined = true;
    if (s_config.on_joined) {
        s_config.on_joined(s_config.ctx);
    }
}

static void on_openthread_event(void *arg, esp_event_base_t base, int32_t id, void *data)
{
    (void)arg;
    (void)base;
    (void)data;

    if (id == (int32_t)OPENTHREAD_EVENT_START ||
        id == (int32_t)OPENTHREAD_EVENT_ATTACHED ||
        id == (int32_t)OPENTHREAD_EVENT_IF_UP) {
        if (!s_joined) {
            do_start_joiner();
        }
    }
    if (id == (int32_t)OPENTHREAD_EVENT_DETACHED) {
        ESP_LOGI(TAG, "Detached");
        s_joined = false;
    }
}

/* Wrap joiner callback so we can pass it to otJoinerStart (context not used by OT). */
static void joiner_cb_wrapper(otError aError, void *aContext)
{
    joiner_callback(aError, aContext);
}

esp_err_t thread_joiner_start(const thread_joiner_config_t *config)
{
    if (config == NULL || config->pskd == NULL) {
        return ESP_ERR_INVALID_ARG;
    }
    if (s_registered) {
        return ESP_ERR_INVALID_STATE; /* already started */
    }

    memcpy(&s_config, config, sizeof(s_config));
    s_joined = false;

    esp_err_t err = esp_event_handler_instance_register(OPENTHREAD_EVENT, ESP_EVENT_ANY_ID,
                                                        on_openthread_event, NULL, NULL);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "event register failed: %s", esp_err_to_name(err));
        return err;
    }
    s_registered = true;

    s_retry_timer = NULL;
    if (CONFIG_THREAD_JOINER_RETRY_SEC > 0) {
        const esp_timer_create_args_t args = {
            .callback = &retry_timer_cb,
            .arg = NULL,
            .dispatch_method = ESP_TIMER_TASK,
            .name = "joiner_retry",
        };
        if (esp_timer_create(&args, &s_retry_timer) != ESP_OK) {
            s_retry_timer = NULL;
        }
    }

    /* Trigger joiner if OpenThread is already up. */
    otInstance *instance = esp_openthread_get_instance();
    if (instance && otThreadGetDeviceRole(instance) != OT_DEVICE_ROLE_DISABLED) {
        s_joined = true;
        if (s_config.on_joined) {
            s_config.on_joined(s_config.ctx);
        }
    } else {
        do_start_joiner();
    }

    return ESP_OK;
}

bool thread_joiner_is_joined(void)
{
    return s_joined;
}

esp_err_t thread_joiner_factory_reset(bool reboot)
{
    otInstance *instance = esp_openthread_get_instance();
    if (!instance) {
        return ESP_ERR_INVALID_STATE;
    }

    if (!esp_openthread_lock_acquire(pdMS_TO_TICKS(2000))) {
        return ESP_ERR_TIMEOUT;
    }

    /* OT chỉ cho erase khi role = DISABLED. */
    if (otThreadGetDeviceRole(instance) != OT_DEVICE_ROLE_DISABLED) {
        (void)otThreadSetEnabled(instance, false);
        (void)otIp6SetEnabled(instance, false);
    }
    esp_openthread_lock_release();

    /* Đợi role chuyển sang DISABLED (OT cập nhật không đồng bộ). */
    vTaskDelay(pdMS_TO_TICKS(800));

    /* Xóa NVS trước (erase + commit) để chắc chắn ghi xuống flash. otPlatSettingsWipe() không gọi commit. */
    nvs_handle_t nvs = 0;
    esp_err_t nvs_ret = nvs_open_from_partition("nvs", "openthread", NVS_READWRITE, &nvs);
    if (nvs_ret != ESP_OK) {
        nvs_ret = nvs_open("openthread", NVS_READWRITE, &nvs);
    }
    if (nvs_ret == ESP_OK) {
        nvs_ret = nvs_erase_all(nvs);
        if (nvs_ret == ESP_OK) {
            nvs_ret = nvs_commit(nvs);
        }
        nvs_close(nvs);
        if (nvs_ret == ESP_OK) {
            ESP_LOGI(TAG, "NVS openthread erased and committed.");
        } else {
            ESP_LOGE(TAG, "NVS erase/commit failed: %s", esp_err_to_name(nvs_ret));
        }
    } else {
        ESP_LOGE(TAG, "nvs_open openthread failed: %s", esp_err_to_name(nvs_ret));
    }

    if (!esp_openthread_lock_acquire(pdMS_TO_TICKS(2000))) {
        return ESP_ERR_TIMEOUT;
    }
    otError err = otInstanceErasePersistentInfo(instance);
    esp_openthread_lock_release();

    if (err != OT_ERROR_NONE) {
        ESP_LOGE(TAG, "otInstanceErasePersistentInfo: %s", otThreadErrorToString(err));
        /* Vẫn coi là đã xóa NVS ở trên, tiếp tục reboot. */
    }

    s_joined = false;
    ESP_LOGI(TAG, "Factory reset done.");
    if (reboot) {
        esp_restart();
    }
    return ESP_OK;
}

#if OPENTHREAD_FTD && OPENTHREAD_CONFIG_MLE_DEVICE_PROPERTY_LEADER_WEIGHT_ENABLE
void thread_joiner_set_prefer_not_leader(bool prefer_not_leader)
{
    otInstance *instance = esp_openthread_get_instance();
    if (!instance || !esp_openthread_lock_acquire(pdMS_TO_TICKS(500))) {
        return;
    }
    otDeviceProperties props;
    const otDeviceProperties *cur = otThreadGetDeviceProperties(instance);
    if (cur) {
        memcpy(&props, cur, sizeof(props));
    } else {
        memset(&props, 0, sizeof(props));
    }
    /* Cấu hình device properties cho endpoint: weight -16, không BR, battery, unstable */
    props.mLeaderWeightAdjustment = -16;
    props.mIsBorderRouter = false;
    props.mPowerSupply = OT_POWER_SUPPLY_BATTERY;
    props.mIsUnstable = true;

    otThreadSetDeviceProperties(instance, &props);
    otThreadSetPreferredLeaderPartitionId(instance, 0x00000000);
    ESP_LOGI(TAG, "Prefer not leader: %s -> weight_adj=%d (border_router=no, power=battery, unstable=yes)",
             prefer_not_leader ? "yes" : "no", (int)props.mLeaderWeightAdjustment);
    esp_openthread_lock_release();
}
#else
void thread_joiner_set_prefer_not_leader(bool prefer_not_leader)
{
    (void)prefer_not_leader;
    ESP_LOGI(TAG, "Prefer not leader: %s (disabled, no FTD/LEADER_WEIGHT)", prefer_not_leader ? "yes" : "no");
}
#endif
