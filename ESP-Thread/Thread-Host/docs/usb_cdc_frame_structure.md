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
| CMD_STATE | 0x12 | Node↔ESP32 | **Node→ESP32 (Pull):** check kết nối (backend gửi interval; ESP trả ACK). **ESP32→Node (Push):** BR gửi khi state (role) thay đổi; DATA = 1 byte (0=disabled, 1=detached, 2=child, 3=router, 4=leader); backend trả CMD_ACK cùng Frame ID; không ACK trong 1s thì BR gửi lại. |
| CMD_DATASET_ACTIVE | 0x13 | Node→ESP32 | Pull: đọc Active Dataset |
| CMD_IP_ADDR | 0x14 | Node→ESP32 | Pull: đọc IPv6 leader |

**CMD_ACK:** Echo cùng Frame ID; DATA tùy CMD (Dataset: TLV; IP: 16 bytes). Khi BR gửi CMD_STATE (Push), backend trả CMD_ACK cùng Frame ID để BR dừng retry.

**Error codes (CMD_NACK):** 0x01 Invalid CMD, 0x02 Not ready, 0x03 Timeout, 0x04 Invalid param, 0x05 Busy.

## Lưu ý

- CRC8 và LEN: hai bên dùng cùng thuật toán; LEN ≤ 2048.
- Parser dựa vào LEN (không escape); Node buffer tích lũy; ESP32 dùng task RX trong transport (USB CDC hoặc UART).
- PAN ID hợp lệ: 0x0000–0xFFFE.
