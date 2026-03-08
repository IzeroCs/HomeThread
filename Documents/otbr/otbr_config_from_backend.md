# OTBR: Cấu hình serial / baudrate từ Backend (triển khai sau)

Tài liệu thiết kế để sau này cho phép **backend container** set **serial port** và **baudrate** cho OTBR qua giao diện / API, thay vì sửa tay trong `docker-compose.yml` hoặc `otbr-env.list`.

## Hiện trạng

- **Port + baudrate** cố định trong:
  - `docker-compose.yml` hoặc `otbr/otbr-env.list`:  
    `OT_RCP_DEVICE=spinel+hdlc+uart:///dev/serial/by-id/...?uart-baudrate=460800`
  - Supervisor (systemd): `DEVICE_PATH` (vd. `/dev/ttyACM0`) dùng để watch device; cấu khi cài service.
- Backend chỉ gọi supervisor socket: `restartOtbr()` → `restart-otbr` → `docker restart`.

## Hướng thiết kế (khi triển khai)

### 1. File cấu hình dùng chung (trên host)

- Một file trên host, ví dụ: `/var/lib/izerocs/otbr-rcp.env` (hoặc dùng chung thư mục với socket, vd. `/var/run/izerocs/`).
- Nội dung kiểu:
  - `OT_RCP_DEVICE=spinel+hdlc+uart:///dev/serial/by-id/xxx?uart-baudrate=460800`
  - Hoặc tách: `OT_RCP_DEVICE_PATH=...`, `OT_RCP_BAUDRATE=460800` rồi entrypoint ghép URL.

### 2. Backend ghi file

- Backend container **mount** đúng path host chứa file (vd. volume `/var/lib/izerocs:/var/lib/izerocs` hoặc chung với socket).
- API/Settings: nhận `serialPort` (path hoặc by-id) + `baudRate` → build chuỗi `OT_RCP_DEVICE` → ghi file → gọi `restartOtbr()`.

### 3. Entrypoint OTBR đọc file khi start

- Trong `otbr/otbr-entrypoint.sh`: trước `exec /init`, nếu tồn tại file config (mount vào container) thì `source` hoặc đọc từng dòng và `export` để set `OT_RCP_DEVICE`.
- Compose: không set `OT_RCP_DEVICE` cố định (hoặc chỉ giá trị mặc định khi chưa có file); ưu tiên env từ file.

Luồng: Backend ghi file → gọi restart → container start lại → entrypoint đọc file → OTBR chạy với serial/baudrate mới.

### 4. Supervisor (watch device)

- **Đơn giản:** Giữ `DEVICE_PATH` từ env systemd; user vẫn cấu khi cài. Backend chỉ đổi URL cho OTBR (cùng device, đổi baudrate).
- **Đồng bộ:** Supervisor mỗi lần start (hoặc mỗi lần xử lý restart) đọc cùng file config → lấy device path để watch; khi backend đổi port (by-id khác) và ghi file + restart, supervisor watch đúng device mới.

### 5. Tùy chọn: lệnh socket supervisor

- Thêm lệnh kiểu `set-otbr-config <path> <baudrate>` (hoặc JSON) để supervisor **ghi giúp** file config trên host nếu backend không mount được path đó. Backend gửi lệnh này rồi gửi `restart-otbr`.

## Tóm tắt

| Thành phần   | Việc cần làm |
|-------------|----------------|
| Backend     | API nhận serial + baudrate → ghi file config (volume host) → `restartOtbr()`. |
| OTBR entrypoint | Khi start: đọc file config (nếu có), export `OT_RCP_DEVICE` → `exec /init`. |
| Supervisor  | Giữ hiện tại hoặc đọc file để lấy device path cho watch. |
| Compose     | Mount volume chứa file config vào backend (ghi) và OTBR (đọc). |

Hiện tại dùng tạm cấu hình trong compose/env; triển khai theo doc này khi cần set serial/baudrate từ UI.
