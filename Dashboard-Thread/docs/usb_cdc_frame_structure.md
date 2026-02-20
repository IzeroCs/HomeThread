# USB CDC Frame Structure - ESP32-H2

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

- **Thuật toán:** CRC-8/MAXIM (poly 0x31, init 0x00), hoặc ghi rõ polynomial + init nếu dùng chuẩn khác.
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
| CMD_STATE | `0x12` | Node→ESP32 | **Pull** | Pull state (keepalive) |
| CMD_DATASET_ACTIVE | `0x13` | Node→ESP32 | **Pull** | Đọc Active Dataset |
| CMD_IP_ADDR | `0x14` | Node→ESP32 | **Pull** | Đọc IPv6 của leader |
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
| CMD_THREAD_START | `0x40` | Node→ESP32 | **Pull** | Khởi động Thread |
| CMD_THREAD_STOP | `0x41` | Node→ESP32 | **Pull** | Dừng Thread |
| CMD_THREAD_VERSION | `0x42` | Node→ESP32 | **Pull** | Lấy phiên bản Thread (ACK data = version string/bytes tùy firmware) |
| *(reserved)* | `0x43–0xFF` | — | — | Dành mở rộng sau |

---

## 5. DATA Payload

| CMD | Hướng | DATA Format | Kích thước |
|-----|-------|-------------|------------|
| CMD_DATA | ESP32→Node | CBOR từ child/router | Tùy số field |
| CMD_ACK | ESP32→Node | Data phản hồi (nếu có) | Tùy CMD |
| CMD_NACK | ESP32→Node | Error code (1 byte) – xem bảng Error codes | 1 byte |
| CMD_RESET | Node→ESP32 | Không có | 0 byte |
| CMD_FACTORY | Node→ESP32 | `0xAA` (confirm byte) | 1 byte |
| CMD_STATE | Node→ESP32 | Payload vài byte (keepalive / state; tạm có thể dùng fake) | Vài byte |
| CMD_DATASET_ACTIVE | Node→ESP32 | Không có (request) | 0 byte |
| CMD_IP_ADDR | Node→ESP32 | Không có (request) | 0 byte |
| CMD_SET_PANID | Node→ESP32 | PAN ID (2 bytes, uint16 big-endian) | 2 bytes |
| CMD_SET_CHANNEL | Node→ESP32 | Channel (1 byte uint8_t, OpenThread 2.4 GHz: 11–26) | 1 byte |
| CMD_SET_NETWORK_NAME | Node→ESP32 | Network Name (string, max 16 bytes) | 1–16 bytes |
| CMD_SET_EXTENDED_PANID | Node→ESP32 | Extended PAN ID (8 bytes) | 8 bytes |
| CMD_SET_NETWORK_KEY | Node→ESP32 | Network Key (16 bytes) | 16 bytes |
| CMD_ROUTER_TABLE | Node→ESP32 | Không có (request) | 0 byte |
| CMD_CHILD_TABLE | Node→ESP32 | Không có (request) | 0 byte |
| CMD_JOINER_TABLE | Node→ESP32 | Không có (request) | 0 byte |
| CMD_THREAD_START | Node→ESP32 | Không có (request) | 0 byte |
| CMD_THREAD_STOP | Node→ESP32 | Không có (request) | 0 byte |
| CMD_THREAD_VERSION | Node→ESP32 | Không có (request) | 0 byte |

**CMD_ACK trả data theo CMD request:**
- Dataset Active: TLV binary hoặc hex (tùy dataset)
- IP Addr: IPv6 address – 16 bytes (xem mục dưới)
- Router Table: Format tùy firmware (CBOR hoặc text)
- Child Table: Format tùy firmware (CBOR hoặc text)
- Joiner Table: Format tùy firmware (CBOR hoặc text)
- Thread Version (CMD_THREAD_VERSION): Version string hoặc bytes tùy firmware (vd. "1.2.0" hoặc binary)

### Định dạng 16 byte IPv6 (IP Addr)

16 byte đó là **một địa chỉ IPv6 (128 bit)**, network byte order (big-endian).

- **16 byte = 8 đoạn 16-bit:** đoạn 0 = byte 0–1, đoạn 1 = byte 2–3, … đoạn 7 = byte 14–15.
- **Mỗi đoạn 16-bit:** byte đầu = 8 bit cao, byte sau = 8 bit thấp (big-endian).

**Cách đổi ra dạng chữ (ví dụ fe80::1):**

1. Từ 16 byte → 8 số 16-bit (big-endian): với `i = 0..7`:  
   `segment[i] = (byte[2*i] << 8) | byte[2*i+1]`
2. Từ 8 số 16-bit → chuỗi: viết 8 đoạn dạng hex (1–4 ký tự, không viết số 0 thừa bên trái), cách nhau bởi `:`.
3. **Chuỗi rút gọn:** có thể thay **một** khối liên tiếp toàn 0 bằng `::` (chỉ một lần).  
   Ví dụ: `fe80:0:0:0:1234:5678:0:1` → `fe80::1234:5678:0:1`.

**Ví dụ:**

| 16 byte (hex) | fd e8 50 af 0b c1 05 99 00 00 00 ff fe 00 fc 00 |
| 8 đoạn 16-bit | fde8, 50af, 0bc1, 0599, 0000, 00ff, fe00, fc00 |
| Chuỗi | fde8:50af:bc1:599:0:ff:fe00:fc00 (hoặc rút gọn fde8:50af:bc1:599::ff:fe00:fc00) |

**Trên từng nền:**

- **C:** `inet_ntop(AF_INET6, &addr, buf, sizeof(buf))` với `addr` là struct chứa 16 byte (vd. `struct in6_addr`).
- **Python:** `ipaddress.IPv6Address(bytes)` nhận đúng 16 byte.
- **JavaScript/TypeScript:** đọc 16 byte thành 8 cặp 2 byte, đổi mỗi cặp sang hex rồi nối bằng `:`, có thể rút gọn `::`.
- **Rust:** kiểu `std::net::Ipv6Addr` từ 16 byte (octets).

Tóm lại: **16 byte = 8 số 16-bit big-endian liên tiếp;** chuỗi IPv6 là 8 đoạn hex cách nhau `:`, có thể rút gọn một khối 0 bằng `::`.

---

## 6. Frame ID echo (ACK/NACK)

- Khi phản hồi lệnh **Pull**, ESP32 gửi **CMD_ACK** hoặc **CMD_NACK** với **cùng Frame ID** như frame request tương ứng.
- Node dùng Frame ID để ghép response với request (đặc biệt khi gửi nhiều Pull liên tiếp).

---

## 7. Error codes (CMD_NACK)

DATA của CMD_NACK là 1 byte error code:

| Code | Hex | Mô tả |
|------|-----|--------|
| Reserved | 0x00 | Dành riêng |
| Invalid CMD | 0x01 | CMD không hỗ trợ hoặc không hợp lệ |
| Not ready | 0x02 | Thread chưa up / chưa leader (nếu áp dụng) |
| Timeout | 0x03 | Không lấy được dữ liệu kịp thời |
| Invalid param | 0x04 | Thiếu/sai tham số (vd. CMD_FACTORY thiếu 0xAA) |
| Busy | 0x05 | Thiết bị đang bận, thử lại sau |
| (reserved) | 0x06–0xFF | Dùng sau |

---

## 8. Cơ chế giao tiếp

| Ai chủ động | Mục đích | Cơ chế |
|-------------|----------|--------|
| **ESP32** | Gửi data child/router lên backend | Push — tự động, liên tục |
| **Node** | Đọc cấu hình, kiểm tra trạng thái leader | Pull — khi cần |
| **ESP32** | Phản hồi lệnh Pull từ Node | CMD_ACK/CMD_NACK với cùng Frame ID, kèm data |

---

## 9. Ví dụ khung

### Push data từ child (CBOR 5 bytes: `0x01 0x02 0x03 0x04 0x05`)

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
Node→ESP32:   AA  02  14  00 00  XX  55   (Frame ID=2, CMD_IP_ADDR 0x14, LEN=0)
ESP32→Node:   AA  02  02  00 10  [16 bytes IPv6]  XX  55   (Frame ID=2 echo, CMD_ACK, LEN=16)
```

### Gửi STATE (keepalive, payload vài byte)

```
Node→ESP32:   AA  00  12  00 03  01 02 03  XX  55   (Frame ID=0, CMD_STATE 0x12, LEN=3, DATA=01 02 03)
```

---

## 10. Lưu ý triển khai

- **CRC8** tính trên `[Frame ID, CMD, LEN_HIGH, LEN_LOW, DATA...]`; dùng cùng thuật toán hai bên.
- **Frame ID** tăng dần mỗi khung; Node dùng để ghép Pull request với ACK/NACK.
- **Node** cần buffer tích lũy vì serial có thể nhận từng mảnh; chỉ parse khi tìm đủ SOF…EOF và LEN hợp lệ (≤ 2048).
- **ESP32** nên dùng 2 FreeRTOS task riêng cho TX và RX để xử lý đồng thời.
- **PAN ID** hợp lệ: `0x0000–0xFFFE` (`0xFFFF` là broadcast).
- **SOF/EOF trong DATA:** Không dùng escape; parser dựa vào LEN để biết độ dài DATA. Trong DATA có thể chứa mọi giá trị byte (0x00–0xFF).
