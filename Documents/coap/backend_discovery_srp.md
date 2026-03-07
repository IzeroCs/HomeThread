# Backend Discovery (SRP / DNS-SD) — Thread-Node

Tài liệu ngắn về cơ chế discovery backend (Dashboard) trên Thread-Node qua SRP/DNS-SD và phụ thuộc vào Border Router.

## Tổng quan

Thread-Node dùng **OpenThread DNS client** (`otDnsClientBrowse`, `otDnsBrowseResponseGetServiceInfo`, `otDnsBrowseResponseGetHostAddress`) để:

1. Browse service `_dashboard._udp.default.service.arpa` trên mesh.
2. Lấy thông tin SRV (hostname + port) và resolve AAAA → IPv6.
3. Cache kết quả vào NVS (namespace `backend`) và fallback cấu hình tĩnh nếu SRP không trả kết quả.

Query DNS **đi qua Thread mesh** tới Border Router; Thread-Node **không** dùng lwIP DNS hay forward ra 8.8.8.8.

## Cấu hình Thread-Node

- **CONFIG_OPENTHREAD_DNS_CLIENT=y** trong sdkconfig (hoặc sdkconfig.defaults). Macro `OPENTHREAD_CONFIG_DNS_CLIENT_ENABLE` do ESP-IDF 5.5.3 define trong `openthread-core-esp32x-ftd-config.h` từ Kconfig; **không** thêm define này vào `openthread_custom_config.h` (gây redefinition).
- **API otDnsServiceInfo (ESP-IDF 5.5.3):** Struct dùng `mHostNameBuffer` (char*) và `mHostNameBufferSize` (uint16_t). Caller phải cung cấp buffer và gán vào `service_info` trước khi gọi `otDnsBrowseResponseGetServiceInfo`; sau đó dùng `service_info.mHostNameBuffer` khi gọi `otDnsBrowseResponseGetHostAddress`.

## Khi nào discovery trả NotFound / Timeout

- **Trên mesh chưa có service** `_dashboard._udp` (hoặc domain tương đương) được advertise qua SRP.
- **Border Router (Thread-Host)** chưa đăng ký service qua SRP client (`otSrpClient*`), hoặc SRP server trên BR từ chối (ví dụ lease/key-lease không đúng, lỗi ProcessAdditionalSection, SIG(0)).

OpenThread core **không** forward query cho `*.default.svc.arpa` ra upstream (trong `dnssd_server.cpp`, `ShouldForwardToUpstream()` loại bỏ `kDefaultDomainName = "default.service.arpa."`). Vì vậy nếu log xuất hiện kiểu "Forward DNS query to v4" (8.8.8.8), nguồn không phải từ OpenThread core mà có thể từ layer khác (lwIP, NAT64, hoặc custom resolver) trên BR.

## Phía Border Router (gợi ý)

Để Thread-Node discovery được backend:

1. **SRP client trên BR:** Gọi `otSrpClientSetLeaseInterval(instance, 60)` và `otSrpClientSetKeyLeaseInterval(instance, 120)` trước khi add service; service struct: `mLease = 60`, `mKeyLease = 120` (key lease ≥ lease). Đăng ký service `_dashboard._udp` với host và port phù hợp.
2. **Hostname và IPv6 lifetime:** OpenThread SRP client **không copy** hostname hay địa chỉ — chỉ lưu con trỏ. BR (Thread-Host) khi xử lý CMD_SRP_REGISTER phải copy hostname vào **buffer tĩnh** (`s_srp_hostname`) và 16 byte AAAA vào **buffer tĩnh** (`s_srp_backend_addr`) rồi mới gọi `otSrpClientSetHostName` / `otSrpClientSetHostAddresses`; nếu dùng buffer trên stack thì sau khi handler return con trỏ thành dangling → mojibake hoặc host rỗng, và địa chỉ IPv6 trên SRP server / discovery sai (Thread-Node nhận địa chỉ rác).
3. **SRP server:** Đảm bảo không từ chối với RCODE Refused (vd. do lease/format). Nếu vẫn lỗi "Failed to process DNS Additional section", kiểm tra SIG(0) và zone/domain; có thể bật log debug SRP server trên OpenThread.
4. **Không forward** query `*.default.svc.arpa` ra upstream — xử lý local bởi SRP/DNS-SD trên Thread.

Sau khi BR đăng ký thành công, Thread-Node sẽ nhận response thay vì NotFound/Timeout. thread_discovery log "Discovered backend via SRP" ở LOGD; thread_node log "Backend discovered: [addr]:port" ở INFO (chỉ 1 lần khi có IP hoặc khi IP đổi).

## Nhận biết backend restart (cùng IPv6/port)

Thread-Node gửi **GET /device/ping** định kỳ. Backend trả **2.05 Content** với payload 4 byte = timestamp uint32 LE (giá trị lúc server khởi động). Node lưu timestamp; nếu response lần sau có **timestamp khác** → backend đã restart → callback trigger gửi lại **POST /device/register**. Chi tiết: [thread_node_coap.md](thread_node_coap.md).

## Nhận biết backend đổi IPv6 (không cần reboot)

Kết hợp hai cơ chế:

1. **Cache TTL (`thread_discovery_cfg_t.cache_ttl_sec`):** Khi `thread_discovery_get_endpoint(out, false)` và có cache SRP trong NVS, nếu `cache_ttl_sec > 0` và `(now - cache_ts) > cache_ttl_sec` thì coi cache hết hạn và thực hiện SRP discovery lại (không trả cache cũ). Caller gọi get_endpoint định kỳ sẽ nhận endpoint mới khi cache hết TTL.

2. **Task re-discovery (thread_node):** Task `thread_disc` gọi `thread_discovery_get_endpoint(&ep, false)` với delay **10s** khi chưa có backend (`!s_backend_ep_valid`), **60s** khi đã có — tránh đợi 60s mới retry lần đầu. Nếu endpoint (addr + port) khác `s_backend_ep` thì cập nhật và log **"Backend discovered"** (lần đầu) hoặc **"Backend endpoint updated"** (khi đổi). Log backend IP chỉ 1 lần khi có IP và khi IP thay đổi (thread_node log INFO); thread_discovery khi trả cache/static/SRP dùng LOGD. Backend đổi IPv6 và gửi lại CMD_SRP_REGISTER lên BR thì tối đa sau một chu kỳ (10s hoặc 60s) Thread-Node có endpoint mới.

## CoAP ResponseTimeout (sau khi discovery thành công)

Nếu discovery SRP thành công (node có backend IP/port) nhưng **CoAP ping/register báo ResponseTimeout**, nguyên nhân thường là **response từ backend không tới node** (routing/forwarding), không phải SRP. Cần kiểm tra route trên host backend tới prefix Thread qua BR và BR forward vào mesh. Chi tiết: [thread_node_coap.md](thread_node_coap.md#troubleshooting-responsetimeout).

## Tài liệu liên quan

- [border_router_coap_server.md](border_router_coap_server.md) — Backend device registry (BR không còn chạy CoAP server; child gửi thẳng backend).
- [thread_node_coap.md](thread_node_coap.md) — CoAP paths, GET ping, troubleshooting ResponseTimeout.
- [real_br_integration.md](../architecture/real_br_integration.md) — Kiến trúc BR, troubleshooting CoAP response routing.
- Memory-bank (Thread-Host): `progress.md`, `techContext.md`, `activeContext.md`.
