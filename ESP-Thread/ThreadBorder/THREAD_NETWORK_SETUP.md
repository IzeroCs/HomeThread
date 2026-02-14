# Hướng dẫn cấu hình Thread Network trên ESP32-H2

## Cách 1: Cấu hình thủ công qua CLI (Mặc định)

### Bước 1: Flash và mở monitor
```bash
idf.py -p /dev/ttyUSB0 flash monitor
```

### Bước 2: Form Thread Network (Làm Leader)

Sau khi boot, bạn sẽ thấy prompt `esp32h2>`. Gõ các lệnh sau:

```bash
# Reset về trạng thái ban đầu (nếu cần)
esp32h2> ot factoryreset
# Device sẽ reboot

# Tạo dataset mới
esp32h2> ot dataset init new
Done

# Commit dataset vào active
esp32h2> ot dataset commit active
Done

# Bật interface
esp32h2> ot ifconfig up
Done

# Start Thread network
esp32h2> ot thread start
Done

# Đợi vài giây, sau đó kiểm tra trạng thái
esp32h2> ot state
leader
Done

# Xem IPv6 addresses
esp32h2> ot ipaddr
fdde:ad00:beef:0:0:ff:fe00:fc00
fdde:ad00:beef:0:0:ff:fe00:8000
fdde:ad00:beef:0:xxxx:xxxx:xxxx:xxxx
fe80:0:0:0:xxxx:xxxx:xxxx:xxxx
Done
```

### Bước 3: Lấy Active Dataset để share với nodes khác

```bash
# Lấy dataset dạng hex
esp32h2> ot dataset active -x
0e080000000000010000000300000f35060004001fffe00208dead00beef00cafe0708fddead00beef00000510c0e5c0e5c0e5c0e5c0e5c0e5c0e5c0e50c0402a0f7f8
Done

# Hoặc lấy từng thông tin riêng lẻ
esp32h2> ot dataset active
Active Timestamp: 1
Channel: 15
Channel Mask: 0x07fff800
Ext PAN ID: dead00beef00cafe
Mesh Local Prefix: fdde:ad00:beef:0::/64
Network Key: c0e5c0e5c0e5c0e5c0e5c0e5c0e5c0e5
Network Name: OpenThread-ESP
PAN ID: 0x1234
PSKc: 104810e2315100afd6bc9215a6bfac53
Done
```

### Bước 4: Join Thread Network (Trên node khác)

Trên ESP32-H2 khác, sau khi flash firmware tương tự:

```bash
esp32h2> ot dataset set active 0e080000000000010000000300000f35060004001fffe00208dead00beef00cafe0708fddead00beef00000510c0e5c0e5c0e5c0e5c0e5c0e5c0e5c0e50c0402a0f7f8
Done

esp32h2> ot ifconfig up
Done

esp32h2> ot thread start
Done

# Kiểm tra trạng thái
esp32h2> ot state
child  # hoặc router
Done
```

## Cách 2: Auto-start (Tự động form network khi boot)

Nếu muốn tự động form network khi boot, thêm vào `sdkconfig.defaults`:

```
CONFIG_OPENTHREAD_NETWORK_AUTO_START=y
```

Và config các thông số mạng trong `menuconfig`:
- Component config → OpenThread → Thread Operational Dataset
  - Network Name
  - Channel
  - PAN ID
  - Network Key
  - v.v.

## Các lệnh CLI hữu ích

### Kiểm tra trạng thái
```bash
ot state              # Trạng thái Thread (detached/child/router/leader)
ot ipaddr             # IPv6 addresses
ot eui64              # EUI64 address
ot extaddr            # Extended address
```

### Quản lý network
```bash
ot thread start       # Start Thread network
ot thread stop        # Stop Thread network
ot factoryreset       # Reset về factory default
```

### Xem thông tin network
```bash
ot networkname        # Tên network
ot channel            # Channel hiện tại
ot panid              # PAN ID
ot router table       # Router table
ot child table        # Child nodes
```

### Giao tiếp
```bash
ot ping <ipv6>        # Ping một node
ot udp open           # Mở UDP socket
ot udp send <ipv6> <port> <data>
```

## Troubleshooting

### Không join được network
- Kiểm tra channel có đúng không: `ot channel`
- Kiểm tra dataset có đúng không: `ot dataset active`
- Đảm bảo cả 2 devices ở gần nhau (trong phạm vi radio)

### Không thấy child nodes
- Đợi vài giây để mesh ổn định
- Kiểm tra `ot child table`
- Kiểm tra `ot router table` để xem routing

### Reset network
```bash
ot factoryreset
# Device sẽ reboot, sau đó config lại từ đầu
```
