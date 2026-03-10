/*
 * OpenThread change detector: event-driven snapshot+diff.
 */

#include "openthread/ot_change_detector.h"

#include <inttypes.h>
#include <string.h>

#include "esp_log.h"
#include "esp_openthread_lock.h"
#include "esp_timer.h"
#include "freertos/task.h"

#include "openthread/dataset.h"
#include "openthread/ip6.h"
#include "openthread/thread.h"

#include "openthread/ot_table_snapshot.h"

#include "br_config.h"

#define TAG "ot_change"

#define DEBOUNCE_MS 250

/* Snapshot buffer sizes match current communicate protocol packers. */
#define SNAPSHOT_ROUTER_BUF 256
#define SNAPSHOT_CHILD_BUF  512
#define SNAPSHOT_JOINER_BUF 512
#define SNAPSHOT_DATASET_BUF 256

typedef struct {
    uint8_t role;

    uint8_t leader_rloc[16];
    bool leader_rloc_valid;

    uint8_t dataset_tlvs[SNAPSHOT_DATASET_BUF];
    uint16_t dataset_len;

    uint8_t router_tbl[SNAPSHOT_ROUTER_BUF];
    uint16_t router_len;

    uint8_t child_tbl[SNAPSHOT_CHILD_BUF];
    uint16_t child_len;

    uint8_t joiner_tbl[SNAPSHOT_JOINER_BUF];
    uint16_t joiner_len;
} snapshots_t;

static otInstance *s_instance;
static esp_timer_handle_t s_debounce_timer;
static TaskHandle_t s_task;

static portMUX_TYPE s_mux = portMUX_INITIALIZER_UNLOCKED;
static volatile uint32_t s_pending_flags_u32;
static volatile uint32_t s_changed_mask;

static snapshots_t s_prev;
static bool s_prev_valid;

static inline uint32_t take_and_clear_u32(volatile uint32_t *p)
{
    uint32_t v;
    portENTER_CRITICAL(&s_mux);
    v = *p;
    *p = 0;
    portEXIT_CRITICAL(&s_mux);
    return v;
}

static inline void or_u32(volatile uint32_t *p, uint32_t bits)
{
    portENTER_CRITICAL(&s_mux);
    *p |= bits;
    portEXIT_CRITICAL(&s_mux);
}

static inline uint32_t take_and_clear_flags_u32(volatile uint32_t *p)
{
    return take_and_clear_u32(p);
}

static inline void or_flags_u32(volatile uint32_t *p, uint32_t flags)
{
    or_u32(p, flags);
}

static bool snapshot_equal_blob(const uint8_t *a, uint16_t a_len, const uint8_t *b, uint16_t b_len)
{
    if (a_len != b_len) {
        return false;
    }
    if (a_len == 0) {
        return true;
    }
    return memcmp(a, b, a_len) == 0;
}

static bool build_snapshots_locked(snapshots_t *out)
{
    memset(out, 0, sizeof(*out));

    /* role */
    out->role = (uint8_t)otThreadGetDeviceRole(s_instance);

    /* leader rloc (used by current protocol) */
    otIp6Address addr;
    if (otThreadGetLeaderRloc(s_instance, &addr) == OT_ERROR_NONE) {
        memcpy(out->leader_rloc, addr.mFields.m8, sizeof(out->leader_rloc));
        out->leader_rloc_valid = true;
    } else {
        out->leader_rloc_valid = false;
    }

    /* active dataset tlvs */
    otOperationalDatasetTlvs tlvs;
    otError err = otDatasetGetActiveTlvs(s_instance, &tlvs);
    if (err == OT_ERROR_NONE && tlvs.mLength > 0) {
        uint16_t n = (uint16_t)tlvs.mLength;
        if (n > SNAPSHOT_DATASET_BUF) {
            n = SNAPSHOT_DATASET_BUF;
        }
        memcpy(out->dataset_tlvs, tlvs.mTlvs, n);
        out->dataset_len = n;
    } else {
        out->dataset_len = 0;
    }

    /* tables */
    size_t n = 0;
    if (ot_snapshot_build_router_table(s_instance, out->router_tbl, sizeof(out->router_tbl), &n)) {
        out->router_len = (uint16_t)n;
    }
    n = 0;
    if (ot_snapshot_build_child_table(s_instance, out->child_tbl, sizeof(out->child_tbl), &n)) {
        out->child_len = (uint16_t)n;
    }
    n = 0;
    if (ot_snapshot_build_joiner_table(s_instance, out->joiner_tbl, sizeof(out->joiner_tbl), &n)) {
        out->joiner_len = (uint16_t)n;
    }

    return true;
}

static void compute_diff_and_update(const snapshots_t *cur)
{
    uint32_t mask = 0;
    if (!s_prev_valid) {
        mask = OT_CHANGED_MASK_ROLE | OT_CHANGED_MASK_IP | OT_CHANGED_MASK_DATASET |
               OT_CHANGED_MASK_ROUTER_TBL | OT_CHANGED_MASK_CHILD_TBL | OT_CHANGED_MASK_JOINER_TBL;
    } else {
        if (cur->role != s_prev.role) {
            mask |= OT_CHANGED_MASK_ROLE;
        }

        if (cur->leader_rloc_valid != s_prev.leader_rloc_valid ||
            (cur->leader_rloc_valid && memcmp(cur->leader_rloc, s_prev.leader_rloc, sizeof(cur->leader_rloc)) != 0)) {
            mask |= OT_CHANGED_MASK_IP;
        }

        if (!snapshot_equal_blob(cur->dataset_tlvs, cur->dataset_len, s_prev.dataset_tlvs, s_prev.dataset_len)) {
            mask |= OT_CHANGED_MASK_DATASET;
        }
        if (!snapshot_equal_blob(cur->router_tbl, cur->router_len, s_prev.router_tbl, s_prev.router_len)) {
            mask |= OT_CHANGED_MASK_ROUTER_TBL;
        }
        if (!snapshot_equal_blob(cur->child_tbl, cur->child_len, s_prev.child_tbl, s_prev.child_len)) {
            mask |= OT_CHANGED_MASK_CHILD_TBL;
        }
        if (!snapshot_equal_blob(cur->joiner_tbl, cur->joiner_len, s_prev.joiner_tbl, s_prev.joiner_len)) {
            mask |= OT_CHANGED_MASK_JOINER_TBL;
        }
    }

    if (mask != 0) {
        or_u32(&s_changed_mask, mask);
        ESP_LOGI(TAG, "changed mask=0x%08" PRIx32 " role=%u rloc=%s dataset_len=%u router_len=%u child_len=%u joiner_len=%u",
                 mask,
                 (unsigned)cur->role,
                 cur->leader_rloc_valid ? "yes" : "no",
                 (unsigned)cur->dataset_len,
                 (unsigned)cur->router_len,
                 (unsigned)cur->child_len,
                 (unsigned)cur->joiner_len);
    }

    s_prev = *cur;
    s_prev_valid = true;
}

static void detector_task(void *pv)
{
    (void)pv;
    for (;;) {
        /* Wait until debounce timer fires and notifies us. */
        (void)ulTaskNotifyTake(pdTRUE, portMAX_DELAY);

        /* Drain pending flags (for logging / future routing). */
        uint32_t flags_u32 = take_and_clear_flags_u32(&s_pending_flags_u32);

        if (!s_instance) {
            continue;
        }

        if (!esp_openthread_lock_acquire(pdMS_TO_TICKS(1000))) {
            ESP_LOGW(TAG, "lock timeout, skip snapshot (flags=0x%08" PRIx32 ")", flags_u32);
            continue;
        }
        snapshots_t cur;
        (void)build_snapshots_locked(&cur);
        esp_openthread_lock_release();

        ESP_LOGD(TAG, "snapshot built (flags=0x%08" PRIx32 ")", flags_u32);
        compute_diff_and_update(&cur);
    }
}

static void debounce_timer_cb(void *arg)
{
    (void)arg;
    if (s_task) {
        xTaskNotifyGive(s_task);
    }
}

static void on_ot_state_changed(otChangedFlags flags, void *context)
{
    (void)context;
    or_flags_u32(&s_pending_flags_u32, (uint32_t)flags);

    if (s_debounce_timer) {
        /* Restart debounce window. */
        (void)esp_timer_stop(s_debounce_timer);
        (void)esp_timer_start_once(s_debounce_timer, (uint64_t)DEBOUNCE_MS * 1000ULL);
    }
}

bool ot_change_detector_init(otInstance *instance)
{
    if (!instance || s_task != NULL) {
        return false;
    }
    s_instance = instance;
    s_pending_flags_u32 = 0;
    s_changed_mask = 0;
    s_prev_valid = false;

    if (xTaskCreate(detector_task, TASK_NAME_OT_CHANGE, TASK_STACK_OT_CHANGE, NULL, 4, &s_task) != pdPASS) {
        s_task = NULL;
        return false;
    }

    const esp_timer_create_args_t args = {
        .callback = debounce_timer_cb,
        .arg = NULL,
        .dispatch_method = ESP_TIMER_TASK,
        .name = "ot_change_db",
    };
    if (esp_timer_create(&args, &s_debounce_timer) != ESP_OK) {
        vTaskDelete(s_task);
        s_task = NULL;
        return false;
    }

    (void)otSetStateChangedCallback(instance, on_ot_state_changed, NULL);
    ESP_LOGI(TAG, "init OK (debounce=%ums)", (unsigned)DEBOUNCE_MS);
    return true;
}

uint32_t ot_change_detector_get_and_clear(void)
{
    return take_and_clear_u32(&s_changed_mask);
}
