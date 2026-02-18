/*
 * Network Stop Handler - CoAP handler for POST /network/stop command.
 *
 * Border Router gửi CoAP POST /network/stop đến Leader để yêu cầu Leader offline.
 * Leader sẽ stop Thread network, chờ 240s, rồi restart để Border Router có thể trở thành Leader.
 */
#pragma once

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Register CoAP resource /network/stop handler.
 *
 * Function này sẽ:
 * 1. Start CoAP server nếu chưa start
 * 2. Register resource /network với handler
 *
 * @param instance OpenThread instance
 * @return ESP_OK nếu thành công
 */
esp_err_t network_stop_handler_register(void);

#ifdef __cplusplus
}
#endif
