/*
 * State Change Notifier - Notify Backend khi có thay đổi state/network data
 */

#pragma once

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

/** Initialize state change notifier system */
esp_err_t state_change_notifier_init(void);

#ifdef __cplusplus
}
#endif
