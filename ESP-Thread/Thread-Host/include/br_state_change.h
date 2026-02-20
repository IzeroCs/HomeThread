/*
 * BR state change: đăng ký OpenThread state changed callback, log khi state/ipaddr/dataset thay đổi.
 */

#pragma once

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Đăng ký callback OpenThread state change (otSetStateChangedCallback).
 * Gọi sau khi launch_openthread_border_router(); hiện chỉ log ra khi có thay đổi.
 */
esp_err_t br_state_change_init(void);

#ifdef __cplusplus
}
#endif
