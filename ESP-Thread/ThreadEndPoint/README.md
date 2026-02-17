# ThreadEndPoint – LED on/off qua Thread

Endpoint Thread chạy trên **ESP32-C6** hoặc **ESP32-H2** (chỉ hai target này được hỗ trợ): join mạng qua Commissioner (PSKd), sau đó nhận lệnh bật/tắt LED qua UDP.

## Tính năng

- **OpenThread Joiner**: thiết bị join mạng Thread bằng **PSKd** (Pre-Shared Key for Device), Commissioner trên border router add joiner với cùng PSKd.
- **LED**: bật/tắt LED (GPIO 8 mặc định, có thể đổi trong `main/led_udp_server.c`).
- **UDP**: sau khi join, lắng nghe **port 5684**, nhận chuỗi `on` / `off` (UDP payload) để điều khiển LED.

## Joiner và PSKd (Pre-Shared Key for Device)

Trong OpenThread, **Joiner** là thiết bị muốn vào mạng Thread; **Commissioner** (thường chạy trên Border Router) là bên xác thực và cấp credential cho Joiner.

### PSKd theo tiêu chuẩn Thread (base32-thread)

PSKd **không phải** chuỗi ký tự tùy ý. Thread spec định nghĩa **Joiner Device Credential** với bảng ký tự **base32-thread**:

- **Bảng ký tự**: 32 ký tự – chữ in hoa và số: `0-9` (10) và `A-Y` **loại trừ** `I`, `O`, `Q`, `Z` (22 chữ) để tránh nhầm khi đọc/ghi (vd QR, nhập tay).
- **Độ dài**: **6–32** ký tự (OpenThread: `kMinLength` = 6, `kMaxLength` = 32).
- Chuỗi phải **chỉ gồm** các ký tự trên; nếu có ký tự khác (vd chữ thường, khoảng trắng, I/O/Q/Z) OpenThread trả `kErrorInvalidArgs`.

Trên API/CLI, chuỗi bạn nhập (vd `joiner start J01NME`, `commissioner joiner add * H01THREAD`) chính là **Joiner Credential** – Joiner và Commissioner phải dùng **cùng chuỗi**, và chuỗi đó phải thỏa format base32-thread trên.

- **Ví dụ hợp lệ**: `J01NME`, `H01THREAD` (phải **toàn chữ IN HOA**). Một số Commissioner chỉ chấp nhận dạng **1 chữ đầu + dãy số + chữ** (vd `H01THREAD`, `J01NME`); hai chữ liền ở đầu (vd `HOMETHREAD01`) có thể báo lỗi.
- **Ví dụ không hợp lệ**: `HomeThread01` (chữ thường), `HOMETHREAD01` (hai chữ đầu `HO` có thể lỗi tùy Commissioner), `J01NME!` (ký tự đặc biệt), `JOIN` (dưới 6 ký tự).

**Lưu ý:** **PSKc** (Pre-Shared Key for the Commissioner) là thứ **khác** – dùng để Commissioner bên ngoài (vd app, OT Commissioner CLI) xác thực với Border Router, được tạo từ Network Name + Extended PAN ID + Commissioner Passphrase (công cụ `pskc`).

### Cấu hình PSKd / Commissioner trên Border Router

PSKd (Joiner Credential) mặc định trong code: **`H01THREAD`** (trong `main/main.c`) – dạng 1 chữ + số + chữ. Phải **toàn chữ IN HOA**.

Trên **Border Router** (OTBR, ThreadBorder có Commissioner, v.v.):

```bash
# Bật Commissioner (nếu chưa bật)
commissioner start

# Cho phép joiner có cùng Joiner Credential (OpenThread CLI: commissioner joiner add)
# PSKd: toàn chữ IN HOA; nên dạng 1 chữ + số + chữ (vd H01THREAD)
commissioner joiner add * H01THREAD
```

Sau đó bật nguồn (hoặc reset) endpoint. Thiết bị sẽ tìm Commissioner, xác thực bằng cùng Joiner Credential và nhận dataset, rồi join mạng. Khi đã join, log có dạng: `Joined Thread network` và UDP server chạy trên port 5684.

**Đổi PSKd:** sửa macro `JOINER_PSKD` trong `main/main.c` và dùng **cùng chuỗi** đó trong lệnh add joiner trên Commissioner.

### EUI64 của endpoint

**EUI64** (64-bit Extended Unique Identifier) là định danh duy nhất của thiết bị (thường từ eFuse). Trên ESP32-C6/ESP32-H2, firmware **in EUI64 ra log** khi khởi động (dòng `EUI64: xxxxxxxxxxxxxxxx`).

- Dùng khi muốn **chỉ cho phép một thiết bị** join: trên Commissioner chạy `commissioner joiner add <eui64> <pskd>` (vd: `commissioner joiner add 2f57d222545271f1 H01THREAD`) thay vì `*`.
- Lấy EUI64: flash firmware, mở serial monitor, xem dòng log `EUI64: ...` ngay sau khi boot.

## Điều khiển LED qua UDP

Khi endpoint đã join và có IPv6:

- **Port**: 5684 (UDP)
- **Payload** (dạng text):
  - `on` → bật LED
  - `off` → tắt LED

Ví dụ từ máy trong cùng Thread network (biết IPv6 của endpoint):

```bash
# Thay <THREAD_IPV6> bằng mesh-local hoặc link-local IPv6 của endpoint
echo -n "on"  | nc -u -w1 <THREAD_IPV6> 5684
echo -n "off" | nc -u -w1 <THREAD_IPV6> 5684
```

Hoặc dùng script/python gửi UDP tới `[<ipv6>]:5684` với payload `on` / `off`.

## Build & flash

Project **chỉ build được** với `esp32c6` hoặc `esp32h2` (có native 802.15.4).

```bash
cd ESP-Thread/ThreadEndPoint
idf.py set-target esp32c6   # hoặc: idf.py set-target esp32h2
idf.py build
idf.py -p /dev/ttyUSB0 flash monitor
```

## Cấu hình

- **Target**: chỉ **ESP32-C6** hoặc **ESP32-H2** (native 802.15.4).
- **OpenThread**: FTD, Joiner bật; Border Router & Commissioner tắt.
- **LED GPIO**: mặc định **GPIO 8** (ESP32-C6 DevKit). Đổi `s_led_gpio` trong `main/led_udp_server.c` nếu dùng chân khác hoặc LED ngoài.

## Lưu ý / Troubleshooting

- **`Failed to process UDP: InvalidState` (MLE)**: Cảnh báo bình thường khi thiết bị đang ở trạng thái Joiner/Disabled. Mạng Thread có MLE (Mesh Link Establishment) gửi UDP; thiết bị nhận được nhưng không xử lý vì chưa attach → stack báo InvalidState. Có thể bỏ qua, không ảnh hưởng quá trình join.

## Tóm tắt flow

1. Flash firmware lên ESP32-C6.
2. Trên border router: `commissioner start` rồi `commissioner joiner add * H01THREAD`.
3. Endpoint join mạng, in log "Joined Thread network", UDP server chạy trên port 5684.
4. Gửi UDP `on` / `off` tới `<endpoint_ipv6>:5684` để bật/tắt LED.
