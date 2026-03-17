# BR thật — Hướng dẫn tích hợp (endpoint & dashboard)

> **Mục đích:** Tài liệu cho **endpoint** (firmware child) và **dashboard** (backend/frontend) về kiến trúc BR thật: backhaul Ethernet, kênh quản lý TCP, child gửi thẳng backend.

---

## 1. Tổng quan kiến trúc

- **BR (Thread-Host):** Backhaul **Ethernet W5500**; init chờ IPv4 DHCP (timeout 25s, sau đó restart). IPv6 backbone: link-local khi Ethernet up; global/ULA nếu router gửi RA. Child có IPv6 routable qua OMR prefix.
- **Kênh quản lý BR ↔ Dashboard:** Chỉ qua **TCP** (frame protocol). BR listen một port (mặc định 5000); Dashboard kết nối tới `BR_IP:port`.
- **Child ↔ Backend:** Thread-Node gửi register/update/ping **trực tiếp tới Backend** qua IPv6. BR **không** làm proxy; BR chỉ route IP.

```
                    [Dashboard]
                         | TCP (frame protocol)
                         v
  [Child] --Thread mesh--> [BR] ----Ethernet----> [Backend]
     |                                                 ^
     +------------------ IPv6 (CoAP) -----------------+
              register / update / ping
```

---

## 2. dashboard — Kết nối và quản lý BR

### 2.1 Kết nối tới BR

- **Transport:** TCP tới `BR_IP:port` (mặc định 5000).
- **Giao thức:** Frame protocol (SOF/Frame ID/CMD/LEN/DATA/CRC8/EOF) — byte stream trên socket. Chi tiết: [../protocol/usb_cdc_frame_structure.md](../protocol/usb_cdc_frame_structure.md).
- **Địa chỉ:** Dùng **IPv4** (vd. `192.168.31.3:5000`). ESP32-S3 chỉ listen TCP trên IPv4 → dùng IPv6 dễ ECONNREFUSED. Nếu dùng IPv6 link-local phải có zone ID (`fe80::...%enp7s0`).
- **mDNS trong Docker:** Không hoạt động trong container → cấu hình BR bằng IP tĩnh. Backend trong Docker dùng `network_mode: host`.

### 2.2 Keepalive và ACK bắt buộc

**Keepalive (watchdog phía BR):** BR có state watchdog — nếu không nhận `CMD_STATE` trong 15s × 5 lần → tự restart. Backend **phải gửi `CMD_STATE` định kỳ**; BR trả `CMD_ACK` với 1 byte role.

**ACK cho `CMD_IP_ADDR`:** Sau khi nhận `CMD_ACK` kèm 16 bytes Leader RLOC, backend **phải gửi lại một frame `CMD_ACK` rỗng (LEN=0) với cùng Frame ID** để BR dừng retry.

### 2.3 Polling và notify (giảm traffic)

**Hiện trạng — pull định kỳ:**
- `CMD_STATE` (keepalive)
- `CMD_DATASET_ACTIVE`, `CMD_IP_ADDR`, `CMD_MAC_ADDRESS`, `CMD_BR_HEALTH` khi cần
- `CMD_ROUTER_TABLE / CMD_CHILD_TABLE / CMD_JOINER_TABLE` khi UI cần refresh

**Roadmap — CMD_NOTIFY (0x45):** BR push khi có thay đổi, payload = `changed_mask` (u32 big-endian). Backend nhận notify thì chỉ pull thứ cần thiết:

| Bit thay đổi | Pull |
|---|---|
| ROLE / IP / DATASET | `CMD_STATE` / `CMD_IP_ADDR` / `CMD_DATASET_ACTIVE` |
| ROUTER / CHILD / JOINER | `CMD_ROUTER_TABLE` / `CMD_CHILD_TABLE` / `CMD_JOINER_TABLE` |
| BR health | `CMD_BR_HEALTH` |

**Gợi ý giảm traffic ngay (không cần thay đổi BR):** Chỉ pull tables khi UI đang mở tab tương ứng, user bấm refresh, hoặc vừa thực hiện action có khả năng đổi bảng.

### 2.4 BR Health

Backend poll `CMD_BR_HEALTH` định kỳ (~60s) và/hoặc khi nhận NOTIFY bit health. Backend **upsert 1 row duy nhất** per BR device (bảng `device_health_br`, snapshot, không lưu history). ACK data = **16-byte prefix** (free_heap, minimum_free_heap, uptime, mle_detach_count — mỗi uint32 BE) **+ TLV suffix** (task name/hwm/stack_size). Chi tiết format TLV: [../protocol/usb_cdc_frame_structure.md §5.1](../protocol/usb_cdc_frame_structure.md).

### 2.5 CMD_DATA push từ BR — đã bỏ

BR không còn gửi `CMD_DATA` (CBOR từ child) lên Dashboard. Không còn device registry server trên BR. Dữ liệu child: Backend nhận trực tiếp từ Thread-Node qua CoAP (xem mục 3).

### 2.6 SRP Register (CMD_SRP_REGISTER = 0x44)

Backend đăng ký service DNS-SD khi start (sau khi BR trở thành leader):

- **Service type:** `_dashboard._udp`, domain `default.svc.arpa`, port 5683
- **Frame DATA:** `hostname_len(1)` + `hostname(N)` + `backend_ipv6(16)` + `port(2 BE)`
- BR copy hostname + IPv6 vào buffer tĩnh (`s_srp_hostname`, `s_srp_backend_addr`) rồi mới gọi `otSrpClientSetHostName/SetHostAddresses` (OpenThread SRP client không copy — dangling pointer nếu dùng buffer stack).

---

## 3. Thread-Node (Child) — Gửi tới Backend

Thread-Node gửi CoAP trực tiếp tới Backend (không qua BR):

- **POST /device/register/info** → **POST /device/register/entity** → định kỳ **GET /device/ping**, **POST /device/update/topology**, **POST /device/update/state**
- Địa chỉ Backend lấy qua SRP/DNS-SD (browse `_dashboard._udp.default.svc.arpa`); fallback cấu hình tĩnh NVS.

Chi tiết payload, flow, và CBOR keys: **[../coap/device_payload_spec.md](../coap/device_payload_spec.md)**.  
Chi tiết SRP discovery: **[../coap/backend_discovery_srp.md](../coap/backend_discovery_srp.md)**.

### 3.1 IPv6 và LAN chỉ IPv4

- Router IPv4-only không ngăn BR làm Border Router: BR vẫn nhận IPv4 (DHCP) để Dashboard kết nối TCP; BR vẫn cấp OMR prefix IPv6 cho child trong mesh Thread.
- **Khuyến nghị:** Bật IPv6 local (link-local/ULA) trên máy Backend, không phụ thuộc ISP. Backend listen CoAP trên IPv6 đó; BR route giữa prefix Thread và IPv6 backend.
- Nếu backend chỉ IPv4: cần NAT64 hoặc proxy trên BR (chưa implement).

---

## 4. Backend (Server nhận CoAP từ Child)

- **Listen:** CoAP UDP 5683 trên `[::]` hoặc interface có route tới Thread.
- **Resources:** POST `/device/register/info`, POST `/device/register/entity`, GET `/device/ping`, POST `/device/update/topology`, POST `/device/update/state`.
- **ACK/NACK:** Backend trả response cho từng request (CoAP 2.01/2.04/2.05 hoặc 4xx/5.03); **luôn echo CoAP token** (RFC 7252).

### 4.1 Route Backend → Node (reply CoAP)

Host Linux chạy Backend cần **route IPv6 tới prefix Thread (OMR) via BR**:

**Tự động từ RA/RIO (khuyến nghị):**
```bash
sudo sysctl -w net.ipv6.conf.<IFACE>.accept_ra=2
sudo sysctl -w net.ipv6.conf.<IFACE>.accept_ra_rt_info_max_plen=128
# Xin BR gửi RA sớm (gói ndisc6):
sudo rdisc6 -1 <IFACE>
```
> `net.ipv6.conf.all.*` chỉ là default cho interface mới, không áp dụng ngược cho interface đã tồn tại — phải set per-interface.

**Route tay (fallback):**
```bash
sudo ip -6 route add <THREAD_PREFIX>/64 via <BR_LINKLOCAL>%<IFACE> dev <IFACE>
# Ví dụ:
sudo ip -6 route add fdb8:3795:e886:1::/64 via fe80::fc01:2cff:fecc:5e04%enp8s0 dev enp8s0
```
Route tay mất sau reboot và sau factory reset BR (prefix/link-local có thể đổi).

**Backend trong Docker:** Dùng `network_mode: host`. Thêm route cần `--cap-add=NET_ADMIN`.

---

## 5. Troubleshooting

### 5.1 CoAP ResponseTimeout

Thread-Node báo **ResponseTimeout** → response từ backend không tới node. Backend gửi UDP về đúng địa chỉ nguồn (rsinfo); vấn đề ở routing/forwarding.

**Checklist:**
1. Từ host backend: `ip -6 route get <node_ULA>` → next-hop phải là BR, dev = interface LAN.
2. Nếu "No route" → thêm route (mục 4.1).
3. BR phần cứng (ESP32-S3): đảm bảo border routing bật, BR quảng bá OMR prefix ra backhaul.
4. Kiểm tra nhanh: `ping6 <node_ULA>` từ host backend. Nếu ping được thì CoAP response đi cùng đường.

### 5.2 BR không nhận IPv4 (DHCP timeout)

BR restart sau 25s nếu không lấy được IPv4. Kiểm tra DHCP server trên LAN; hoặc cấu hình IP tĩnh trên BR.

### 5.3 RX/TX logging

- Log **INFO** (mặc định): BR log mọi frame RX/TX dạng `frame RX/TX: id=... cmd=... len=...`.
- Xem byte stream TCP: set log level **DEBUG** cho tag `transport_tcp`.

---

## 6. Tài liệu liên quan

| Tài liệu | Nội dung |
|----------|----------|
| [../protocol/usb_cdc_frame_structure.md](../protocol/usb_cdc_frame_structure.md) | Frame protocol (CMD table, CRC8, error codes, TLV BR health) |
| [../protocol/table_data_format.md](../protocol/table_data_format.md) | Binary format Router/Child/Joiner Table |
| [../coap/device_payload_spec.md](../coap/device_payload_spec.md) | CoAP endpoints, CBOR payload, DB schema, flow đăng ký |
| [../coap/backend_discovery_srp.md](../coap/backend_discovery_srp.md) | SRP/DNS-SD discovery, OpenThread DNS client API |
| [../installation.md](../installation.md) | Setup nhanh sysctl / route cho backend Linux |
