# USB CDC Frame Structure

**Transport:** Hiện tại frame chạy trên **USB CDC** (transport_usb, USB Serial/JTAG). **Transport UART** (transport_uart) sẽ phát triển tiếp; cấu hình trong `include/communicate/communicate_config.h` (`COMMUNICATE_FRAME_PORT_IS_UART`).

## Cấu trúc khung

| Byte | Field | Mô tả |
|------|--------|--------|
| 0 | SOF | `0xAA` |
| 1 | Frame ID | 0x00–0xFF, tăng dần |
| 2 | CMD | Loại lệnh |
| 3–4 | LEN | 2 bytes **big-endian**, max 2048 |
| 5..N | DATA | Payload (CBOR/binary), không escape SOF/EOF |
| N+1 | CRC8 | [Frame ID, CMD, LEN_HIGH, LEN_LOW, DATA...] — CRC-8/MAXIM (poly 0x31, init 0x00) |
| N+2 | EOF | `0x55` |

## Bảng CMD

| CMD | Hex | Hướng | Mô tả |
|-----|-----|-------|--------|
| CMD_DATA | 0x01 | ESP32→Node | Push CBOR |
| CMD_ACK | 0x02 | ESP32→Node | Pull response OK |
| CMD_NACK | 0x03 | ESP32→Node | Pull response lỗi (1 byte error code) |
| CMD_RESET | 0x10 | Node→ESP32 | Pull: reset |
| CMD_FACTORY | 0x11 | Node→ESP32 | Pull: factory reset (DATA = 0xAA) |
| CMD_STATE | 0x12 | Node→ESP32 | **Pull:** backend gửi định kỳ để check; BR trả CMD_ACK + 1 byte `device_role_t` (0=disabled..4=leader, xem `include/openthread/device_role.h`). BR không push khi role thay đổi; backend tự pull. |
| CMD_DATASET_ACTIVE | 0x13 | Node→ESP32 | Pull: đọc Active Dataset |
| CMD_IP_ADDR | 0x14 | Node→ESP32 | Pull: backend gửi request; BR trả CMD_ACK + 16 byte Leader RLOC (nhị phân). Backend **gửi lại CMD_ACK cùng Frame ID** để xác nhận đã nhận; nếu BR không nhận ACK trong 1s thì gửi lại (retry). |
| CMD_SET_PANID | 0x20 | Node→ESP32 | Set PAN ID (DATA = 2 bytes big-endian, 0x0000–0xFFFE) |
| CMD_SET_CHANNEL | 0x21 | Node→ESP32 | Set channel (DATA = 1 byte, 11–26) |
| CMD_SET_NETWORK_NAME | 0x22 | Node→ESP32 | Set network name (DATA = UTF-8 string, null-terminated) |
| CMD_SET_EXTENDED_PANID | 0x23 | Node→ESP32 | Set Extended PAN ID (DATA = 8 bytes) |
| CMD_SET_NETWORK_KEY | 0x24 | Node→ESP32 | Set network key (DATA = 16 bytes) |
| CMD_ROUTER_TABLE | 0x30 | Node→ESP32 | Pull: đọc Router Table (xem [table_data_format.md](table_data_format.md)) |
| CMD_CHILD_TABLE | 0x31 | Node→ESP32 | Pull: đọc Child Table (xem [table_data_format.md](table_data_format.md)) |
| CMD_JOINER_TABLE | 0x32 | Node→ESP32 | Pull: đọc Joiner Table (xem [table_data_format.md](table_data_format.md)) |
| CMD_THREAD_START | 0x40 | Node→ESP32 | Bật IPv6 + Thread (ifconfig up, thread start). BR trả CMD_ACK (DATA rỗng). |
| CMD_THREAD_STOP | 0x41 | Node→ESP32 | Tắt Thread + IPv6. BR trả CMD_ACK (DATA rỗng). |
| CMD_THREAD_VERSION | 0x42 | Node→ESP32 | Pull: BR trả CMD_ACK + chuỗi version OpenThread (UTF-8, tối đa 64 bytes). |

**CMD_ACK:** Echo cùng Frame ID; DATA tùy CMD (STATE: 1 byte role; Dataset: TLV; IP: 16 byte nhị phân; Router/Child/Joiner Table: xem [table_data_format.md](table_data_format.md); THREAD_VERSION: chuỗi version UTF-8). Với CMD_IP_ADDR, backend trả CMD_ACK cùng Frame ID để xác nhận đã nhận.

**Error codes (CMD_NACK):** 0x01 Invalid CMD, 0x02 Not ready, 0x03 Timeout, 0x04 Invalid param, 0x05 Busy.

## Lưu ý

- CRC8 và LEN: hai bên dùng cùng thuật toán; LEN ≤ 2048.
- Parser dựa vào LEN (không escape); Node buffer tích lũy; ESP32 dùng task RX trong transport (USB CDC hoặc UART).
- PAN ID hợp lệ: 0x0000–0xFFFE.

## Tài liệu liên quan

- **[table_data_format.md](table_data_format.md)** — Format dữ liệu chi tiết cho Router Table, Child Table, và Joiner Table (CMD_ROUTER_TABLE, CMD_CHILD_TABLE, CMD_JOINER_TABLE).
