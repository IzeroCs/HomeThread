/*
 * Communicate command: handler cho CMD STATE, DATASET_ACTIVE, IP_ADDR.
 * Gọi từ communicate_task RX callback.
 */

#ifndef COMMUNICATE_COMMAND_H
#define COMMUNICATE_COMMAND_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Xử lý CMD_STATE: gửi CMD_ACK (không payload).
 * Trả 0 nếu gửi thành công, khác 0 nếu lỗi.
 */
int communicate_command_handle_state(uint8_t frame_id);

/**
 * Xử lý CMD_DATASET_ACTIVE: lấy Active Dataset TLV từ OpenThread, gửi CMD_ACK + TLV.
 * Trả 0 nếu thành công, khác 0 nếu lỗi (detached, lock fail, ...).
 */
int communicate_command_handle_dataset_active(uint8_t frame_id);

/**
 * Xử lý CMD_IP_ADDR: lấy IPv6 Leader RLOC (16 bytes), gửi CMD_ACK + 16 bytes.
 * Trả 0 nếu thành công, khác 0 nếu lỗi.
 */
int communicate_command_handle_ipaddr(uint8_t frame_id);

/**
 * Xử lý CMD_ROUTER_TABLE: lấy Router Table, gửi CMD_ACK + data (format: count + entries).
 * Mỗi entry: RouterId(1) + RLOC16(2) + ExtAddress(8) + LinkQualityIn(1) + LinkQualityOut(1) + Age(2) = 15 bytes.
 * Trả 0 nếu thành công, khác 0 nếu lỗi.
 */
int communicate_command_handle_router_table(uint8_t frame_id);

/**
 * Xử lý CMD_CHILD_TABLE: lấy Child Table, gửi CMD_ACK + data (format: count + entries).
 * Mỗi entry: ChildId(1) + RLOC16(2) + ExtAddress(8) + LinkQualityIn(1) + AverageRssi(1) + FullThreadDevice(1) + RxOnWhenIdle(1) + Age(2) = 17 bytes.
 * Trả 0 nếu thành công, khác 0 nếu lỗi.
 */
int communicate_command_handle_child_table(uint8_t frame_id);

/**
 * Xử lý CMD_JOINER_TABLE: lấy Commissioner Joiner Table, gửi CMD_ACK + data (format: count + entries).
 * Mỗi entry: Type(1) + SharedId(variable) + PSKD_length(1) + PSKD(variable) + ExpirationTime(4).
 * Trả 0 nếu thành công, khác 0 nếu lỗi.
 */
int communicate_command_handle_joiner_table(uint8_t frame_id);

/**
 * Xử lý CMD_SET_PANID: set PAN ID (DATA = 2 bytes big-endian, 0x0000–0xFFFE).
 * Trả 0 nếu thành công, khác 0 nếu lỗi.
 */
int communicate_command_handle_set_panid(uint8_t frame_id, const uint8_t *data, size_t len);

/**
 * Xử lý CMD_SET_CHANNEL: set channel (DATA = 1 byte, 11–26).
 * Trả 0 nếu thành công, khác 0 nếu lỗi.
 */
int communicate_command_handle_set_channel(uint8_t frame_id, const uint8_t *data, size_t len);

/**
 * Xử lý CMD_SET_NETWORK_NAME: set network name (DATA = UTF-8 string, null-terminated).
 * Trả 0 nếu thành công, khác 0 nếu lỗi.
 */
int communicate_command_handle_set_network_name(uint8_t frame_id, const uint8_t *data, size_t len);

/**
 * Xử lý CMD_SET_EXTENDED_PANID: set Extended PAN ID (DATA = 8 bytes).
 * Trả 0 nếu thành công, khác 0 nếu lỗi.
 */
int communicate_command_handle_set_extended_panid(uint8_t frame_id, const uint8_t *data, size_t len);

/**
 * Xử lý CMD_SET_NETWORK_KEY: set network key (DATA = 16 bytes).
 * Trả 0 nếu thành công, khác 0 nếu lỗi.
 */
int communicate_command_handle_set_network_key(uint8_t frame_id, const uint8_t *data, size_t len);

/**
 * Xử lý CMD_THREAD_START: bật IPv6 và Thread (ifconfig up + thread start).
 * Trả 0 nếu thành công, khác 0 nếu lỗi.
 */
int communicate_command_handle_thread_start(uint8_t frame_id);

/**
 * Xử lý CMD_THREAD_STOP: tắt Thread và IPv6.
 * Trả 0 nếu thành công, khác 0 nếu lỗi.
 */
int communicate_command_handle_thread_stop(uint8_t frame_id);

/**
 * Xử lý CMD_THREAD_VERSION: trả CMD_ACK + chuỗi version OpenThread (UTF-8, tối đa 64 bytes).
 * Trả 0 nếu thành công, khác 0 nếu lỗi.
 */
int communicate_command_handle_thread_version(uint8_t frame_id);

#ifdef __cplusplus
}
#endif

#endif /* COMMUNICATE_COMMAND_H */
