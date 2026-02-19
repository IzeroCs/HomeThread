/*
 * Device Register Handler - Header file
 */

#pragma once

#include "openthread/coap.h"
#include "openthread/message.h"
#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

/** Initialize CoAP data queue */
esp_err_t device_register_handler_init(void);

/** Enqueue CoAP data từ child device */
esp_err_t device_register_enqueue_coap_data(const char *payload, uint16_t payload_len, uint16_t rloc16);

/** CoAP handler cho /device/register */
void device_register_handler(void *aContext, otMessage *aMessage,
                             const otMessageInfo *aMessageInfo);

#ifdef __cplusplus
}
#endif
