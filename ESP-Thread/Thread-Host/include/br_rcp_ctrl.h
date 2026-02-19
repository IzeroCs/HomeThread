/*
 * SPDX-FileCopyrightText: 2025-2026 Espressif Systems (Shanghai) CO LTD
 * SPDX-License-Identifier: CC0-1.0
 * Control RESET và BOOT pins của ESP32-H2 RCP từ ESP32-S3 Host.
 */

#pragma once

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * @brief Khởi tạo GPIO cho RESET và BOOT pins của RCP
 *
 * @return
 *      - ESP_OK: thành công
 *      - ESP_FAIL: lỗi config GPIO
 */
esp_err_t br_rcp_ctrl_init(void);

/**
 * @brief Reset ESP32-H2 RCP
 *
 * Sequence: Pull RESET LOW → delay 10ms → Pull RESET HIGH → delay 30ms
 */
void br_rcp_reset(void);

/**
 * @brief Đưa RCP vào download mode (để flash firmware)
 *
 * Sequence: BOOT=LOW → RESET=LOW → delay 10ms → RESET=HIGH
 * Giữ BOOT LOW trong khi flash, sau đó gọi br_rcp_exit_download_mode()
 */
void br_rcp_enter_download_mode(void);

/**
 * @brief Đưa RCP ra khỏi download mode (boot bình thường)
 *
 * Sequence: BOOT=HIGH → RESET=LOW → delay 10ms → RESET=HIGH
 */
void br_rcp_exit_download_mode(void);

#ifdef __cplusplus
}
#endif
