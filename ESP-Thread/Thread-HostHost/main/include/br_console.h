/*
 * SPDX-FileCopyrightText: 2025-2026 Espressif Systems (Shanghai) CO LTD
 * SPDX-License-Identifier: CC0-1.0
 */
#pragma once

#ifdef __cplusplus
extern "C" {
#endif

void br_console_start(void);
void br_console_stop(void);
void br_register_external_commands(void);

#ifdef __cplusplus
}
#endif
