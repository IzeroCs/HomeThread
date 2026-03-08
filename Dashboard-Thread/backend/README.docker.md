# Backend — Docker

Dockerfile và docker-compose nằm ở **thư mục gốc Dashboard-Thread** (để sau build cùng frontend).

## Chạy nhanh (từ thư mục Dashboard-Thread)

```bash
cd /path/to/Dashboard-Thread
docker compose up --build
```

- WebSocket/HTTP: http://localhost:3000
- CoAP: UDP 5683 (Thread-Node gửi register/ping tới đây)

## Kết nối OTBR khi chạy Docker

Backend nói chuyện với OTBR qua **D-Bus**. Cần volume chung giữa backend và OTBR:

- Trong `docker-compose.yml`: volume `otbr-dbus:/run/dbus` mount vào cả service **otbr** và **backend** (nếu chạy backend bằng container).
- OTBR (otbr-agent) tạo socket D-Bus tại `/run/dbus/system_bus_socket` trong volume.
- Backend container cần env: `DBUS_SYSTEM_BUS_ADDRESS=unix:path=/run/dbus/system_bus_socket`.

Khi chạy backend **trên host** (không trong container): set `DBUS_SYSTEM_BUS_ADDRESS` trỏ tới socket D-Bus mà OTBR container expose (vd. bind mount host path vào volume otbr-dbus).

## Reply từ backend → Thread-Node

`docker-compose.yml` dùng **network_mode: host** — container dùng chung **network namespace** (và bảng routing) với host. Backend **không cần đọc hay cấu hình route trong code**: khi gửi CoAP response về node (rsinfo), kernel tự dùng route của host. Chỉ cần host đã có route tới prefix Thread (học qua RA từ BR hoặc thêm tay). *(Tùy chọn sau: API đọc route `ip -6 route` hoặc `/proc/net/ipv6_route` để hiển thị/kiểm tra.)*

## Build riêng image

```bash
# Từ thư mục Dashboard-Thread
docker build -f Dockerfile.backend -t dashboard-backend .
docker run --rm -p 3000:3000 -p 5683:5683/udp dashboard-backend
```
