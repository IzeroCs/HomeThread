/*
 * OpenThread custom config - override mac dinh.
 * File nay duoc include boi openthread-core-esp32x-*-config.h khi
 * CONFIG_OPENTHREAD_HEADER_CUSTOM=y trong menuconfig.
 *
 * Child timeout: thoi gian (giay) parent cho child khong phan hoi truoc khi xoa khoi child table.
 * Router table "reuse delay": thoi gian (100s) truoc khi Router ID co the tai su dung - hardcoded trong
 * OpenThread (router_table.hpp kReuseDelay), khong co OPENTHREAD_CONFIG, muon doi phai patch OpenThread.
 */

#ifndef OPENTHREAD_CUSTOM_CONFIG_H
#define OPENTHREAD_CUSTOM_CONFIG_H

/* FTD: cho phep dat Leader Weight adjustment (de goi thread_joiner_set_prefer_not_leader khi khong ket noi duoc). */
#ifndef OPENTHREAD_CONFIG_MLE_DEVICE_PROPERTY_LEADER_WEIGHT_ENABLE
#define OPENTHREAD_CONFIG_MLE_DEVICE_PROPERTY_LEADER_WEIGHT_ENABLE 1
#endif

/* Default 240 (sec). Giam xuong de child table cap nhat nhanh hon khi child mat ket noi. */
#ifndef OPENTHREAD_CONFIG_MLE_CHILD_TIMEOUT_DEFAULT
#define OPENTHREAD_CONFIG_MLE_CHILD_TIMEOUT_DEFAULT 60
#endif

/* Child supervision: neu child (sleepy) khong nhan duoc tin tu parent trong khoang nay (giay), child se re-attach.
 * Default 190. Co the giam de phat hien mat ket noi nhanh hon. */
#ifndef OPENTHREAD_CONFIG_CHILD_SUPERVISION_CHECK_TIMEOUT
#define OPENTHREAD_CONFIG_CHILD_SUPERVISION_CHECK_TIMEOUT 60
#endif

/* Khoang thoi gian (giay) parent gui supervision message cho child. Default 129. */
#ifndef OPENTHREAD_CONFIG_CHILD_SUPERVISION_INTERVAL
#define OPENTHREAD_CONFIG_CHILD_SUPERVISION_INTERVAL 30
#endif

/* CoAP API: cho phep dung otCoap de gui POST request (vd. register device len Leader). */
#ifndef OPENTHREAD_CONFIG_COAP_API_ENABLE
#define OPENTHREAD_CONFIG_COAP_API_ENABLE 1
#endif

#endif /* OPENTHREAD_CUSTOM_CONFIG_H */
