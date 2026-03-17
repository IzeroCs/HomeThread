/*
 * Communicate command: handler cho tất cả CMD (STATE, DATASET_ACTIVE, IP_ADDR, SET_*, TABLE, THREAD_*, RESET, FACTORY, COMMISSIONER_JOINER).
 * Gọi từ communicate_queue process_task.
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
 * Xử lý CMD_MAC_ADDRESS: đọc EUI-64 IEEE802154 (8 bytes) từ eFuse, gửi CMD_ACK + 8 bytes.
 * Trả 0 nếu thành công, khác 0 nếu lỗi.
 */
int communicate_command_handle_mac_address(uint8_t frame_id);

/**
 * Xử lý CMD_BR_HEALTH: trả ACK + 16 bytes (free_heap, minimum_free_heap, uptime, mle_detach_count), mỗi field uint32 BE.
 * Trả 0 nếu thành công, khác 0 nếu lỗi.
 */
int communicate_command_handle_br_health(uint8_t frame_id);

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

/**
 * Xử lý CMD_RESET (0x10): gửi CMD_ACK ngay, sau 2s thực thi esp_restart().
 * Không yêu cầu DATA. Trả 0 nếu gửi ACK thành công, -1 nếu lỗi gửi frame.
 */
int communicate_command_handle_reset(uint8_t frame_id);

/**
 * Xử lý CMD_FACTORY (0x11): xóa NVS (nvs_flash_erase) rồi esp_restart() — giống boot button long press.
 * Gửi CMD_ACK ngay, sau 2s thực thi factory reset. Không yêu cầu DATA.
 * Trả 0 nếu gửi ACK thành công, -1 nếu lỗi gửi frame.
 */
int communicate_command_handle_factory(uint8_t frame_id);

/**
 * Xử lý CMD_COMMISSIONER_JOINER (0x43): thêm joiner vào commissioner.
 * DATA = EUI64(8) + PSKD_len(1) + PSKD(1–32 bytes) + Timeout(4, uint32 big-endian, giây).
 * EUI64 all-zero = wildcard (chấp nhận mọi joiner).
 * Tự động start commissioner nếu chưa active.
 * Trả CMD_ACK (DATA rỗng) hoặc CMD_NACK (0x02 not ready, 0x04 invalid param).
 */
int communicate_command_handle_commissioner_joiner(uint8_t frame_id, const uint8_t *data, size_t len);

/**
 * Xử lý CMD_SRP_REGISTER (0x44): BR dùng SRP client để đăng ký backend `_dashboard._udp`.
 * DATA format (đơn giản, TXT dùng mặc định trong firmware):
 *   - hostname_len(1)  : số byte hostname (1–63)
 *   - hostname(N)      : UTF-8 hostname (không null-terminated)
 *   - backend_ipv6(16) : IPv6 AAAA của backend (network-order)
 *   - port(2)          : uint16 big-endian (CoAP port backend, ví dụ 5683)
 * Tổng độ dài = 1 + hostname_len + 16 + 2.
 * Firmware sẽ:
 *   - Clear SRP host + services hiện tại
 *   - Set host name + host AAAA
 *   - Đăng ký 1 service `_dashboard._udp` với instance fixed "dashboard"
 * TXT hiện được cố định trong firmware: ["ver=1", "proto=coap+cbor", "path=/child"].
 * Trả CMD_ACK (DATA rỗng) nếu submit OK vào SRP client, CMD_NACK nếu invalid param / not ready / timeout.
 */
int communicate_command_handle_srp_register(uint8_t frame_id, const uint8_t *data, size_t len);

#ifdef __cplusplus
}
#endif

#endif /* COMMUNICATE_COMMAND_H */
