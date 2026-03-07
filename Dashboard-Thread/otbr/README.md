# OTBR Docker (wrapper đợi RCP)

Chạy OpenThread Border Router trong Docker với entrypoint **đợi RCP** (theo path **by-id**) rồi mới start. **Không cần cắm RCP khi chạy container** — container start được ngay; cắm RCP bất kỳ lúc nào, entrypoint đợi device xuất hiện. Rút RCP → **supervisor trên host** (socket + poll device) restart container → entrypoint đợi device lại.

## Rút RCP → restart container (supervisor trên host)

Trong container không đáng tin khi poll "device còn hay mất". Dùng **supervisor** (thư mục `supervisor/`): một service vừa lắng nghe Unix socket (backend gọi restart), vừa poll device (mặc định `/dev/ttyACM0`); device mất thì `docker restart <container>`.

**Cài một lần trên host** (từ thư mục **Dashboard-Thread**): xem `supervisor/README.md`, chạy `sudo bash ./supervisor/install-supervisor-service.sh [container-name] [device-path]`.

## RCP theo by-id (mặc định)

Compose dùng **mount `/dev:/dev`** và **OT_RCP_DEVICE** trỏ tới `/dev/serial/by-id/...`. Path by-id ổn định, cắm lại vẫn đúng.

- Mặc định: `usb-1a86_USB_Single_Serial_579B026391-if00` (CH340 → **ttyUSB**). Board native USB (ESP32-H2) → **ttyACM** trong by-id.
- RCP khác: `ls /dev/serial/by-id/` rồi sửa `OT_RCP_DEVICE` trong `docker-compose.yml`.

## Cấu hình khác

Mặc định backhaul `OT_INFRA_IF` trong compose (vd. `enp8s0`). Để override:

1. Tạo file env từ mẫu: `cp otbr-env.list.example otbr-env.list`
2. Sửa `otbr-env.list` (OT_RCP_DEVICE, OT_INFRA_IF).
3. Trong `docker-compose.yml`, thêm vào service `otbr`: `env_file: - ./otbr/otbr-env.list`.

## Chạy

Từ thư mục **Dashboard-Thread**:

```bash
# Chỉ OTBR
docker compose up otbr --build -d

# Cả backend + OTBR
docker compose up --build -d
```

Có thể start container trước, cắm RCP sau; entrypoint đợi đến khi path by-id xuất hiện rồi mới chạy OTBR.

## Build riêng image

```bash
docker build -f otbr/Dockerfile -t dashboard-thread-otbr ./otbr
```

## Lưu ý

- **Entrypoint**: Chỉ đợi device (by-id) xuất hiện rồi `exec /init`. Không poll "device mất" trong container — dùng supervisor trên host (xem mục "Rút RCP" trên).
- **Quyền device**: `privileged: true` + mount `/dev`.
- **IP forwarding**: Service supervisor bật IP forwarding khi start; không cần chạy setup-host riêng nếu đã cài service.

## Troubleshooting: Rút ra cắm lại (hoặc cắm ESP32 khác) mà host không thấy /dev

Sau khi rút RCP hoặc cắm board khác, nhiều khi **kernel/udev không tạo node mới** (`/dev/ttyACM*` hoặc `/dev/ttyUSB*`) — driver USB serial có thể còn giữ trạng thái cũ. Thử lần lượt:

1. **Rút USB, đợi 5–10 giây**, rồi cắm lại (hoặc cắm board khác).
2. **Đổi cổng USB** (thử USB 2.0 nếu đang dùng 3.0, hoặc ngược lại).
3. **Reset driver trên host** (chạy ngoài container):
   - Nếu RCP là **ttyACM** (native USB):  
     `sudo rmmod cdc_acm && sudo modprobe cdc_acm`
   - Nếu RCP là **ttyUSB** (CH340):  
     `sudo rmmod ch341 && sudo modprobe ch341`  
     (hoặc `usb-serial` tùy distro)
   - Rồi cắm lại thiết bị.
4. **Kiểm tra host có nhận USB không**: `lsusb` (cắm vào xem có thêm dòng mới), `dmesg -w` (cắm vào xem có log usb/tty). Nếu `lsusb` không thấy thiết bị thì lỗi ở USB/cáp/port, không phải driver.
