# BR thật — Hướng dẫn tích hợp (Thread-Node & Dashboard-Thread)

> **Mục đích:** Tài liệu cho **Thread-Node** (firmware child) và **Dashboard-Thread** (backend/frontend) biết kiến trúc sau Phase 2: BR thật có backhaul, kênh quản lý qua TCP; child gửi thẳng backend.

---

## 1. Tổng quan kiến trúc

- **BR (Thread-Host):** Border Router thật: backhaul **Ethernet W5500** (khi bật; Wi‑Fi fallback đã tắt), border routing + prefix. IPv6 trên backbone: link-local tạo khi Ethernet link up; global/ULA nếu router gửi RA. Child có IPv6 routable.
- **Kênh quản lý BR ↔ Dashboard:** Chỉ qua **TCP** (frame protocol). BR listen một port (mặc định 5000); Dashboard kết nối tới **BR_IP:port**. Không dùng USB/serial.
- **Child ↔ Backend:** Child (Thread-Node) gửi register/update/ping **trực tiếp tới Backend** (IP:port). BR **không** làm proxy; BR chỉ route IP.

```
                    [Dashboard]
                         | TCP (frame protocol)
                         v
  [Child] --Thread mesh--> [BR] ----backhaul----> [Backend]
     |                          (Ethernet W5500)        ^
     |                                                 |
     +------------------ IPv6 (CoAP/HTTP) -------------+
              register / update / ping
```

---

## 2. Dashboard-Thread — Cần làm gì

### 2.1. Kết nối tới BR

- **Transport:** Kết nối **TCP** tới `BR_IP:port` (port mặc định 5000, cấu hình trong BR menuconfig).
- **Giao thức:** Cùng [frame protocol](../protocol/usb_cdc_frame_structure.md) (SOF/Frame ID/CMD/LEN/DATA/CRC8/EOF) — gửi/nhận **byte stream** trên socket, không phải serial/USB.
- **BR_IP và port:** BR đăng ký mDNS hostname **Thread-Host** (resolve `Thread-Host.local` → IP) và service **\_thread-frame.\_tcp** (port frame, mặc định 5000). Backend có thể: (1) resolve `Thread-Host.local` → BR_IP, port lấy từ config, hoặc (2) browse service `_thread-frame._tcp` → nhận luôn instance name, IP và port. **Khi chạy Backend trong Docker:** mDNS thường không resolve được trong container → cấu **BR bằng IP** (vd. 192.168.31.3:5000) trong Settings hoặc dùng default (Dashboard-Thread migration mặc định 192.168.31.3:5000).

### 2.2. Không còn CMD_DATA push từ BR

- **Đã bỏ:** BR không còn gửi CMD_DATA (CBOR từ child) lên Dashboard. Không còn device registry server trên BR.
- **Dữ liệu child:** Backend nhận register/update/ping **trực tiếp từ Child** (xem mục 3). Dashboard nếu cần hiển thị device list thì lấy từ Backend API, không từ frame BR.

### 2.3. Frame protocol — chỉ cho quản lý BR

- Pull state, dataset, tables, IP, set config, commissioner joiner, reset/factory — **giữ nguyên** (CMD_STATE, CMD_DATASET_ACTIVE, CMD_IP_ADDR, CMD_SET_*, CMD_COMMISSIONER_JOINER, CMD_RESET, CMD_FACTORY, …).
- Cấu trúc frame, bảng CMD, CRC8, format table: xem [usb_cdc_frame_structure.md](../protocol/usb_cdc_frame_structure.md) và [table_data_format.md](../protocol/table_data_format.md). Chỉ đổi **transport**: socket TCP thay serial.

---

## 3. Thread-Node (Child) — Cần làm gì

### 3.1. Gửi register/update/ping tới Backend

- **Đích (kiến trúc mục tiêu):** Backend (server) — địa chỉ IP và port do cấu hình (commissioning, NVS, hoặc mDNS). **Không** gửi tới BR cho device registry.
- **Giao thức thường dùng:** CoAP (UDP 5683) hoặc HTTP (TCP). Định dạng payload thường là JSON hoặc CBOR (xem [border_router_coap_server.md](../coap/border_router_coap_server.md) phần payload format — backend có thể giữ resource `/device/register`, `/device/update`, `/device/ping` nhưng **chạy trên Backend**, không trên BR).

> **Ghi chú triển khai hiện tại (Thread-Node 0.9.x)**  
> - Thread-Node **đã** gửi `/device/register` **tới Backend** (sau khi discovery qua `thread_discovery`). Không còn gửi tới Leader RLOC.  
> - Register được trigger khi: discovery thành công; refresh task (60s) phát hiện endpoint (addr/port) thay đổi; **GET /device/ping** nhận timestamp khác (backend restart) → gửi lại register.  
> - Xem [thread_node_coap.md](../coap/thread_node_coap.md) và component `thread/device` (device_registry, device_coap) + `thread/thread_discovery`.

### 3.2. Địa chỉ Backend

- Child cần biết **Backend IP (và port)**. **Ưu tiên:** dùng **discovery (tự scan)** qua SRP/DNS-SD (mục 3.2.1); nếu không tìm thấy service thì **fallback** cấu hình tĩnh (commissioning, NVS, hoặc mDNS khác). BR không cung cấp địa chỉ backend qua frame.

#### 3.2.1. Discovery backend qua SRP/DNS-SD (tự scan)

- **SRP server:** Chạy trên BR/Thread-Host (otbr hoặc firmware Thread-Host thường có sẵn). Backend Dashboard **tự đăng ký** service khi start; Thread-Node **tự scan/browse** để tìm backend.
- **Service đăng ký:** Backend đăng ký service DNS-SD với SRP server của BR:
  - **Service type:** `_dashboard._udp`
  - **Domain:** `default.svc.arpa`
  - **Instance:** ví dụ `dashboard` (hoặc từ cấu hình)
  - **Port:** 5683 (CoAP)
  - **TXT:** `ver=1`, `proto=coap+cbor`, `path=/device`
- **Luồng Backend:** Dashboard-Thread backend gửi đăng ký SRP **qua frame protocol** (CMD_SRP_REGISTER = 0x44) tới BR khi BR trở thành leader; BR (Thread-Host) nhận frame rồi submit lên SRP server. DATA: hostname_len(1) + hostname(N) + backend_ipv6(16) + port(2 BE). IPv6 backend lấy từ env BACKEND_IPV6 hoặc tự lấy (ULA/link-local).
- **Luồng Thread-Node:** Sau khi join mạng, browse `_dashboard._udp.default.svc.arpa` (OpenThread SRP client / DNS-SD) → nhận SRV + A/AAAA → lấy IP và port backend → cache; dùng cho CoAP. Nếu browse không thấy service → fallback cấu hình tĩnh (IP/port trong NVS hoặc commissioning).
- **Kiểm tra trên BR:** Trên serial CLI BR (UART0), chạy **`ot srp server host`** và **`ot srp server service`** để xem host/service đã đăng ký (vd. `dashboard.default.service.arpa.`, `dashboard._dashboard._udp.default.service.arpa.`). Cần `CONFIG_OPENTHREAD_HEADER_CUSTOM=y` và path `include` trong sdkconfig để lệnh SRP CLI có sẵn.

### 3.3. IPv6 routable

- Sau khi BR bật border routing + prefix, child có IPv6 từ prefix BR quảng bá. Child dùng địa chỉ đó để gửi request ra backbone tới Backend.

### 3.4. LAN chỉ IPv4 thì sao?

- Router trong nhà (MikroTik/Deco) hiện chỉ cấp **IPv4** trên LAN; điều này **không ngăn** BR làm Border Router cho Thread:
  - BR vẫn nhận IPv4 (DHCP hoặc static) để Dashboard/backend kết nối BR qua TCP.
  - BR vẫn cấp prefix IPv6 cho child trong mạng Thread.
- Để child nói chuyện được với backend theo mô hình “BR thật” (BR chỉ route, không proxy):
  - **Khuyến nghị:** Bật **IPv6 local** (link-local/ULA) trên chính máy Backend, không phụ thuộc ISP hay router. Backend listen CoAP/HTTP trên IPv6 đó; BR route giữa prefix Thread và IPv6 của backend.
  - Nếu backend chỉ IPv4: cần thêm NAT64 hoặc proxy trên BR (chưa implement trong thiết kế hiện tại; nếu dùng, cần cập nhật thêm docs riêng cho mô hình proxy).

---

## 4. Backend (server nhận request từ Child)

- **Listen:** CoAP (vd. port 5683) hoặc HTTP (vd. 8080) trên interface có route tới Thread (vd. `0.0.0.0` hoặc interface kết nối mạng có BR).
- **Resources:** Có thể giữ API tương tự legacy: POST `/device/register`, `/device/update`, GET `/device/ping` — nhưng **chạy trên Backend**, không trên BR. Payload format (CBOR với numeric map keys) có thể giữ để tương thích Thread-Node.
- **ACK/NACK:** Backend trả response cho từng request (CoAP 2.01/2.04/2.05 hoặc 4xx/5.03) để Child không treo (xem lưu ý NoBufs trong [border_router_coap_server.md](../coap/border_router_coap_server.md)).

### 4.1. Route Backend → Node (reply CoAP)

Để **reply từ Backend tới Thread-Node** tới đích, máy chạy Backend cần **route** tới prefix Thread (OMR, vd. fdb8:.../fdd7:...) **via** BR (link-local IPv6 của BR trên backbone). BR gửi Router Advertisement (RA) có Route Information Option (RIO) nhưng với **router lifetime = 0** → nhiều kernel Linux không cài route từ RIO. **Cách làm:** Thêm route tay trên host: `ip -6 route add <PREFIX>::/64 via <BR_linklocal> dev <iface>`. Route mất sau reboot; có thể script/cron hoặc persistent. Sau **factory reset BR**, prefix và có thể cả link-local BR đổi → cập nhật lại route. **Backend chạy Docker:** Dùng `network_mode: host` để container dùng chung stack mạng (và route) với host; khi đó route thêm trên host có hiệu lực cho Backend trong container.

---

## 5. Debug: RX/TX logging (BR)

- Ở level log **INFO** (mặc định), BR không in frame RX/TX cho CMD_STATE và bảng (ROUTER_TABLE, CHILD_TABLE, JOINER_TABLE) để giảm noise.
- Để xem **mọi frame nhận/gửi** và **byte stream TCP**: set log level **DEBUG** cho component/tag `communicate` và `transport_tcp` (menuconfig: Component config → Log output → Set log level; hoặc runtime `esp_log_level_set("communicate", ESP_LOG_DEBUG)` và tương tự cho `"transport_tcp"`).
- Khi bật DEBUG: log `frame RX: id=... cmd=... len=...`, `frame TX: ...`, `tcp rx N bytes`, `tcp tx N bytes`.

---

## 6. Troubleshooting: CoAP response không tới node (ResponseTimeout)

Khi Thread-Node báo **ResponseTimeout** (ping/register), response từ backend **chưa tới node**. Backend gửi UDP về đúng địa chỉ nguồn (rsinfo) của request; vấn đề nằm ở **routing và forwarding** giữa host backend và Thread mesh.

### 6.1 Host chạy backend (Linux)

- **Route:** Host cần có route IPv6 tới **prefix Thread (OMR)** qua BR. Kiểm tra: `ip -6 route get <địa_chỉ_ULA_node>` (vd. `fdb8:3795:e886:1:...`) → next-hop phải là BR (link-local hoặc ULA), dev = interface nối tới BR. Route thường học qua **Router Advertisement** từ BR (proto ra).
- **IPv6 forwarding:** Nếu BR chạy trên **cùng host** (OTBR trên Linux) thì cần `net.ipv6.conf.all.forwarding=1`. Nếu BR là thiết bị riêng (vd. ESP32-S3), host backend chỉ cần route, không bắt buộc bật forwarding.

### 6.2 Border Router (ESP32-S3 + RCP hoặc OTBR)

- **BR phần cứng (ESP32-S3 + RCP):** Forwarding IPv6 giữa backhaul và Thread do **firmware BR** (border routing) đảm nhiệm. Đảm bảo border routing bật và BR quảng bá **OMR prefix** (fdb8:... hoặc prefix node đang dùng) ra backhaul; packet đích tới prefix đó phải được chuyển vào mesh tới đúng node.
- **Hai prefix:** BR có **mesh-local prefix** (vd. fd18:2045:c1db:f85d::/64) và có thể có **OMR prefix** (vd. fdb8:3795:e886:1::/64) cho địa chỉ routable từ backbone. Node có cả mesh-local và OMR; backend nhận request từ OMR và gửi response về OMR.
- **OTBR trên Linux:** Cần bật IPv6 forwarding; firewall (ip6tables) phải cho phép FORWARD vào interface Thread (vd. wpan0). Chi tiết OTBR: tài liệu OpenThread Border Router.

### 6.3 Kiểm tra nhanh

- Từ host backend: `ping6 <node_ULA>`. Nếu ping được thì path đã thông, CoAP response cũng đi cùng đường. Nếu "No route" hoặc timeout → sửa route / BR forwarding trước.

---

## 7. Tài liệu liên quan

| Tài liệu | Nội dung |
|----------|----------|
| [../protocol/usb_cdc_frame_structure.md](../protocol/usb_cdc_frame_structure.md) | Frame protocol (transport: TCP; CMD, CRC8, error codes) |
| [../protocol/table_data_format.md](../protocol/table_data_format.md) | Binary format Router/Child/Joiner Table |
| [../coap/border_router_coap_server.md](../coap/border_router_coap_server.md) | Device registry (legacy trên BR; **hiện chạy trên Backend**), payload format, ACK/NACK |
| [../coap/thread_node_coap.md](../coap/thread_node_coap.md) | CoAP /device/, GET ping, troubleshooting ResponseTimeout |
| [../dashboard/migration_to_frame_protocol.md](../dashboard/migration_to_frame_protocol.md) | Dashboard: migration sang frame; **cập nhật: kết nối TCP tới BR** |
