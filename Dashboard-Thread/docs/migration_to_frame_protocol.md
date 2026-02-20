# Migration sang Frame Protocol (USB CDC)

Tài liệu này liệt kê các bước / lệnh cần làm để chuyển Dashboard-Thread từ giao tiếp CLI sang **frame protocol** theo [USB CDC Frame Structure](./usb_cdc_frame_structure.md).

---

## Tiến độ đã làm

| Hạng mục | Trạng thái | Ghi chú |
|----------|------------|--------|
| Bỏ hoàn toàn CLI (CLIWrapper, cli:command, commandPrefix bắt buộc) | ✅ Xong | Giao tiếp chỉ còn frame |
| Thư mục `communicate/` (Serial, SerialConfig, frame) | ✅ Xong | SerialPort, SerialConfigService, frame/ (constants, crc8, frameBuilder, frameParser) |
| Serial raw mode (`useFrameProtocol`, `onRawData`, `writeRaw`) | ✅ Xong | `communicate/SerialPort.ts` |
| CRC-8/MAXIM + frame builder + frame parser | ✅ Xong | `communicate/frame/` |
| CMD_ACK/CMD_NACK → cập nhật cache, emit `ot:config` | ✅ Xong | Trong CommunicateManager |
| Gửi Pull (CMD_STATE, CMD_DATASET_ACTIVE, CMD_IP_ADDR), timeout, pending theo Frame ID | ✅ Xong | CommandManager.sendRequest / fetchState / fetchIpAddr / fetchDatasetActive |
| Pull state định kỳ (CMD_STATE); dataset active chỉ khi state đổi hoặc lần đầu có ACK state; IP chỉ khi leader/router/child | ✅ Xong | CommunicateManager.pullState |
| Parse Dataset Active từ hex-encoded TLVs thành các field riêng lẻ và lưu vào OtConfig | ✅ Xong | frame/datasetParser.ts parseDatasetActive, CommandManager.parseAckData |
| Event names constants (EVENTS) thay vì string literals | ✅ Xong | communicate/events.ts với EVENTS const object và EventName type |
| Polling định kỳ chỉ dùng cho router table, child table, joiner list (không poll OT config) | ✅ Xong | PollingManager poll các table khi có frontend kết nối và state là child/router/leader |
| **CommunicateManager** – toàn bộ dữ liệu & khởi tạo giao tiếp | ✅ Xong | Dữ liệu nằm trong communicate |
| **WebSocketServer** chỉ emit, lấy dữ liệu từ manager | ✅ Xong | Main khởi tạo io + manager, truyền vào WS |
| Main (`index.ts`) khởi tạo io, CommunicateManager, gọi `connectIfConfigured()` | ✅ Xong | |
| CMD_DATA (CBOR) → parse, cập nhật state/tables | ⏳ Chưa | Tạm emit `serial:frame:data` (hex) |
| Set config / thread running / commissioner qua frame | ⏳ Chưa | Stub "Use frame protocol" khi firmware hỗ trợ |
| Router table / Child table / Joiner table từ frame | ✅ Xong | CMD_ROUTER_TABLE (0x30), CMD_CHILD_TABLE (0x31), CMD_JOINER_TABLE (0x32), parse binary format theo table_data_format.md (frame/tableParser.ts) |

---

## 1. Tổng quan

- **Hiện tại:** Backend dùng **frame protocol** (USB CDC). Serial mở port với `useFrameProtocol: true`, đọc raw bytes; `CommunicateManager` parse frame, **pull state định kỳ** (CMD_STATE); **dataset active chỉ gọi khi state đổi hoặc lần đầu có ACK state, IP chỉ khi leader/router/child** (trong pullState), không poll OT config định kỳ. Nhận CMD_ACK/CMD_NACK → cập nhật `lastOtConfig`, broadcast events qua `EVENTS` constants (`serial:data`, `ot:config`, `ot:threadState`, `serial:status`, `serial:connected`, `serial:frame:data`, `ot:routerTable`, `ot:childTable`, `commissioner:joinerTable`). **PollingManager** poll định kỳ router table, child table, joiner table khi có frontend kết nối và state là child/router/leader. Dataset parser (`frame/datasetParser.ts`) parse hex-encoded TLVs thành các field. Table parser (`frame/tableParser.ts`) parse binary format theo spec trong `table_data_format.md`. **WebSocketServer** chỉ lấy dữ liệu từ manager và emit tới frontend; khởi tạo giao tiếp nằm ở main.
- **Còn lại:** Parse CMD_DATA (CBOR) để cập nhật thread state / router-child-joiner table; set config & commissioner khi firmware có CMD tương ứng.

---

## 2. Backend – Các việc cần làm

### 2.1. Serial: đọc raw bytes thay vì từng dòng

- **Vấn đề:** `SerialPortService` đang dùng `ReadlineParser` (delimiter `\n`) → chỉ phù hợp CLI text, không phù hợp frame nhị phân.
- **Việc cần làm:**
  - Thêm mode đọc **raw** (Buffer), hoặc tạo parser tích lũy byte theo frame (SOF → LEN → DATA → CRC8 → EOF).
  - API: ví dụ `onData(callback: (chunk: Buffer) => void)` hoặc `onFrame(callback: (frame: ParsedFrame) => void)`.
  - Giữ tương thích: có thể vẫn expose `serial:data` (string) cho Console (hex dump hoặc log), đồng thời feed bytes vào frame parser.

### 2.2. Frame parser (nhận từ ESP32)

- **Buffer tích lũy:** Serial có thể nhận từng mảnh; chỉ parse khi có đủ một frame hợp lệ.
- **Cấu trúc frame:** SOF `0xAA` | Frame ID | CMD | LEN_HIGH, LEN_LOW (big-endian) | DATA (LEN bytes) | CRC8 | EOF `0x55`.
- **Logic:**
  1. Tìm SOF `0xAA`.
  2. Nếu chưa đủ 5 byte (tới hết LEN) thì chờ thêm.
  3. Tính LEN = LEN_HIGH * 256 + LEN_LOW; validate LEN ≤ 2048.
  4. Đọc đủ LEN byte DATA + 1 CRC8 + 1 EOF.
  5. Kiểm tra EOF = `0x55`, tính CRC8 trên `[Frame ID, CMD, LEN_HIGH, LEN_LOW, ...DATA]` và so sánh với byte CRC8 nhận được.
  6. Nếu đúng thì emit frame (Frame ID, CMD, DATA Buffer); bỏ qua byte thừa trước SOF hoặc sau EOF, tiếp tục parse frame tiếp.
- **CRC8:** CRC-8/MAXIM (poly 0x31, init 0x00). Input: từ byte Frame ID đến hết DATA (không gồm SOF/CRC8/EOF).

### 2.3. Xử lý từng CMD nhận từ ESP32 (RX)

- **CMD_DATA (0x01):** DATA là CBOR từ child/router. Parse CBOR, cập nhật dữ liệu tương ứng (state, config, router/child table tùy spec) rồi set `lastThreadState` / `lastOtConfig` / `lastRouterTable` / `lastChildTable` và `io.emit("ot:threadState" | "ot:config" | ...)`.
- **CMD_ACK (0x02):** Response cho Pull request. DATA = payload theo CMD đã gửi (Dataset Active, IPv6 16 bytes). Map theo Frame ID đang chờ → cập nhật cache và emit event tương ứng.
- **CMD_NACK (0x03):** DATA = 1 byte error code. Map theo Frame ID → emit lỗi cho client tương ứng (hoặc broadcast nếu không gắn socket).

### 2.4. Gửi frame Pull (TX) – Node → ESP32

- **Build frame:** SOF + Frame ID (tăng dần) + CMD + LEN (big-endian, 2 bytes) + DATA (nếu có) + CRC8( [Frame ID, CMD, LEN_HIGH, LEN_LOW, DATA...] ) + EOF.
- **Các lệnh cần gửi tương ứng tính năng hiện tại:**
  - **Keepalive:** CMD_STATE (0x04), kèm payload vài byte (tạm có thể dùng fake).
  - **OT config:** CMD_DATASET_ACTIVE (0x13), CMD_IP_ADDR (0x14) → nhận qua CMD_ACK, parse DATA rồi merge vào `lastOtConfig` và emit `ot:config`. Dataset Active được parse từ hex-encoded TLVs thành các field riêng lẻ (Active Timestamp, Channel, Network Name, PAN ID, Extended PAN ID, Mesh Local Prefix, Network Key, PSKc, Security Policy, Channel Mask) và lưu vào OtConfig (parser trong `frame/datasetParser.ts`).
  - **Router table:** CMD_ROUTER_TABLE (0x30) → nhận qua CMD_ACK, parse binary format (15 bytes/entry) và emit `ot:routerTable`.
  - **Child table:** CMD_CHILD_TABLE (0x31) → nhận qua CMD_ACK, parse binary format (17 bytes/entry) và emit `ot:childTable`.
  - **Joiner table:** CMD_JOINER_TABLE (0x32) → nhận qua CMD_ACK, parse binary format (variable-length entries) và emit `commissioner:joinerTable`.
  - **Set config:** CMD_SET_PANID (0x20), CMD_SET_CHANNEL (0x21), CMD_SET_NETWORK_NAME (0x22), CMD_SET_EXTENDED_PANID (0x23), CMD_SET_NETWORK_KEY (0x24) → gửi config parameters.
  - **Reset thiết bị:** CMD_RESET (0x10), không DATA.
  - **Factory reset:** CMD_FACTORY (0x11), DATA = `[0xAA]`.
- **Hàng đợi / Frame ID:** Mỗi request Pull dùng một Frame ID duy nhất; khi nhận CMD_ACK/CMD_NACK với cùng Frame ID thì resolve promise và cập nhật cache.

### 2.5. Map frame → WebSocketServer state và event

- Khi nhận CMD_ACK với DATA tương ứng:
  - Dataset Active → parse hex-encoded TLVs thành các field (`activeTimestamp`, `channel`, `networkName`, `panid`, `extendedPanId`, `meshLocalPrefix`, `networkKey`, `pskc`, `securityPolicy`, `channelMask`) bằng `frame/datasetParser.ts` và lưu vào `lastOtConfig`, đồng thời giữ lại `datasetActive` (hex string gốc) để compatibility, emit `ot:config`.
  - IPv6 (16 bytes) → `lastOtConfig.ipaddr`, emit `ot:config`.
  - Router Table → parse binary format (count + 15 bytes/entry) bằng `frame/tableParser.ts`, lưu vào `lastRouterTable`, emit `ot:routerTable`.
  - Child Table → parse binary format (count + 17 bytes/entry) bằng `frame/tableParser.ts`, lưu vào `lastChildTable`, emit `ot:childTable`.
  - Joiner Table → parse binary format (count + variable-length entries) bằng `frame/tableParser.ts`, lưu vào `lastJoinerTable`, emit `commissioner:joinerTable`.
- CMD_DATA (CBOR): parse và cập nhật `lastThreadState` / `lastRouterTable` / `lastChildTable` / … theo định dạng CBOR đã thống nhất với firmware.

### 2.6. Thay thế các handler đang stub

- **pollThreadState:** Nếu có CMD Pull để lấy state → gửi frame tương ứng định kỳ; khi nhận ACK/DATA thì set `lastThreadState` và emit. Nếu state chỉ đến qua CMD_DATA thì chỉ cập nhật khi nhận CMD_DATA.
- **Dataset + IP:** Chỉ gọi CMD_DATASET_ACTIVE và CMD_IP_ADDR khi state đổi hoặc lần đầu có ACK state (trong pullState); merge ACK vào `lastOtConfig` và emit `ot:config`. Khi frontend gửi OT_GET_CONFIG (nút "Lấy lại"), backend **luôn** gọi `fetchOtConfig()` (không dùng cache) rồi emit `ot:config`.
- **Tự khởi động Thread:** Khi serial connect thành công, nếu cài đặt `thread_run_on_connect` bật thì backend delay 500ms, gửi CMD_STATE để lấy state; **chỉ khi state = disabled** mới gửi CMD_THREAD_START (tránh gửi start khi Thread đã chạy).
- **handleOtSetConfig:** Gửi frame set config (nếu protocol mở rộng CMD set panid/channel/networkname); khi có ACK/NACK thì emit `ot:setConfig:result`.
- **handleOtSetThreadRunning:** Tương tự, dùng CMD tương ứng (nếu có) hoặc để stub đến khi firmware hỗ trợ.
- **handleCommissionerConnect:** Dùng frame commissioner (khi có CMD tương ứng trong spec).
- **runSerialKeepalive:** Gửi CMD_STATE (0x04) kèm payload vài byte định kỳ.

### 2.7. File / module gợi ý

- **Thư mục giao tiếp phần cứng:** `backend/src/communicate/` (đã chứa `SerialPort.ts`, `SerialConfigService.ts`). Thư mục con `frame/` chứa:
  - `frame/crc8.ts` – CRC-8/MAXIM.
  - `frame/frameParser.ts` – tích lũy byte, tìm SOF/EOF, validate LEN/CRC, output ParsedFrame.
  - `frame/frameBuilder.ts` – build frame TX (SOF, Frame ID, CMD, LEN, DATA, CRC8, EOF).
  - `frame/constants.ts` – SOF, EOF, CMD_*, error codes.
  - `frame/datasetParser.ts` – parse hex-encoded TLVs của Dataset Active thành các field riêng lẻ.
  - `frame/tableParser.ts` – parse binary format của Router Table, Child Table, Joiner Table theo spec trong `table_data_format.md`.
- `SerialPortService` (trong `communicate/SerialPort.ts`): đọc raw (Buffer) và đẩy vào `frameParser`; vẫn có thể log/hex dump cho `serial:data`.
- `WebSocketServer`: gọi frameBuilder để gửi Pull; đăng ký callback từ frameParser để xử lý CMD_DATA/CMD_ACK/CMD_NACK và cập nhật last* + emit.
- `PollingManager`: quản lý polling định kỳ cho router table, child table, joiner table. Chỉ poll khi có frontend kết nối và state là child/router/leader.

---

## 3. Frontend – Các việc cần làm

- **Phần lớn không đổi:** Các event `ot:threadState`, `ot:config`, `ot:routerTable`, … đã có; chỉ cần backend emit với dữ liệu thật từ frame.
- **Console:** Hiện đang hiển thị raw `serial:data`. Có thể (tùy chọn):
  - Giữ hiển thị raw/hex để debug.
  - Hoặc thêm tab/filter hiển thị frame đã parse (Frame ID, CMD, LEN) khi backend gửi thêm event kiểu `serial:frame` (nếu cần).

---

## 4. Thứ tự triển khai gợi ý

1. **CRC8 + frame builder** – Viết hàm CRC-8/MAXIM và build frame (ví dụ CMD_STATE, CMD_IP_ADDR) để test tay với thiết bị.
2. **Serial raw + frame parser** – Chuyển SerialPort đọc raw, buffer tích lũy, parse SOF…EOF, validate CRC, emit parsed frame.
3. **TX:** Gửi CMD_STATE (payload vài byte) / CMD_IP_ADDR từ backend, nhận CMD_ACK và log.
4. **Map ACK → lastOtConfig** – Parse DATA của CMD_ACK (dataset active hex → parse thành các field TLV, ipaddr), set `lastOtConfig` với tất cả các field đã parse, emit `ot:config`. Dataset Active được parse từ hex-encoded TLVs thành các field: Active Timestamp, Channel, Network Name, PAN ID, Extended PAN ID, Mesh Local Prefix, Network Key, PSKc, Security Policy, Channel Mask.
5. **Polling:** Bật lại poll (thread state, OT config) bằng cách gửi frame Pull định kỳ và cập nhật từ ACK/DATA.
6. **Set config / thread running / commissioner** – Khi firmware hỗ trợ CMD tương ứng, gửi frame từ handler và emit kết quả.

---

## 5. Tài liệu tham chiếu

- [USB CDC Frame Structure](./usb_cdc_frame_structure.md) – Cấu trúc frame, CMD, DATA format, CRC8, Frame ID echo, error codes.
