/*
 * OpenThread change detector: event-driven snapshot+diff.
 *
 * This module observes OpenThread state changes via otSetStateChangedCallback(),
 * debounces bursts, then rebuilds snapshots (role/rloc/dataset/tables) under the
 * OpenThread lock and computes a changed bitmask.
 *
 * It does NOT notify the backend yet. It only exposes a "get and clear" API.
 */

#ifndef OT_CHANGE_DETECTOR_H
#define OT_CHANGE_DETECTOR_H

#include <stdbool.h>
#include <stdint.h>

#include "openthread/instance.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef enum {
    OT_CHANGED_MASK_ROLE        = (1u << 0),
    OT_CHANGED_MASK_IP          = (1u << 1),
    OT_CHANGED_MASK_DATASET     = (1u << 2),
    OT_CHANGED_MASK_ROUTER_TBL  = (1u << 3),
    OT_CHANGED_MASK_CHILD_TBL   = (1u << 4),
    OT_CHANGED_MASK_JOINER_TBL  = (1u << 5),
} ot_change_mask_t;

/**
 * Initialize detector and register OT state changed callback.
 *
 * - Safe to call once after OpenThread is started and instance exists.
 * - Returns false on allocation/task/timer failures.
 */
bool ot_change_detector_init(otInstance *instance);

/**
 * Get current changed_mask and clear it atomically.
 *
 * Returns the previous mask value (0 means no changes since last call).
 */
uint32_t ot_change_detector_get_and_clear(void);

#ifdef __cplusplus
}
#endif

#endif /* OT_CHANGE_DETECTOR_H */

