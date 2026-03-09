# Installation / Setup Notes — Thread-Host (BR) + Backend (Linux)

Tài liệu này gom các bước setup cần thiết để chạy hệ thống **BR thật**:
- Dashboard/Backend kết nối BR qua **TCP frame** (BR listen port, mặc định 5000).
- Thread-Node gửi request **trực tiếp** tới Backend qua IPv6; BR chỉ route.

## 1) Backend (Linux) — nhận route IPv6 tới Thread prefix (RA/RIO)

Để backend (host Linux) tự học route tới **Thread OMR prefix** qua Router Advertisement (RIO) từ BR, set **per-interface** (thay `<IFACE>` bằng interface nối cùng LAN với BR, vd. `enp8s0`, `eth0`):

```bash
sudo sysctl -w net.ipv6.conf.<IFACE>.accept_ra=2
sudo sysctl -w net.ipv6.conf.<IFACE>.accept_ra_rt_info_max_plen=128
```

Tuỳ chọn (nếu đã có `ndisc6`) để xin BR gửi RA sớm:

```bash
sudo rdisc6 -1 <IFACE>
```

### Kiểm tra

```bash
ip -6 route
ip -6 route get <IPv6_ULA_cua_node>
```

## 2) Backend (Linux) — add route tay (nếu không dùng RA/RIO)

Nếu cần set route thủ công (vd. router không forward RA đúng), add route tới Thread prefix via BR link-local trên interface backbone:

```bash
sudo ip -6 route add <THREAD_PREFIX>/64 via <BR_LINKLOCAL>%<IFACE> dev <IFACE>
```

Ví dụ:

```bash
sudo ip -6 route add fdb8:3795:e886:1::/64 via fe80::fc01:2cff:fecc:5e04%enp8s0 dev enp8s0
```

Ghi chú: với địa chỉ link-local `fe80::...` thường cần zone ID dạng `%<IFACE>`.

