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
| CMD_PING | `0x04` | Node→ESP32 | **Pull** | Kiểm tra kết nối |
| *(reserved)* | `0x05–0x0F` | — | — | Dành mở rộng sau |
| CMD_RESET | `0x10` | Node→ESP32 | **Pull** | Reset thiết bị |
| CMD_FACTORY | `0x11` | Node→ESP32 | **Pull** | Factory reset |
| CMD_NETWORK_NAME | `0x12` | Node→ESP32 | **Pull** | Đọc tên mạng Thread |
| CMD_PAN_ID | `0x13` | Node→ESP32 | **Pull** | Đọc PAN ID |
| CMD_CHANNEL | `0x14` | Node→ESP32 | **Pull** | Đọc Channel |
| CMD_DATASET_ACTIVE | `0x15` | Node→ESP32 | **Pull** | Đọc Active Dataset |
| CMD_IP_ADDR | `0x16` | Node→ESP32 | **Pull** | Đọc IPv6 của leader |

---

## 5. DATA Payload

| CMD | Hướng | DATA Format | Kích thước |
|-----|-------|-------------|------------|
| CMD_DATA | ESP32→Node | CBOR từ child/router | Tùy số field |
| CMD_ACK | ESP32→Node | Data phản hồi (nếu có) | Tùy CMD |
| CMD_NACK | ESP32→Node | Error code (1 byte) – xem bảng Error codes | 1 byte |
| CMD_PING | Node→ESP32 | Không có | 0 byte |
| CMD_RESET | Node→ESP32 | Không có | 0 byte |
| CMD_FACTORY | Node→ESP32 | `0xAA` (confirm byte) | 1 byte |
| CMD_NETWORK_NAME | Node→ESP32 | Không có (request) | 0 byte |
| CMD_PAN_ID | Node→ESP32 | Không có (request) | 0 byte |
| CMD_CHANNEL | Node→ESP32 | Không có (request) | 0 byte |
| CMD_DATASET_ACTIVE | Node→ESP32 | Không có (request) | 0 byte |
| CMD_IP_ADDR | Node→ESP32 | Không có (request) | 0 byte |

**CMD_ACK trả data theo CMD request:**
- Network Name: Chuỗi UTF-8 (1–16 bytes)
- PAN ID: `[PAN_HIGH, PAN_LOW]` – 2 bytes, range `0x0000–0xFFFE`
- Channel: `[channel]` – 1 byte, range `11–26`
- Dataset Active: TLV binary (tùy dataset)
- IP Addr: IPv6 address – 16 bytes (ý nghĩa chi tiết xử lý sau)

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

### Pull đọc Channel

```
Node→ESP32:   AA  02  14  00 00  XX  55   (Frame ID=2, CMD_CHANNEL 0x14, LEN=0)
ESP32→Node:   AA  02  02  00 01  0F  XX  55   (Frame ID=2 echo, CMD_ACK, LEN=1, channel=15)
```

---

## 10. Lưu ý triển khai

- **CRC8** tính trên `[Frame ID, CMD, LEN_HIGH, LEN_LOW, DATA...]`; dùng cùng thuật toán hai bên.
- **Frame ID** tăng dần mỗi khung; Node dùng để ghép Pull request với ACK/NACK.
- **Node** cần buffer tích lũy vì serial có thể nhận từng mảnh; chỉ parse khi tìm đủ SOF…EOF và LEN hợp lệ (≤ 2048).
- **ESP32** nên dùng 2 FreeRTOS task riêng cho TX và RX để xử lý đồng thời.
- **PAN ID** hợp lệ: `0x0000–0xFFFE` (`0xFFFF` là broadcast).
- **SOF/EOF trong DATA:** Không dùng escape; parser dựa vào LEN để biết độ dài DATA. Trong DATA có thể chứa mọi giá trị byte (0x00–0xFF).
