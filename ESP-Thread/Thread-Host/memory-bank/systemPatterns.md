# System Patterns — Thread-Host

## Kiến trúc tổng quan

```
[ESP32-H2 RCP] --UART1 460800--> [ESP32-S3 Host]
                                        |
                              [OpenThread Stack]
                                        |
         [Backhaul: Ethernet W5500 only (Wi‑Fi fallback tắt)] → backbone netif
                                        |
                    +-----------+-------+--------+-----------+
                    |           |                |           |
              [CoAP Client]  [Frame Protocol] [LED/Button]
              leader_rloc    communicate     hardware
                    |           |                |
              Thread net   TCP listen       [Backbone IP]
                    |           |                |
              Border routing   [Dashboard kết nối BR_IP:port]
              + prefix
```

## app_main — Thứ tự khởi động

```
nvs_flash_init → esp_netif_init → esp_event_loop
→ Backhaul: eth_w5500_init() (nếu CONFIG_BR_ETH_W5500_ENABLE); timeout thì không backbone (Wi‑Fi fallback đã tắt)
→ set_backbone_netif(backbone)   (trước OT start)
→ mdns("Thread-Host")
→ br_rcp_ctrl_init + br_rcp_reset + delay 500ms
→ launch_openthread_border_router   (OT main task, max leader weight)
→ openthread_dataset_init_on_boot   (tạo dataset "ESP-BR-<MAC>" nếu chưa có)
→ esp_openthread_border_router_init()   (routing + prefix)
→ communicate_task_start            (queue + watchdog + transport TCP)
→ led_status_start, leader_control_client_init, boot_btn_start
→ xTaskCreate(stack_monitor_task)   (log HWM mỗi 30s)
```

## Task Inventory

| Task name | Define | Stack | Priority | Mục đích |
|-----------|--------|-------|----------|----------|
| `main` | `TASK_NAME_MAIN` | `TASK_STACK_MAIN` | default | OT main loop |
| `comm_queue` | `TASK_NAME_COMM_QUEUE` | 10240 | 5 | Dispatch frame → handler |
| `comm_task` | `TASK_NAME_COMM_TASK` | 4096 | 5 | State watchdog |
| `tcp_rx` | `TASK_NAME_TCP_RX` | 4096 | 5 | Đọc byte từ socket TCP (frame từ dashboard) |
| `led_status` | `TASK_NAME_LED_STATUS` | 2048 | 5 | WS2812 theo OT role (dùng last-known role khi lock timeout) |
| `boot_btn` | `TASK_NAME_BOOT_BTN` | 4096 | 0 | Poll GPIO0 |
| `leader_rloc` | `TASK_NAME_LEADER_RLOC` | 4096 | 5 | CoAP GET /network/stop |
| `stk_mon` | `TASK_NAME_STK_MON` | 3072 | 2 | Log HWM + heap mỗi 30s |

**Centralized config:** `include/br_config.h` — tất cả `TASK_NAME_*` và `TASK_STACK_*`

**CRITICAL:** FreeRTOS `configMAX_TASK_NAME_LEN = 16` → task name tối đa **15 ký tự**.
`xTaskGetHandle` sẽ assert nếu tên > 15 ký tự.

**LED status:** Task poll `otThreadGetDeviceRole()` mỗi 300ms với lock 200ms. Khi lock timeout (vd. OT bận lúc joiner join), dùng **last-known role** thay vì mặc định DISABLED để tránh nháy đỏ sai.

## Frame Protocol Pipeline

```
TCP socket bytes
  → tcp_rx task → on_transport_rx() [communicate.c — parser]
      → rx_cb [communicate_task.c]
          ├── CMD_ACK cho IP pending → clear retry timer
          └── else → communicate_queue_post() [queue depth=16, timeout 500ms]
                        → process_task (comm_queue, prio 5)
                            → communicate_command_handle_*()
                                → communicate_send_frame() → transport_tcp (socket)
```

Frame format: `[0xAA][FrameID][CMD][LEN_H][LEN_L][DATA×LEN][CRC8][0x55]`
CRC8/MAXIM: poly=0x31, init=0x00, input=`[FrameID, CMD, LEN_H, LEN_L, DATA...]`

**Logging:** CMD noisy (STATE, *_TABLE) và ACK tương ứng: **INFO** không log; **DEBUG** log đầy đủ `frame RX`/`frame TX`. Transport: `transport_tcp` log `tcp rx N bytes` / `tcp tx N bytes` ở DEBUG. Bật DEBUG cho tag `communicate` và `transport_tcp` khi cần debug kênh frame.

## OpenThread Lock Pattern

```c
// MỌI OT API call từ task ngoài OT main task phải bracket bằng lock
if (!esp_openthread_lock_acquire(pdMS_TO_TICKS(1000))) {
    send_nack(frame_id, 0x03); // Timeout
    return -1;
}
// otXxx() calls...
esp_openthread_lock_release();
```

**Timeout conventions:**
- 500ms: CMD_STATE, IP_ADDR cache refresh
- 1000ms: dataset, tables, SET_*, thread start/stop, leader CoAP tasks
- 2000ms: CMD_COMMISSIONER_JOINER, thread_graceful_shutdown

**NACK error codes:** 0x01 invalid cmd, 0x02 not ready, 0x03 lock timeout, 0x04 invalid param, 0x05 busy

### Exception — Commissioner
Sau `otCommissionerStart()`, **phải release lock** trước khi poll state (vòng lặp 200ms, timeout 1s). OT task cần lock để xử lý petition. Sau khi ACTIVE → re-acquire → gọi `otCommissionerAddJoiner`.

### Exception — Leader CoAP send
`send_coap_stop_command_once()` tự quản lý lock bên trong. Caller **release lock trước khi gọi**, dùng `goto next_iteration` để skip `lock_release()` bên dưới.

## Pattern: Deferred Action (Timer)

`CMD_RESET` và `CMD_FACTORY` dùng `esp_timer_start_once` (2s delay) để:
1. Gửi ACK ngay cho backend
2. Thực hiện action sau 2s (đủ thời gian ACK được gửi đi)

```c
// Pattern trong communicate_command.c
esp_err_t err = communicate_send_frame(frame_id, CMD_ACK, NULL, 0);
start_deferred_timer(&s_reset_timer, reset_timer_cb, "cmd_reset");
```

## Pattern: Factory Reset

```c
// ĐÚNG — raw partition erase, KHÔNG stop OT trước
nvs_flash_deinit();
esp_partition_t *nvs_part = esp_partition_find_first(..., "nvs");
esp_partition_erase_range(nvs_part, 0, nvs_part->size);
esp_restart();

// SAI — OT sẽ write-back dataset vào NVS sau khi erase
otThreadSetEnabled(false); // ← gây ra write-back
nvs_flash_erase();         // ← erase bị vô hiệu hóa
```

## Pattern: State Watchdog

`comm_task` (state watchdog): mỗi 15s check `s_state_received`. Nếu backend không gửi `CMD_STATE` trong 5 lần liên tiếp (75s tổng) → `esp_restart()`.

## CMD Table

| CMD | Hex | Hướng | Ghi chú |
|-----|-----|-------|---------|
| CMD_DATA | 0x01 | ESP→Node | Push CBOR |
| CMD_ACK | 0x02 | ESP→Node | Response OK |
| CMD_NACK | 0x03 | ESP→Node | + 1 byte error code |
| CMD_RESET | 0x10 | Node→ESP | ACK + graceful shutdown + restart sau 2s |
| CMD_FACTORY | 0x11 | Node→ESP | ACK + raw NVS erase + restart sau 2s |
| CMD_STATE | 0x12 | Node→ESP | Heartbeat → ACK + 1 byte role |
| CMD_IP_ADDR | 0x13 | Node→ESP | → ACK + 16 bytes Leader RLOC |
| CMD_DATASET_ACTIVE | 0x14 | Node→ESP | → ACK + TLV binary |
| CMD_SET_PANID | 0x20 | Node→ESP | 2 bytes big-endian |
| CMD_SET_CHANNEL | 0x21 | Node→ESP | 1 byte, 11–26 |
| CMD_SET_NETWORK_NAME | 0x22 | Node→ESP | UTF-8 string |
| CMD_SET_EXTENDED_PANID | 0x23 | Node→ESP | 8 bytes |
| CMD_SET_NETWORK_KEY | 0x24 | Node→ESP | 16 bytes |
| CMD_ROUTER_TABLE | 0x30 | Node→ESP | → ACK + count + entries |
| CMD_CHILD_TABLE | 0x31 | Node→ESP | → ACK + count + entries |
| CMD_JOINER_TABLE | 0x32 | Node→ESP | → ACK + count + entries |
| CMD_THREAD_START | 0x40 | Node→ESP | ifconfig up + thread start |
| CMD_THREAD_STOP | 0x41 | Node→ESP | thread stop + ifconfig down |
| CMD_THREAD_VERSION | 0x42 | Node→ESP | → ACK + version string |
| CMD_COMMISSIONER_JOINER | 0x43 | Node→ESP | EUI64(8)+PSKd_len(1)+PSKd(1–32)+Timeout(4 BE) |
| CMD_SRP_REGISTER | 0x44 | Node→ESP | Backend đăng ký `_dashboard._udp` qua SRP client trên BR (hostname + AAAA + port) |
