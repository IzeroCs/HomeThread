/*
 * Device Update Handler - Header file
 */

#pragma once

#include "openthread/coap.h"
#include "openthread/message.h"

#ifdef __cplusplus
extern "C" {
#endif

/** CoAP handler cho /device/update */
void device_update_handler(void *aContext, otMessage *aMessage,
                          const otMessageInfo *aMessageInfo);

#ifdef __cplusplus
}
#endif
