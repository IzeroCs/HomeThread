# Installation / Setup — Backend Linux (IPv6 routing)

Các bước setup để Backend (Linux) nhận route IPv6 tới Thread prefix từ Border Router.

> Kiến trúc đầy đủ: [architecture/real_br_integration.md](architecture/real_br_integration.md).

---

## 1. Nhận route IPv6 tự động qua RA/RIO (khuyến nghị)

Set **per-interface** (thay `<IFACE>` bằng interface nối cùng LAN với BR, vd. `enp8s0`):

```bash
sudo sysctl -w net.ipv6.conf.<IFACE>.accept_ra=2
sudo sysctl -w net.ipv6.conf.<IFACE>.accept_ra_rt_info_max_plen=128
```

> `net.ipv6.conf.all.*` chỉ là default cho interface mới — không áp dụng ngược cho interface đã tồn tại.

Xin BR gửi RA sớm (gói `ndisc6`):

```bash
sudo rdisc6 -1 <IFACE>
```

### Kiểm tra

```bash
ip -6 route
ip -6 route get <IPv6_ULA_cua_node>
```

---

## 2. Add route tay (nếu không dùng RA/RIO)

```bash
sudo ip -6 route add <THREAD_PREFIX>/64 via <BR_LINKLOCAL>%<IFACE> dev <IFACE>
```

Ví dụ:

```bash
sudo ip -6 route add fdb8:3795:e886:1::/64 via fe80::fc01:2cff:fecc:5e04%enp8s0 dev enp8s0
```

> Route tay mất sau reboot và sau factory reset BR (prefix/link-local có thể đổi).
