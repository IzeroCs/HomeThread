# BR thật — Hướng dẫn tích hợp (Thread-Node & Dashboard-Thread)

> **Mục đích:** Tài liệu cho **Thread-Node** (firmware child) và **Dashboard-Thread** (backend/frontend) biết kiến trúc sau Phase 2: BR thật có backhaul, kênh quản lý qua TCP; child gửi thẳng backend.

---

## 1. Tổng quan kiến trúc

- **BR (Thread-Host):** Border Router thật: backhaul Wi‑Fi hoặc Ethernet W5500, border routing + prefix. Child có IPv6 routable.
- **Kênh quản lý BR ↔ Dashboard:** Chỉ qua **TCP** (frame protocol). BR listen một port (mặc định 5000); Dashboard kết nối tới **BR_IP:port**. Không dùng USB/serial.
- **Child ↔ Backend:** Child (Thread-Node) gửi register/update/ping **trực tiếp tới Backend** (IP:port). BR **không** làm proxy; BR chỉ route IP.

```
                    [Dashboard]
                         | TCP (frame protocol)
                         v
  [Child] --Thread mesh--> [BR] ----backhaul----> [Backend]
     |                          (Wi‑Fi / Ethernet)     ^
     |                                                 |
     +------------------ IPv6 (CoAP/HTTP) -------------+
              register / update / ping
```

---

## 2. Dashboard-Thread — Cần làm gì

### 2.1. Kết nối tới BR

- **Transport:** Kết nối **TCP** tới `BR_IP:port` (port mặc định 5000, cấu hình trong BR menuconfig).
- **Giao thức:** Cùng [frame protocol](../protocol/usb_cdc_frame_structure.md) (SOF/Frame ID/CMD/LEN/DATA/CRC8/EOF) — gửi/nhận **byte stream** trên socket, không phải serial/USB.
- **BR_IP và port:** BR đăng ký mDNS hostname **Thread-Host** (resolve `Thread-Host.local` → IP) và service **\_thread-frame.\_tcp** (port frame, mặc định 5000). Backend có thể: (1) resolve `Thread-Host.local` → BR_IP, port lấy từ config, hoặc (2) browse service `_thread-frame._tcp` → nhận luôn instance name, IP và port.

### 2.2. Không còn CMD_DATA push từ BR

- **Đã bỏ:** BR không còn gửi CMD_DATA (CBOR từ child) lên Dashboard. Không còn device registry server trên BR.
- **Dữ liệu child:** Backend nhận register/update/ping **trực tiếp từ Child** (xem mục 3). Dashboard nếu cần hiển thị device list thì lấy từ Backend API, không từ frame BR.

### 2.3. Frame protocol — chỉ cho quản lý BR

- Pull state, dataset, tables, IP, set config, commissioner joiner, reset/factory — **giữ nguyên** (CMD_STATE, CMD_DATASET_ACTIVE, CMD_IP_ADDR, CMD_SET_*, CMD_COMMISSIONER_JOINER, CMD_RESET, CMD_FACTORY, …).
- Cấu trúc frame, bảng CMD, CRC8, format table: xem [usb_cdc_frame_structure.md](../protocol/usb_cdc_frame_structure.md) và [table_data_format.md](../protocol/table_data_format.md). Chỉ đổi **transport**: socket TCP thay serial.

---

## 3. Thread-Node (Child) — Cần làm gì

### 3.1. Gửi register/update/ping tới Backend

- **Đích:** Backend (server) — địa chỉ IP và port do cấu hình (commissioning, NVS, hoặc mDNS). **Không** gửi tới BR cho device registry.
- **Giao thức thường dùng:** CoAP (UDP 5683) hoặc HTTP (TCP). Định dạng payload thường là JSON hoặc CBOR (xem [border_router_coap_server.md](../coap/border_router_coap_server.md) phần payload format — backend có thể giữ resource `/device/register`, `/device/update`, `/device/ping` nhưng **chạy trên Backend**, không trên BR).

### 3.2. Địa chỉ Backend

- Child cần biết **Backend IP (và port)** — qua cấu hình, commissioning, hoặc mDNS. BR không cung cấp địa chỉ backend qua frame; đó là phần triển khai Backend/Dashboard.

### 3.3. IPv6 routable

- Sau khi BR bật border routing + prefix, child có IPv6 từ prefix BR quảng bá. Child dùng địa chỉ đó để gửi request ra backbone tới Backend.

---

## 4. Backend (server nhận request từ Child)

- **Listen:** CoAP (vd. port 5683) hoặc HTTP (vd. 8080) trên interface có route tới Thread (vd. `0.0.0.0` hoặc interface kết nối mạng có BR).
- **Resources:** Có thể giữ API tương tự legacy: POST `/device/register`, `/device/update`, GET `/device/ping` — nhưng **chạy trên Backend**, không trên BR. Payload format (CBOR với numeric map keys) có thể giữ để tương thích Thread-Node.
- **ACK/NACK:** Backend trả response cho từng request (CoAP 2.01/2.04/2.05 hoặc 4xx/5.03) để Child không treo (xem lưu ý NoBufs trong [border_router_coap_server.md](../coap/border_router_coap_server.md)).

---

## 5. Tài liệu liên quan

| Tài liệu | Nội dung |
|----------|----------|
| [../protocol/usb_cdc_frame_structure.md](../protocol/usb_cdc_frame_structure.md) | Frame protocol (transport: TCP; CMD, CRC8, error codes) |
| [../protocol/table_data_format.md](../protocol/table_data_format.md) | Binary format Router/Child/Joiner Table |
| [../coap/border_router_coap_server.md](../coap/border_router_coap_server.md) | Device registry (legacy trên BR; **hiện chạy trên Backend**), payload format, ACK/NACK |
| [../dashboard/migration_to_frame_protocol.md](../dashboard/migration_to_frame_protocol.md) | Dashboard: migration sang frame; **cập nhật: kết nối TCP tới BR** |
