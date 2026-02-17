/*
 * Device Registry Server - CoAP server để nhận đăng ký từ child devices.
 */

#pragma once

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

/** Khởi tạo CoAP server để nhận device registration. */
esp_err_t device_registry_server_init(void);

#ifdef __cplusplus
}
#endif
