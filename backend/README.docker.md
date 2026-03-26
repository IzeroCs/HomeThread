# Backend — Docker

Docker assets nằm ở **thư mục gốc `namorix-thread/`**:

- `Dockerfile` (multi-target: `prod`, `dev`)
- `compose.dev.yml` (dev container)

Dữ liệu SQLite + migration nằm ở `namorix-thread/data/`.

## Chạy dev container (từ root `namorix-thread/`)

```bash
cd /path/to/namorix-thread
docker compose -f compose.dev.yml up --build
```

- WebSocket/HTTP: http://localhost:4000
- CoAP: UDP 5683 (Thread-Node gửi register/ping tới đây)

## Kết nối BR khi chạy Docker

**mDNS thường không ổn trong container.** Khuyến nghị cấu hình BR bằng **IPv4** (ví dụ `192.168.31.3:5000`) trong Settings. Tính năng "tìm BR" nên ưu tiên scan dải IP/TCP 5000.

## Reply từ backend → Thread-Node

Compose dev hiện tại publish `4000:4000`; backend vẫn gửi CoAP response theo route của host stack. Nếu node không nhận response, kiểm tra route IPv6 giữa host và prefix Thread theo tài liệu kiến trúc.

## Build image production-like

```bash
cd /path/to/namorix-thread
docker build --target prod -t namorix-thread:prod .
docker run --rm -p 4000:4000 namorix-thread:prod
```
