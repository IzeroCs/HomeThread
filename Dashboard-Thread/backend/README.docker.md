# Backend — Docker

Dockerfile và docker-compose nằm ở **thư mục gốc Dashboard-Thread** (để sau build cùng frontend).

## Chạy nhanh (từ thư mục Dashboard-Thread)

```bash
cd /path/to/Dashboard-Thread
docker compose up --build
```

- WebSocket/HTTP: http://localhost:3000
- CoAP: UDP 5683 (Thread-Node gửi register/ping tới đây)

## Reply từ backend → Thread-Node

Mặc định container dùng bridge. Để backend trả lời CoAP về Node, **host** cần có route prefix Thread qua BR:

```bash
sudo ip -6 route add <PREFIX>::/64 via <BR_LINKLOCAL> dev <INTERFACE>
```

Hoặc chạy backend với **network host** (dùng chung route với host):

```bash
docker compose run --rm --service-ports --network host backend
```

(Khi dùng `--network host`, port 3000/5683 là của host.)

## Build riêng image

```bash
# Từ thư mục Dashboard-Thread
docker build -f Dockerfile.backend -t dashboard-backend .
docker run --rm -p 3000:3000 -p 5683:5683/udp dashboard-backend
```
