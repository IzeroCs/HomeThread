/*
 * SPDX-FileCopyrightText: 2025
 *
 * SPDX-License-Identifier: CC0-1.0
 *
 * OpenThread Configuration for ESP32-C6 Endpoint
 * Target: ESP-IDF 5.5.2
 *
 * Platform config is built at runtime in main.c (see esp_openthread_platform_config_t
 * in esp_openthread_types.h) to avoid macro/union initializer issues.
 */

#pragma once

#include "esp_openthread_types.h"

/* ESP32-C6 uses native IEEE 802.15.4 when SOC_IEEE802154_SUPPORTED is set. */
