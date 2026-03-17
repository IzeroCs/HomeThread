# Backend Discovery (SRP / DNS-SD) — Thread-Node

Cơ chế Thread-Node tự tìm địa chỉ Backend (Dashboard) qua SRP/DNS-SD thông qua Border Router.

---

## 1. Tổng quan

Thread-Node dùng **OpenThread DNS client** để:

1. Browse service `_dashboard._udp.default.service.arpa` trên mesh.
2. Lấy SRV (hostname + port) và resolve AAAA → IPv6.
3. Cache kết quả vào NVS (`namespace: backend`); fallback cấu hình tĩnh nếu SRP không trả kết quả.

Query DNS đi qua Thread mesh tới Border Router. Thread-Node **không** dùng lwIP DNS hay forward ra 8.8.8.8.

OpenThread core **không** forward query `*.default.svc.arpa` ra upstream (`ShouldForwardToUpstream()` loại bỏ `kDefaultDomainName`). Nếu log thấy "Forward DNS query to v4 (8.8.8.8)", nguồn là layer khác (lwIP, NAT64, custom resolver) — không phải từ OpenThread core.

---

## 2. Cấu hình Thread-Node

- **`CONFIG_OPENTHREAD_DNS_CLIENT=y`** trong sdkconfig. Macro `OPENTHREAD_CONFIG_DNS_CLIENT_ENABLE` do ESP-IDF 5.5.3 define trong `openthread-core-esp32x-ftd-config.h` — **không** thêm vào `openthread_custom_config.h` (gây redefinition).
- **API `otDnsServiceInfo` (ESP-IDF 5.5.3):** Struct dùng `mHostNameBuffer` (char*) và `mHostNameBufferSize` (uint16_t). Caller phải cung cấp buffer và gán vào `service_info` trước khi gọi `otDnsBrowseResponseGetServiceInfo`; sau đó dùng `service_info.mHostNameBuffer` khi gọi `otDnsBrowseResponseGetHostAddress`.

---

## 3. Khi nào discovery trả NotFound / Timeout

- Trên mesh chưa có service `_dashboard._udp` được advertise qua SRP.
- Border Router chưa đăng ký service qua SRP client, hoặc SRP server từ chối (sai lease/key-lease, lỗi ProcessAdditionalSection, SIG(0)).

---

## 4. Phía Border Router — đăng ký service

1. **SRP client lease:** Gọi `otSrpClientSetLeaseInterval(instance, 60)` và `otSrpClientSetKeyLeaseInterval(instance, 120)` trước khi add service; `mLease = 60`, `mKeyLease = 120` (key lease ≥ lease).
2. **Buffer tĩnh (quan trọng):** OpenThread SRP client **không copy** hostname hay địa chỉ — chỉ lưu con trỏ. BR khi xử lý `CMD_SRP_REGISTER` phải copy hostname vào **buffer tĩnh** (`s_srp_hostname`) và 16 byte IPv6 vào **buffer tĩnh** (`s_srp_backend_addr`) trước khi gọi `otSrpClientSetHostName/SetHostAddresses`. Buffer stack → dangling pointer → địa chỉ IPv6 rác trên SRP server.
3. **SRP server:** Đảm bảo không từ chối RCODE Refused. Kiểm tra `ot srp server host` và `ot srp server service` trên BR CLI.

Backend gửi `CMD_SRP_REGISTER` (0x44) qua frame protocol TCP. DATA: `hostname_len(1)` + `hostname(N)` + `backend_ipv6(16)` + `port(2 BE)`. Chi tiết frame: [../protocol/usb_cdc_frame_structure.md](../protocol/usb_cdc_frame_structure.md).

---

## 5. Re-discovery và cập nhật endpoint

**Cache TTL:** `thread_discovery_cfg_t.cache_ttl_sec` — khi cache hết TTL, `thread_discovery_get_endpoint()` thực hiện SRP discovery lại thay vì trả cache cũ.

**Task re-discovery (thread_node):** Task `thread_disc` gọi `thread_discovery_get_endpoint(&ep, false)` với delay:
- **10s** khi chưa có backend (`!s_backend_ep_valid`)
- **60s** khi đã có (tránh đợi 60s lần đầu)

Nếu endpoint (addr + port) khác `s_backend_ep` → cập nhật và log "Backend endpoint updated". Backend đổi IPv6 và gửi lại `CMD_SRP_REGISTER` → tối đa một chu kỳ (10s hoặc 60s) Thread-Node có endpoint mới.

---

## 6. Restart detection (ping timestamp)

Thread-Node gửi **GET /device/ping?mac=** định kỳ. Backend trả 2.05 Content, body 4 byte = timestamp uint32 LE (giá trị lúc server khởi động). Node lưu timestamp; nếu response lần sau có **timestamp khác** → backend đã restart → gửi lại **POST /device/register/info** + **POST /device/register/entity**.

---

## 7. CoAP ResponseTimeout sau khi discovery thành công

Nếu discovery SRP thành công nhưng CoAP ping/register báo ResponseTimeout, nguyên nhân là **routing/forwarding**, không phải SRP. Xem: [../architecture/real_br_integration.md — §5.1](../architecture/real_br_integration.md).

---

## 8. Tài liệu liên quan

| Tài liệu | Nội dung |
|----------|----------|
| [device_payload_spec.md](device_payload_spec.md) | CoAP endpoints, CBOR payload, DB schema, flow đăng ký |
| [../architecture/real_br_integration.md](../architecture/real_br_integration.md) | Kiến trúc BR, troubleshooting CoAP ResponseTimeout, routing |
| [../protocol/usb_cdc_frame_structure.md](../protocol/usb_cdc_frame_structure.md) | Frame protocol, CMD_SRP_REGISTER (0x44) |
