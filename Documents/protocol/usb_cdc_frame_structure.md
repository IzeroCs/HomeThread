# Frame Structure (BR ↔ Dashboard)

> Tài liệu chung — dùng cho **Thread-Host** (BR firmware) và **Dashboard-Thread** (backend/frontend).

**Transport:** Frame chạy trên **TCP**. BR listen một port (mặc định 5000); Dashboard kết nối tới **BR_IP:port** và gửi/nhận byte stream (cùng cấu trúc khung bên dưới). Không dùng USB/serial. Xem [architecture/real_br_integration.md](../architecture/real_br_integration.md) cho kiến trúc BR thật và hướng dẫn tích hợp.

---

## 1. Cấu trúc khung (Data Frame)

| Byte | Tên Field | Kích thước | Giá trị / Mô tả |
|------|-----------|------------|-----------------|
| 0 | **SOF** | 1 byte | `0xAA` – Đánh dấu đầu khung |
| 1 | **Frame ID** | 1 byte | `0x00–0xFF` – Tăng dần, phân biệt luồng push/pull |
| 2 | **CMD** | 1 byte | Loại lệnh |
| 3–4 | **LEN** | 2 bytes | Số byte của DATA – **big-endian** [LEN_HIGH, LEN_LOW], giá trị = LEN_HIGH × 256 + LEN_LOW. Range 0–2048 (max payload 2048 byte). |
| 5..N | **DATA** | LEN bytes | Nội dung dữ liệu (CBOR hoặc binary). Không escape: SOF/EOF chỉ có ý nghĩa ở đầu/cuối khung; trong DATA có thể chứa mọi giá trị byte. |
| N+1 | **CRC8** | 1 byte | Checksum của `[Frame ID, CMD, LEN_HIGH, LEN_LOW, DATA...]` – xem mục CRC8 bên dưới. |
| N+2 | **EOF** | 1 byte | `0x55` – Đánh dấu cuối khung |

---

## 2. LEN byte order và giới hạn

- **Thứ tự byte:** LEN dùng **big-endian** (network order): byte cao trước. Ví dụ LEN = 300 → gửi `0x01 0x2C`.
- **Max payload:** LEN ≤ 2048. Frame có LEN > 2048 coi là invalid (bỏ qua hoặc trả NACK).

---

## 3. CRC8

- **Thuật toán:** CRC-8/MAXIM (poly 0x31, init 0x00).
- **Input:** Các byte `[Frame ID, CMD, LEN_HIGH, LEN_LOW, DATA...]` (toàn bộ từ byte 1 đến hết DATA).
- Hai bên (ESP32 và Node) dùng cùng thuật toán để tính/kiểm tra.

---

## 4. Bảng CMD

| CMD | Hex | Hướng | Cơ chế | Mô tả |
|-----|-----|-------|--------|-------|
| CMD_DATA | `0x01` | ESP32→Node | **Push** | CBOR data từ child/router |
| CMD_ACK | `0x02` | ESP32→Node | Pull response | Xác nhận thực hiện lệnh thành công |
| CMD_NACK | `0x03` | ESP32→Node | Pull response | Báo lỗi thực hiện lệnh |
| *(reserved)* | `0x04–0x0F` | — | — | Dành mở rộng sau |
| CMD_RESET | `0x10` | Node→ESP32 | **Pull** | Reset thiết bị |
| CMD_FACTORY | `0x11` | Node→ESP32 | **Pull** | Factory reset |
| CMD_STATE | `0x12` | Node→ESP32 | **Pull** | Pull state (keepalive); BR trả ACK + 1 byte `device_role_t` (0=disabled..4=leader) |
| CMD_DATASET_ACTIVE | `0x13` | Node→ESP32 | **Pull** | Đọc Active Dataset |
| CMD_IP_ADDR | `0x14` | Node→ESP32 | **Pull** | Đọc IPv6 Leader RLOC (16 bytes); backend gửi lại ACK cùng Frame ID để xác nhận; BR retry sau 1s nếu không nhận ACK |
| *(reserved)* | `0x15–0x1F` | — | — | Dành mở rộng sau |
| CMD_SET_PANID | `0x20` | Node→ESP32 | **Pull** | Set PAN ID |
| CMD_SET_CHANNEL | `0x21` | Node→ESP32 | **Pull** | Set Channel |
| CMD_SET_NETWORK_NAME | `0x22` | Node→ESP32 | **Pull** | Set Network Name |
| CMD_SET_EXTENDED_PANID | `0x23` | Node→ESP32 | **Pull** | Set Extended PAN ID |
| CMD_SET_NETWORK_KEY | `0x24` | Node→ESP32 | **Pull** | Set Network Key |
| *(reserved)* | `0x25–0x2F` | — | — | Dành mở rộng sau |
| CMD_ROUTER_TABLE | `0x30` | Node→ESP32 | **Pull** | Đọc Router Table |
| CMD_CHILD_TABLE | `0x31` | Node→ESP32 | **Pull** | Đọc Child Table |
| CMD_JOINER_TABLE | `0x32` | Node→ESP32 | **Pull** | Đọc Joiner Table |
| *(reserved)* | `0x33–0x3F` | — | — | Dành mở rộng sau |
| CMD_THREAD_START | `0x40` | Node→ESP32 | **Pull** | Khởi động Thread (ifconfig up + thread start) |
| CMD_THREAD_STOP | `0x41` | Node→ESP32 | **Pull** | Dừng Thread + IPv6 |
| CMD_THREAD_VERSION | `0x42` | Node→ESP32 | **Pull** | Lấy phiên bản OpenThread (ACK data = UTF-8 string, tối đa 64 byte) |
| CMD_COMMISSIONER_JOINER | `0x43` | Node→ESP32 | **Pull** | Thêm joiner vào commissioner (EUI64 + PSKd + timeout); BR tự start commissioner nếu chưa active |
| CMD_SRP_REGISTER | `0x44` | Node→ESP32 | **Pull** | Backend đăng ký service `_dashboard._udp` với SRP server (qua SRP client trên BR). DATA: hostname_len(1) + hostname(N) + backend_ipv6(16) + port(2 BE). BR trả ACK rỗng hoặc NACK. |
| *(reserved)* | `0x45–0xFF` | — | — | Dành mở rộng sau |

---

## 5. DATA Payload

| CMD | Hướng | DATA Format | Kích thước |
|-----|-------|-------------|------------|
| CMD_DATA | ESP32→Node | CBOR từ child/router (vd. /device/register) | Tùy số field |
| CMD_ACK | ESP32→Node | Data phản hồi (nếu có) | Tùy CMD |
| CMD_ACK | Node→ESP32 | Ack của push CMD_DATA: 0 byte (OK) hoặc 1 byte status (tương lai) | 0 hoặc 1 |
| CMD_NACK | ESP32→Node | Error code (1 byte) – xem bảng Error codes | 1 byte |
| CMD_RESET | Node→ESP32 | Không có | 0 byte |
| CMD_FACTORY | Node→ESP32 | `0xAA` (confirm byte) | 1 byte |
| CMD_STATE | Node→ESP32 | Payload vài byte (keepalive / fake) | Vài byte |
| CMD_DATASET_ACTIVE | Node→ESP32 | Không có (request) | 0 byte |
| CMD_IP_ADDR | Node→ESP32 | Không có (request) | 0 byte |
| CMD_SET_PANID | Node→ESP32 | PAN ID (2 bytes, uint16 big-endian, 0x0000–0xFFFE) | 2 bytes |
| CMD_SET_CHANNEL | Node→ESP32 | Channel (1 byte uint8_t, OpenThread 2.4 GHz: 11–26) | 1 byte |
| CMD_SET_NETWORK_NAME | Node→ESP32 | Network Name (UTF-8 string, max 16 bytes) | 1–16 bytes |
| CMD_SET_EXTENDED_PANID | Node→ESP32 | Extended PAN ID (8 bytes) | 8 bytes |
| CMD_SET_NETWORK_KEY | Node→ESP32 | Network Key (16 bytes) | 16 bytes |
| CMD_ROUTER_TABLE | Node→ESP32 | Không có (request) | 0 byte |
| CMD_CHILD_TABLE | Node→ESP32 | Không có (request) | 0 byte |
| CMD_JOINER_TABLE | Node→ESP32 | Không có (request) | 0 byte |
| CMD_THREAD_START | Node→ESP32 | Không có (request) | 0 byte |
| CMD_THREAD_STOP | Node→ESP32 | Không có (request) | 0 byte |
| CMD_THREAD_VERSION | Node→ESP32 | Không có (request) | 0 byte |
| CMD_COMMISSIONER_JOINER | Node→ESP32 | `EUI64(8) + PSKD_len(1) + PSKD(variable) + Timeout(4)` | 14–45 bytes |

**CMD_ACK trả data theo CMD request:**
- `CMD_STATE`: 1 byte role (0=disabled, 1=detached, 2=child, 3=router, 4=leader)
- `CMD_DATASET_ACTIVE`: TLV binary (raw bytes từ `otDatasetGetActiveTlvs`)
- `CMD_IP_ADDR`: IPv6 address – 16 bytes big-endian (xem mục dưới)
- `CMD_ROUTER_TABLE / CMD_CHILD_TABLE / CMD_JOINER_TABLE`: binary format (xem `table_data_format.md`)
- `CMD_THREAD_VERSION`: UTF-8 string (vd. `"OPENTHREAD/thread-reference-20230706-..."`, tối đa 64 byte)
- `CMD_COMMISSIONER_JOINER`: Không có data (0 byte) – chỉ xác nhận thêm joiner thành công
- `CMD_SRP_REGISTER`: Không có data (0 byte) – chỉ xác nhận đã submit đăng ký SRP (BR dùng SRP client auto-start)

---

## 6. Định dạng 16 byte IPv6 (IP Addr)

16 byte là **một địa chỉ IPv6 (128 bit)**, network byte order (big-endian).

- **16 byte = 8 đoạn 16-bit:** đoạn 0 = byte 0–1, đoạn 1 = byte 2–3, … đoạn 7 = byte 14–15.
- **Mỗi đoạn 16-bit:** byte đầu = 8 bit cao, byte sau = 8 bit thấp (big-endian).

**Cách đổi ra dạng chữ:**
1. `segment[i] = (byte[2*i] << 8) | byte[2*i+1]` với `i = 0..7`
2. Viết 8 đoạn hex cách nhau `:`, có thể rút gọn một khối 0 bằng `::` (chỉ một lần).

**Ví dụ:**

| | |
|---|---|
| 16 byte (hex) | `fd e8 50 af 0b c1 05 99 00 00 00 ff fe 00 fc 00` |
| Chuỗi | `fde8:50af:bc1:599::ff:fe00:fc00` |

---

## 7. Định dạng DATA của CMD_COMMISSIONER_JOINER (Node → ESP32)

| Offset | Field | Kích thước | Mô tả |
|--------|-------|------------|-------|
| 0 | **EUI64** | 8 bytes | Địa chỉ joiner (big-endian). Tất cả `0x00` = wildcard |
| 8 | **PSKD_len** | 1 byte | Độ dài chuỗi PSKd (6–32) |
| 9 | **PSKD** | PSKD_len bytes | PSKd string (uppercase, Thread Base32: `[A-HJ-NPR-Y0-9]`, không null-terminated) |
| 9+PSKD_len | **Timeout** | 4 bytes | uint32 big-endian, đơn vị **giây** (vd. 60, 120, 500) |

**Tổng:** tối thiểu 14 bytes (PSKD_len=6), tối đa 45 bytes (PSKD_len=32).

**Ví dụ** – EUI64 `f0:f5:bd:ff:fe:10:4b:24`, PSKd `"J01NME"`, timeout 120s:

```
[f0 f5 bd ff fe 10 4b 24]  [06]  [4a 30 31 4e 4d 45]  [00 00 00 78]
 └──── EUI64 (8 bytes) ───┘  │    └─── "J01NME" ────┘   └─ 120 (4B) ┘
                         PSKD_len=6
```

**NACK:** `0x02` = commissioner chưa active / không phải leader; `0x04` = PSKd không hợp lệ hoặc timeout = 0.

---

## 8. Frame ID echo (ACK/NACK)

- ESP32 gửi **CMD_ACK** hoặc **CMD_NACK** với **cùng Frame ID** như frame request.
- Node dùng Frame ID để ghép response với request.

---

## 8.1. CMD_DATA push và ACK từ backend (Node→ESP)

Khi ESP32 (BR) **push** dữ liệu lên Node (backend) bằng **CMD_DATA** (ví dụ payload CoAP từ `/device/register`), BR tự sinh **Frame ID push** (counter 0–255) cho mỗi khung CMD_DATA.

- **Luồng:**
  1. ESP32→Node: `CMD_DATA` (Frame ID = N, DATA = payload CBOR).
  2. Node xử lý payload (lưu, forward app, …).
  3. Node→ESP32: **CMD_ACK** với **cùng Frame ID N**, DATA có thể 0 byte (chỉ xác nhận OK). Nếu cần báo lỗi xử lý, Node có thể gửi CMD_NACK với Frame ID N và error code.

- **BR chờ ACK:** BR có thể đợi CMD_ACK (cùng Frame ID) trong timeout (vd. 2–3 s). Nếu nhận CMD_ACK → coi push thành công; nếu timeout hoặc nhận CMD_NACK → coi thất bại (vd. trả CoAP 5.03 cho child device).
- **Phân biệt:** CMD_ACK từ Node cho **pull** (STATE, IP_ADDR, tables, …) và CMD_ACK cho **push CMD_DATA** đều dùng cùng CMD 0x02; BR phân biệt theo context (frame_id đang chờ cho IP_ADDR vs frame_id đang chờ cho CMD_DATA).

---

## 9. Error codes (CMD_NACK)

| Code | Hex | Mô tả |
|------|-----|--------|
| Reserved | 0x00 | Dành riêng |
| Invalid CMD | 0x01 | CMD không hỗ trợ hoặc không hợp lệ |
| Not ready | 0x02 | Thread chưa up / chưa leader (nếu áp dụng) |
| Timeout | 0x03 | Không lấy được dữ liệu kịp thời |
| Invalid param | 0x04 | Thiếu/sai tham số |
| Busy | 0x05 | Thiết bị đang bận, thử lại sau |
| (reserved) | 0x06–0xFF | Dùng sau |

---

## 10. Ví dụ khung

### Push data từ child (CBOR 5 bytes)

```
AA  01  01  00 05  01 02 03 04 05  XX  55
│   │   │   └──┘  └────────────┘  │   └─ EOF
│   │   │   LEN=5     DATA        └─ CRC8
│   │   └─ CMD_DATA
│   └─ Frame ID=1
└─ SOF
```

### Pull đọc IP (CMD_IP_ADDR)

```
Node→ESP32:   AA  02  14  00 00  XX  55              (Frame ID=2, CMD_IP_ADDR, LEN=0)
ESP32→Node:   AA  02  02  00 10  [16 bytes IPv6]  XX  55   (Frame ID=2 echo, CMD_ACK, LEN=16)
Node→ESP32:   AA  02  02  00 00  XX  55              (Frame ID=2 echo, CMD_ACK reply, LEN=0)
```

### Gửi STATE (keepalive)

```
Node→ESP32:   AA  00  12  00 03  01 02 03  XX  55   (Frame ID=0, CMD_STATE, LEN=3)
ESP32→Node:   AA  00  02  00 01  04  XX  55          (Frame ID=0 echo, CMD_ACK, role=leader)
```

---

## 11. Lưu ý triển khai

- **CRC8** tính trên `[Frame ID, CMD, LEN_HIGH, LEN_LOW, DATA...]`; dùng cùng thuật toán hai bên.
- **Frame ID** tăng dần mỗi khung; Node dùng để ghép Pull request với ACK/NACK.
- **Node** cần buffer tích lũy vì serial có thể nhận từng mảnh; chỉ parse khi tìm đủ SOF…EOF và LEN hợp lệ (≤ 2048).
- **ESP32** dùng FreeRTOS task riêng cho TX và RX (communicate_queue, communicate_task).
- **SOF/EOF trong DATA:** Không escape; parser dựa vào LEN để biết độ dài DATA.

---

## Tài liệu liên quan

- **[table_data_format.md](table_data_format.md)** — Format binary cho Router/Child/Joiner Table.
