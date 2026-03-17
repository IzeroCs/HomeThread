# Backend — Docker

Dockerfile và docker-compose nằm ở **thư mục gốc `dashboard/`** (để sau build cùng frontend).

## Chạy nhanh (từ thư mục `dashboard/`)

```bash
cd /path/to/dashboard
docker compose up --build
```

- WebSocket/HTTP: http://localhost:3000
- CoAP: UDP 5683 (Thread-Node gửi register/ping tới đây)

## Kết nối BR khi chạy Docker

**mDNS không dùng được trong container:** Dù dùng `network_mode: host` hay bind resolv/nsswitch, resolve `Thread-Host.local` trong container thường thất bại. **Khuyến nghị:** Cấu hình BR connection bằng **IP** (vd. `192.168.31.3:5000`) trong Settings. Migration mặc định 192.168.31.3:5000 khi dùng Docker. Tính năng "Tìm BR" (sau này) có thể làm bằng **quét dải IP** (TCP port 5000) thay vì mDNS, hoạt động ổn trong Docker.

## Reply từ backend → Thread-Node

`docker-compose.yml` dùng **network_mode: host** — container dùng chung **network namespace** (và bảng routing) với host. Backend **không cần đọc hay cấu hình route trong code**: khi gửi CoAP response về node (rsinfo), kernel tự dùng route của host. Chỉ cần host đã có route tới prefix Thread (học qua RA từ BR hoặc thêm tay). *(Tùy chọn sau: API đọc route `ip -6 route` hoặc `/proc/net/ipv6_route` để hiển thị/kiểm tra.)*

## Build riêng image

```bash
# Từ thư mục dashboard/
cd /path/to/dashboard
docker build -f Dockerfile.backend -t namorix-thread-backend .
docker run --rm -p 3000:3000 -p 5683:5683/udp namorix-thread-backend
```
