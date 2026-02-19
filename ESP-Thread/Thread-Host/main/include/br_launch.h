/*
 * SPDX-FileCopyrightText: 2021-2022 Espressif Systems (Shanghai) CO LTD
 * SPDX-License-Identifier: CC0-1.0
 */
#pragma once

#ifdef __cplusplus
extern "C" {
#endif

#include "esp_openthread_types.h"

void launch_openthread_border_router(const esp_openthread_config_t *config);

#ifdef __cplusplus
}
#endif
