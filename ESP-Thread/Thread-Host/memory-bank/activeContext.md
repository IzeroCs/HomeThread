# Active Context — Thread-Host

_Cập nhật: 2026-03-06_

## Công việc hiện tại

Backhaul Ethernet W5500 đã có IPv6 trên backbone (link-local + ULA/global khi router gửi RA). SRP server + SRP client (CMD_SRP_REGISTER) đã bật: backend đăng ký `_dashboard._udp` qua frame TCP; child discovery service qua SRP. Child↔backend: ping/CoAP từ child tới IPv6 backend qua BR. BR không còn CoAP client (Leader Control GET `/network/stop` đã gỡ trong 0.17.0).

### Backend reply → Thread-Node (route trên host)
- Node gửi tới backend OK; **reply từ backend về Node** cần **route** trên máy backend: prefix Thread (vd. fdb8:.../fdd7:...) **via BR** (link-local BR trên backbone). BR gửi RA với Route Information (RIO) nhưng **router lifetime = 0** → nhiều kernel Linux không cài route từ RIO. **Cách làm:** Thêm route tay trên host: `ip -6 route add <PREFIX>::/64 via <BR_linklocal> dev <iface>`. Route mất sau reboot; có thể script/cron từ RA hoặc persistent. Sau **factory reset BR** prefix và có thể cả BR link-local đổi → cần cập nhật route.
- **Dashboard-Thread Docker:** Backend chạy container với `network_mode: host` (dùng chung route host), bind mount `./backend/data` (DB), mount `/etc/resolv.conf` và `/etc/nsswitch.conf` (resolve mDNS). Trong Docker mDNS (Thread-Host.local) thường không ổn định → default BR connection đổi thành **192.168.31.3:5000** (migration) để dùng IP thay vì hostname.

## Thay đổi gần đây

### SRP (Service Registration Protocol) — Đã implement
- **SRP server:** Bật trong `br_custom_config.h` (`OPENTHREAD_CONFIG_SRP_SERVER_ENABLE 1`); `br_main.c` gọi `otSrpServerSetEnabled(instance, true)` sau border router init (khi có backbone). SRP server chỉ lắng nghe trên giao diện Thread (mesh), **không** lắng nghe trên backbone: backend **không** gửi UDP tới BR:53535 được.
- **SRP client trên BR:** Backend gửi **CMD_SRP_REGISTER (0x44)** qua TCP (frame). DATA: hostname_len(1) + hostname(N) + backend_ipv6(16) + port(2 BE). BR dùng SRP client (auto-start mode) đăng ký host + service `_dashboard._udp` (instance "dashboard") lên chính SRP server của BR; child discovery `_dashboard._udp` qua SRP/DNS. Build: `CONFIG_OPENTHREAD_SRP_CLIENT=y`, `CONFIG_OPENTHREAD_SRP_CLIENT_MAX_SERVICES=5` trong `sdkconfig.defaults`.
- **Hostname lifetime (đã xử lý):** OpenThread SRP client **không copy** hostname — chỉ lưu con trỏ (`SetName(aName)` → `mName = aName`). Nếu truyền buffer stack thì sau khi handler return con trỏ thành dangling; SRP client gửi DNS update **bất đồng bộ** sau đó → đọc rác → mojibake hoặc host rỗng. **Fix:** Buffer tĩnh `s_srp_hostname[SRP_HOSTNAME_MAX_LEN+1]` trong `communicate_command.c`; sau khi parse/validate hostname từ payload, copy vào `s_srp_hostname` rồi gọi `otSrpClientSetHostName(instance, s_srp_hostname)`. Hostname sau dài/ngắn hơn cái trước vẫn an toàn vì luôn copy kèm `\0`.
- **IPv6 address lifetime (đã xử lý):** OT SRP client cũng **không copy** địa chỉ — chỉ lưu con trỏ tới `otIp6Address`. Dùng biến stack `backend_addr` rồi gọi `otSrpClientSetHostAddresses(instance, &backend_addr, 1)` → sau khi handler return con trỏ dangling → SRP server lưu địa chỉ rác, Thread-Node discovery nhận sai IPv6. **Fix:** Buffer tĩnh `s_srp_backend_addr`; copy 16 byte payload vào đó rồi gọi `otSrpClientSetHostAddresses(instance, &s_srp_backend_addr, 1)`.
- **Lease / key lease:** Service struct `mLease=60`, `mKeyLease=120`; gọi `otSrpClientSetLeaseInterval(instance, 60)` và `otSrpClientSetKeyLeaseInterval(instance, 120)` trước khi add service (server yêu cầu key lease ≥ lease).
- **Không gọi `otSrpClientStart(instance, NULL)`** — API dereference server addr → LoadProhibited crash; chỉ dùng auto-start sau khi set host + address + add service.
- **Log khi đăng ký:** Handler log `SRP register from backend: host=... port=... AAAA=...` và `SRP register OK: _dashboard._udp -> ... (ACK sent)`.
- **Nhiều lần gửi CMD_SRP_REGISTER:** Mỗi lần clear host+services rồi đăng ký lại → một bản ghi mới nhất (dashboard restart gửi lại là OK).
- **SRP CLI (ot srp server / ot srp client):** Cần bật **CONFIG_OPENTHREAD_HEADER_CUSTOM=y** và **CONFIG_OPENTHREAD_CUSTOM_HEADER_PATH="include"** (file `br_custom_config.h` trong `include/`) để OpenThread build include custom header → lệnh `srp server` / `srp client` được biên dịch. Trên serial BR: **`ot srp server host`** và **`ot srp server service`** để kiểm tra host/service đã đăng ký (vd. `dashboard.default.service.arpa.`, `dashboard._dashboard._udp.default.service.arpa.`).

### Ethernet IPv6 (Preferred: link-local) — Đã implement
- **Vấn đề:** Gọi `esp_netif_create_ip6_linklocal(s_eth_netif)` ngay sau `esp_netif_attach` trả `ESP_FAIL` (netif chưa link up).
- **Cách làm theo esp-thread-br / protocol_examples_common:** Trong `eth_event_handler`, khi `ETHERNET_EVENT_CONNECTED` mới gọi `esp_netif_create_ip6_linklocal(netif)`; đăng ký handler với `s_eth_netif` làm `arg`.
- Kết quả: BR có ít nhất link-local `fe80::` trên W5500; nếu MikroTik gửi RA thì có thêm ULA/global. Log: `Ethernet link up`, `Ethernet got IPv6: ...`; sau BR init: `backbone global IPv6` / `backbone link-local IPv6` trong `br_main.c`.

### Backhaul: chỉ LAN
- Backhaul chỉ Ethernet W5500 (`CONFIG_BR_ETH_W5500_ENABLE=y`). Không Wi‑Fi; không có wifi_sta. Nếu Ethernet timeout thì không backbone.

### CMD_IP_ADDR và Dashboard reply ACK
- BR gửi ACK + 16 byte Leader RLOC; spec yêu cầu backend gửi lại **một ACK trống cùng frameId** để BR dừng retry. Dashboard-Thread hiện chỉ gọi `replyAck(ipRes.frameId)` trong `CommunicateManager.pullState()` khi `stateChangedOrFirst` → các lần fetch IP_ADDR khác (vd. fetchOtConfig, refresh) không gửi reply ACK → BR retry mãi. **Khuyến nghị:** Trong Dashboard-Thread, `CommandManager.handle()` khi nhận ACK của CMD_IP_ADDR (frameId trong ipAddrFrameIds, data.length === 16) tự gọi `replyAck(frame.frameId)` để mọi nguồn gọi fetchIpAddr đều trả ACK cho BR.

### CMD_COMMISSIONER_JOINER (0x43) — Đã implement
- Handler trong `communicate_command.c`: parse EUI64(8) + PSKd_len(1) + PSKd(1–32) + Timeout(4 BE)
- Tự động start commissioner nếu chưa active, wait ACTIVE tối đa 1s (poll 200ms)
- EUI64 all-zero = wildcard → `NULL` vào `otCommissionerAddJoiner`
- Log EUI64 format `xx:xx:xx:xx:xx:xx:xx:xx` trước khi gọi OT

### Phase 1 cleanup (BR thật) — Đã thực hiện
- Đã xóa Device Registry (CoAP server /device/register|update|ping) và CMD_DATA push/wait-ACK. BR không còn forward child→backend; chuyển hướng sang BR thật (child gửi thẳng backend qua IP). Frame protocol chỉ dùng cho quản lý BR (state, dataset, Commissioner…).

### Frame log suppression — Đã implement
- `CMD_STATE`, `CMD_ROUTER_TABLE`, `CMD_CHILD_TABLE`, `CMD_JOINER_TABLE` và ACK tương ứng không log ở **INFO** (reduce noise); log ở **DEBUG**.

### RX/TX logging — Đã bổ sung
- **Frame RX/TX** (communicate.c): CMD noisy và ACK tương ứng log bằng `ESP_LOGD`; các CMD khác log `ESP_LOGI`. Để xem mọi frame: set log level **DEBUG** cho tag `communicate`.
- **Transport TCP** (transport_tcp.c): Mỗi lần `recv`/`send` log `tcp rx N bytes` / `tcp tx N bytes` ở **DEBUG**. Set tag `transport_tcp` sang DEBUG để xem byte stream.
- Cách bật: menuconfig → Log output → Set log level for component `communicate`, `transport_tcp` = Debug; hoặc runtime `esp_log_level_set("communicate", ESP_LOG_DEBUG)` và tương tự cho `transport_tcp`.

### LED status — Fix nháy đỏ khi joiner join
- **Hiện tượng:** Sau khi commissioner joiner và node join, LED nháy đỏ (disabled) rồi xanh (Leader). BR vẫn Leader.
- **Nguyên nhân:** Task LED poll `otThreadGetDeviceRole()` với lock 200ms; khi OT bận (MLE/child table lúc join) lock timeout → code mặc định role = DISABLED → đỏ.
- **Fix:** Khi không lấy được lock: dùng **last-known role** (`s_last_role` / `s_role_valid`) thay vì mặc định DISABLED. Trong lúc joiner join, LED giữ màu Leader (xanh) thay vì nháy đỏ.

### Leader Control Client removed (0.17.0) — 2026-03-06
- Đã loại bỏ CoAP Leader Control Client (GET `/network/stop`) và toàn bộ code/docs liên quan trên Thread-Host. BR không còn gửi CoAP request tới Leader; chỉ quản lý qua frame protocol (state, dataset, Commissioner, SRP register, …).

### Memory Bank — Vừa tạo
- `.cursor/rules/thread-host-memory-bank.mdc` — entry point rule
- `memory-bank/` — 6 core files theo chuẩn Memory Bank

### Docs migration
- Tất cả docs đã chuyển sang `HomeThread/Documents/` với symlink `docs/` tại project root
- Tất cả link trong `README.md` và `TODO.md` đã cập nhật sang `../../Documents/...`

## Decisions đang active

- **Factory reset:** Dùng raw `esp_partition_erase_range` + KHÔNG stop OT trước (để tránh OT write-back dataset)
- **Frame transport:** Chỉ TCP (BR listen port); đã bỏ USB/UART cho kênh BR↔dashboard
- **Backhaul:** Chỉ Ethernet W5500 khi bật (`CONFIG_BR_ETH_W5500_ENABLE`); không Wi‑Fi
- **Stack monitor:** Task `stk_mon` 3072 bytes, log mỗi 30s; `main` task luôn hiện "used full" sau `app_main()` exit — bình thường
- **Backbone LAN:** Khi router (vd. MikroTik) gửi RA và BR tạo được IPv6 link-local (trên ETHERNET_EVENT_CONNECTED), BR có IPv6 backbone → ít log ND/RS fail. Nếu backbone không có RA thì vẫn có thể thấy `Failed to send ND6 message` / `RsSender: Failed to send RS`; khi đó BR vẫn có link-local `fe80::` nếu đã gọi `esp_netif_create_ip6_linklocal` đúng lúc.
- **Backend ↔ child:** Mô hình ưu tiên là backend bật IPv6 (ít nhất link-local/ULA trên máy backend, không phụ thuộc ISP) để child nói chuyện trực tiếp bằng IPv6 qua BR. Nếu backend chỉ IPv4 thì cần NAT64 hoặc proxy ở BR (chưa implement, chỉ ghi nhận như hướng mở rộng).

## Bước tiếp theo

1. **Dashboard-Thread:** Sửa reply ACK cho CMD_IP_ADDR — trong `CommandManager.handle()` khi nhận ACK (frameId ∈ ipAddrFrameIds, data.length === 16) gọi `replyAck(frame.frameId)` để BR không retry vô hạn.
2. **Test child↔backend:** Trên child (hoặc ot-cli join mạng) chạy `ping <IPv6_backend>` hoặc CoAP/HTTP tới backend; BR chỉ route. Sanity check: từ backend ping IPv6 BR; từ BR CLI ping IPv6 backend.
3. **Docs Thread-Node / Dashboard-Thread:** Cập nhật hoặc tạo doc (child gửi thẳng backend qua IP, backend listen IP)
4. **CMD_SYS_HEALTH:** Handler gửi stack HWM + heap size cho backend monitor
5. **Auto-flash RCP:** Tính năng flash firmware RCP khi boot (xem TODO.md)

## Known Issues đang theo dõi

- `main` task hiện "used full" trong stack monitor — đây là artifact của task đã exit, không phải overflow
- **Dashboard-Thread:** IP_ADDR response no ACK retry — backend chỉ gửi reply ACK khi `stateChangedOrFirst` trong pullState; các lần fetch IP_ADDR khác không reply → BR retry. Fix: gọi replyAck trong `CommandManager.handle()` cho mọi ACK CMD_IP_ADDR (16 byte).
- **(Đã xử lý) SRP server Refused:** Trước đây server trả RCODE 5 (Refused) do key lease phải ≥ lease; đã sửa bằng `mKeyLease=120`, `mLease=60` và gọi `otSrpClientSetLeaseInterval`/`SetKeyLeaseInterval` trước add service — đăng ký thành công, kiểm tra bằng `ot srp server host` / `ot srp server service`.
- **(Đã xử lý) SRP hostname mojibake/rỗng:** Khi dùng buffer stack cho hostname, SRP client giữ con trỏ dangling → DNS update bất đồng bộ đọc rác. Đã sửa bằng buffer tĩnh `s_srp_hostname` và copy hostname vào đó trước khi gọi `otSrpClientSetHostName`.
- **(Đã xử lý) SRP địa chỉ IPv6 sai trên SRP server / discovery:** Tương tự hostname, dùng stack cho `otIp6Address` → dangling → `ot srp server host` và Thread-Node discovery thấy địa chỉ rác. Đã sửa bằng buffer tĩnh `s_srp_backend_addr` và copy 16 byte payload vào đó trước khi gọi `otSrpClientSetHostAddresses`.
- **(Đã xử lý) Leader Control Client:** Code và docs CoAP GET `/network/stop` đã gỡ khỏi Thread-Host (0.17.0); BR không còn CoAP client.
