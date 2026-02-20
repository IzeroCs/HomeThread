/*
 * Device Ping Handler - Header file
 */

#pragma once

#include "openthread/coap.h"
#include "openthread/message.h"

#ifdef __cplusplus
extern "C" {
#endif

/** CoAP handler cho /device/ping */
void device_ping_handler(void *aContext, otMessage *aMessage,
                        const otMessageInfo *aMessageInfo);

#ifdef __cplusplus
}
#endif
