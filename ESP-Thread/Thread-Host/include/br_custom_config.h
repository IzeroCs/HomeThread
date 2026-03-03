/*
 * OpenThread Custom Configuration
 * CoAP API, Ping Sender API, Leader Weight, SRP Server bật mặc định.
 */

#pragma once

#define OPENTHREAD_CONFIG_COAP_API_ENABLE 1
#define OPENTHREAD_CONFIG_PING_SENDER_ENABLE 1
#define OPENTHREAD_CONFIG_MLE_DEVICE_PROPERTY_LEADER_WEIGHT_ENABLE 1

/* SRP Server: cho phép Thread node (SRP client) đăng ký service, DNS-based service discovery */
#define OPENTHREAD_CONFIG_SRP_SERVER_ENABLE 1
