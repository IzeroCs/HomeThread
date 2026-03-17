/*
 * Entity CoAP Server - CoAP server để điều khiển entities qua CoAP.
 * Thay thế UDP server với CoAP protocol (reliable, observe, error codes).
 */
#pragma once

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Start CoAP server để nhận requests điều khiển entities.
 * Port: 5683 (CoAP default port).
 * Resources:
 *   - GET /entities → describe all entities
 *   - GET /entities/{entity_id} → get entity info
 *   - GET /entities/{entity_id}/{attr} → get attribute value
 *   - PUT /entities/{entity_id}/{attr} → set attribute value
 */
esp_err_t entity_coap_server_start(void);

#ifdef __cplusplus
}
#endif
