/*
 * Device Registry Handler - Header file
 */

#pragma once

#include "openthread/coap.h"
#include "openthread/message.h"
#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

/** Initialize CoAP data queue */
esp_err_t device_registry_handler_init(void);

/** Enqueue CoAP data từ child device */
esp_err_t device_registry_enqueue_coap_data(const char *payload, uint16_t payload_len, uint16_t rloc16);

/** Dequeue và xử lý (output) toàn bộ CoAP data trong queue rồi clear queue */
void device_registry_process_and_clear_queue(void);

/** CoAP handler cho /device/register (giữ để tương thích; dùng chung qua device_registry_server) */
void device_registry_handler(void *aContext, otMessage *aMessage,
                             const otMessageInfo *aMessageInfo);

#ifdef __cplusplus
}
#endif
