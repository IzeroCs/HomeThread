# Supervisor

Daemon nhỏ (Python, chỉ stdlib): **socket** (backend gọi restart-otbr) + **watch device** (RCP mất thì tự restart container). Chạy một systemd service là đủ, thay cho otbr-watch-device riêng.

## Thư mục socket

- **/var/run/izerocs**: Backend hoặc supervisor (ai chạy trước) đều tự tạo folder này.
- **/var/run/izerocs/supervisor.sock**: Supervisor tạo và listen tại đây.

Backend (Docker) cần mount host `/var/run/izerocs` vào container để thấy sock.

## Chạy trên host

```bash
cd supervisor
OTBR_CONTAINER_NAME=dashboard-thread-otbr DEVICE_PATH=/dev/ttyACM0 python3 server.py
```

- **SUPERVISOR_SOCK_DIR** (mặc định `/var/run/izerocs`): thư mục chứa `supervisor.sock`.
- **OTBR_CONTAINER_NAME** (mặc định `dashboard-thread-otbr`): tên container cần restart.
- **DEVICE_PATH**: đường dẫn device RCP (vd. `/dev/ttyACM0` hoặc `/dev/serial/by-id/...`). Nếu set thì supervisor chạy thread poll: device mất → `docker restart`. Để trống thì chỉ phục vụ socket.
- **INTERVAL** (mặc định `5`): giây giữa mỗi lần kiểm tra device.
- **DOCKER** (mặc định `docker`): lệnh docker.

Cần quyền tạo socket và gọi `docker restart` (user trong group `docker` hoặc root).

## Giao thức (qua socket)

Kết nối Unix stream, gửi một dòng (kết thúc `\n`), đọc một dòng phản hồi:

- `restart-otbr` → `ok` hoặc `error: ...`
- `health` hoặc rỗng → `ok`

## Cài service systemd (một service thay otbr-watch-device)

Từ thư mục Dashboard-Thread:

```bash
sudo bash ./supervisor/install-supervisor-service.sh
# Container/device khác: sudo bash ./supervisor/install-supervisor-service.sh my-otbr /dev/serial/by-id/...
```

Service bật IP forwarding khi start, chạy supervisor (socket + watch device). Nếu trước đã cài `otbr-watch-device.service` thì có thể tắt và disable nó, chỉ dùng supervisor.

## Backend

Backend lúc khởi động tạo folder `/var/run/izerocs` (nếu chưa có). Gọi `restartOtbr()` từ `./supervisor/socketClient` khi cần restart OTBR.
