# Migration sang Frame Protocol (USB CDC)

> Tài liệu này liệt kê các bước / lệnh để chuyển Dashboard-Thread từ giao tiếp CLI sang **frame protocol** theo [USB CDC Frame Structure](../protocol/usb_cdc_frame_structure.md).

---

## Tiến độ đã làm

| Hạng mục | Trạng thái | Ghi chú |
|----------|------------|--------|
| Bỏ hoàn toàn CLI (CLIWrapper, cli:command, commandPrefix) | ✅ Xong | Giao tiếp chỉ còn frame |
| Thư mục `communicate/` (Serial, SerialConfig, frame) | ✅ Xong | SerialPort, SerialConfigService, frame/ |
| Serial raw mode (`useFrameProtocol`, `onRawData`, `writeRaw`) | ✅ Xong | `communicate/SerialPort.ts` |
| CRC-8/MAXIM + frame builder + frame parser | ✅ Xong | `communicate/frame/` |
| CMD_ACK/CMD_NACK → cập nhật cache, emit `ot:config` | ✅ Xong | CommunicateManager |
| Gửi Pull (CMD_STATE, CMD_DATASET_ACTIVE, CMD_IP_ADDR), timeout, pending theo Frame ID | ✅ Xong | CommandManager |
| Pull state định kỳ; dataset active chỉ khi state đổi; IP chỉ khi leader/router/child | ✅ Xong | CommunicateManager.pullState |
| Parse Dataset Active từ TLVs thành các field riêng lẻ | ✅ Xong | frame/datasetParser.ts |
| Event names constants (EVENTS) | ✅ Xong | communicate/events.ts |
| Polling định kỳ router/child/joiner table | ✅ Xong | PollingManager |
| **CommunicateManager** – toàn bộ dữ liệu & khởi tạo giao tiếp | ✅ Xong | |
| **WebSocketServer** chỉ emit, lấy dữ liệu từ manager | ✅ Xong | |
| Set config qua frame | ✅ Xong | CMD_SET_PANID/CHANNEL/NETWORK_NAME/EXTENDED_PANID/NETWORK_KEY |
| Commissioner Joiner qua frame | ✅ Xong | CMD_COMMISSIONER_JOINER (0x43): EUI64(8) + PSKd_len(1) + PSKd(variable) + Timeout(4 uint32 BE); validate EUI64 hex, PSKd Thread Base32 6–32 ký tự; frontend chỉ check rỗng |
| Router table / Child table / Joiner table từ frame | ✅ Xong | CMD_ROUTER_TABLE/CHILD_TABLE/JOINER_TABLE; parse binary per `table_data_format.md` (frame/tableParser.ts) |
| Thread Version (CMD_THREAD_VERSION) | ✅ Xong | Fetch một lần sau khi lần đầu nhận ACK state; lưu vào `OtConfig.threadVersion`; hiển thị trong tab Status |
| Reset / Factory Reset qua frame | ✅ Xong | CMD_RESET (0x10), CMD_FACTORY (0x11, confirm byte 0xAA); frontend tab System có ConfirmModal + countdown 5s |
| CMD_DATA (CBOR) → parse, cập nhật state/tables | ⏳ Chưa | Tạm emit `serial:frame:data` (hex) |

---

## 1. Tổng quan kiến trúc hiện tại

- **Serial:** Raw mode (`useFrameProtocol: true`), buffer tích lũy → frame parser.
- **CommunicateManager:** Orchestrate serial/frame, pull state định kỳ (`CMD_STATE`), dataset active và IP chỉ khi state đổi, broadcast events qua `EVENTS` constants.
- **PollingManager:** Poll router/child/joiner table khi có frontend kết nối và state = child/router/leader.
- **CommandManager:** Frame TX/RX, pending theo Frame ID, timeout, validation.
- **WebSocketServer:** Relay events frontend ↔ CommunicateManager.
- **Events:** `serial:data`, `ot:config`, `ot:threadState`, `serial:status`, `serial:connected`, `serial:frame:data`, `ot:routerTable`, `ot:childTable`, `commissioner:joinerTable`.

**Thread Version:** Fetch `CMD_THREAD_VERSION` một lần khi connect (nếu chưa có `threadVersion`); parse ACK data (≤2 byte → uint big-endian, >2 byte → UTF-8); broadcast `ot:config` với `threadVersion`.

**Reset / Factory Reset:** CMD_RESET (0x10) và CMD_FACTORY (0x11, confirm 0xAA). Frontend tab System: ConfirmModal dùng chung, đếm ngược 5 giây.

**Commissioner Joiner:** CMD_COMMISSIONER_JOINER (0x43). Backend build `EUI64(8) + PSKd_len(1) + PSKd(variable) + Timeout(4 uint32 BE)`; validate EUI64 (16 hex chars), PSKd (auto uppercase, `[A-HJ-NPR-Y0-9]`, 6–32 chars), timeout (integer > 0). Frontend chỉ check rỗng — backend trả error message chi tiết qua `commissioner:connect:result`.

**Còn lại:** Parse CMD_DATA (CBOR).

---

## 2. Backend – Các việc cần làm (còn lại)

### 2.1. CMD_DATA (CBOR)

DATA của CMD_DATA là CBOR từ child/router. Parse CBOR, cập nhật state/tables rồi emit:
- `ot:threadState` cho state
- `ot:config` cho OtConfig
- `ot:routerTable` / `ot:childTable` cho tables

Hiện tại tạm emit `serial:frame:data` (hex) để debug.

---

## 3. Backend – Đã làm (tham khảo)

### 3.1. Serial raw + frame parser

- `SerialPort.ts` đọc raw Buffer, feed vào `frameParser` (SOF → LEN → DATA → CRC8 → EOF).
- Buffer tích lũy; chỉ parse khi đủ frame hợp lệ.
- **CRC8:** CRC-8/MAXIM (poly 0x31, init 0x00). Input: `[Frame ID, CMD, LEN_HIGH, LEN_LOW, DATA...]`.

### 3.2. Frame builder (TX)

- SOF + Frame ID (tăng dần) + CMD + LEN (big-endian, 2 bytes) + DATA + CRC8 + EOF.

### 3.3. Xử lý ACK/NACK

- **CMD_ACK:** Map theo Frame ID → parse DATA → cập nhật cache + emit event.
- **CMD_NACK:** DATA = 1 byte error code → resolve promise + log.

### 3.4. Dataset Active parsing

- Parse hex-encoded TLVs thành: `activeTimestamp`, `channel`, `networkName`, `panid`, `extendedPanId`, `meshLocalPrefix`, `networkKey`, `pskc`, `securityPolicy`, `channelMask`.
- Parser: `frame/datasetParser.ts`.

### 3.5. Table parsing

- Router Table: count + 15 bytes/entry (xem `table_data_format.md`).
- Child Table: count + 17 bytes/entry.
- Joiner Table: count + variable-length entries.
- Parser: `frame/tableParser.ts`.

---

## 4. Frontend

Phần lớn không đổi — các events (`ot:threadState`, `ot:config`, `ot:routerTable`, …) đã có từ trước.

---

## 5. Tài liệu tham chiếu

- **[../protocol/usb_cdc_frame_structure.md](../protocol/usb_cdc_frame_structure.md)** — Cấu trúc frame, CMD, DATA format, CRC8, error codes.
- **[../protocol/table_data_format.md](../protocol/table_data_format.md)** — Binary format Router/Child/Joiner Table.
