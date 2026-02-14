# Thread Endpoint - RGB LED Control

Ứng dụng OpenThread endpoint để điều khiển LED RGB trên ESP32-C6 thông qua CoAP.

## Tính năng

- Điều khiển LED RGB qua CoAP endpoint
- Hỗ trợ GET để đọc trạng thái màu hiện tại
- Hỗ trợ POST/PUT để thiết lập màu mới
- Điều chỉnh độ sáng (brightness)
- Sử dụng LEDC (LED Controller) của ESP32-C6 để điều khiển PWM

## Cấu hình GPIO

Mặc định sử dụng các GPIO sau (có thể thay đổi trong `main.c`):
- **Red channel**: GPIO 8
- **Green channel**: GPIO 9  
- **Blue channel**: GPIO 10

## CoAP Endpoint

**URI**: `coap://[IPv6]:5683/rgb/led`

### GET Request
Lấy trạng thái màu hiện tại.

**Response** (JSON):
```json
{
  "r": 255,
  "g": 128,
  "b": 0,
  "brightness": 255
}
```

### POST/PUT Request
Thiết lập màu mới.

**Request Body** (JSON):
```json
{
  "r": 255,
  "g": 0,
  "b": 0,
  "brightness": 128
}
```

**Response**: Trả về màu đã được thiết lập (format giống GET response).

## Build và Flash

1. Cài đặt **ESP-IDF 5.5.2** (đã kiểm tra tương thích; 5.1+ có thể dùng được).
2. Cấu hình target:
   ```bash
   idf.py set-target esp32c6
   ```
3. Build project:
   ```bash
   idf.py build
   ```
4. Flash và monitor:
   ```bash
   idf.py flash monitor
   ```

## Sử dụng với CoAP Client

### Sử dụng coap-client (libcoap)

**Đọc màu hiện tại:**
```bash
coap-client -m get coap://[IPv6]:5683/rgb/led
```

**Thiết lập màu đỏ:**
```bash
coap-client -m post coap://[IPv6]:5683/rgb/led -e '{"r":255,"g":0,"b":0,"brightness":255}'
```

**Thiết lập màu xanh lá với độ sáng 50%:**
```bash
coap-client -m post coap://[IPv6]:5683/rgb/led -e '{"r":0,"g":255,"b":0,"brightness":128}'
```

### Sử dụng OpenThread CLI

Trong OpenThread CLI trên thiết bị khác:
```
coap post coap://[IPv6]:5683/rgb/led {"r":255,"g":0,"b":0,"brightness":255}
coap get coap://[IPv6]:5683/rgb/led
```

## Lưu ý

- Đảm bảo ESP32-C6 đã join vào Thread network trước khi sử dụng endpoint
- Kiểm tra và điều chỉnh GPIO pins trong `main.c` theo hardware của bạn
- LED RGB cần được kết nối với các GPIO thông qua transistor hoặc driver phù hợp nếu cần dòng cao
- Đối với LED RGB common cathode, có thể cần đảo ngược logic PWM

## Dependencies

- ESP-IDF OpenThread component
- LEDC driver (built-in ESP-IDF)
- cJSON library (built-in ESP-IDF)
