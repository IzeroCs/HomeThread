/*
 * Leader Control Client - CoAP client để gửi lệnh đến Leader
 * Gửi command "stop" để yêu cầu Leader offline
 */

#ifndef LEADER_CONTROL_CLIENT_H
#define LEADER_CONTROL_CLIENT_H

#include "esp_err.h"

/**
 * @brief Initialize Leader Control Client
 * @return ESP_OK on success
 */
esp_err_t leader_control_client_init(void);

/**
 * @brief Get and log current Leader RLOC16
 * @return ESP_OK on success
 */
esp_err_t leader_control_log_leader_rloc16(void);

#endif // LEADER_CONTROL_CLIENT_H
