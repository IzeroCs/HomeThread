# Backend gọi OTBR qua D-Bus (cách B)

OTBR (otbr-agent) chạy D-Bus **trong container**; socket được đưa ra qua **volume chung** để backend container có thể kết nối.

## Đã triển khai

### Container (docker-compose.yml)

- Volume `otbr-dbus` mount vào service `otbr` tại `/run/dbus`. otbr-agent tạo socket tại `/run/dbus/system_bus_socket` → nằm trong volume.
- Khi bật backend container: mount cùng volume `otbr-dbus:/run/dbus` và set env `DBUS_SYSTEM_BUS_ADDRESS=unix:path=/run/dbus/system_bus_socket`.

### Backend

- **backend/src/otbr/OtbrDbusClient.ts**: Client D-Bus (thư viện `dbus-next`), kết nối system bus (address từ env `DBUS_SYSTEM_BUS_ADDRESS` hoặc mặc định `/run/dbus/system_bus_socket`). Service name: `io.openthread.BorderRouter.<interface>` (mặc định `wpan0` từ env `OT_THREAD_IF`), object path `/<interface>`, interface `io.openthread.BorderRouter`.
- **D-Bus signals**: Subscribe `org.freedesktop.DBus.Properties` signal **PropertiesChanged** trên object OTBR; khi state/property thay đổi otbr-agent emit signal → backend gọi pull state/dataset một lần (push, không cần poll 5s). Nếu otbr-agent không emit signal thì fallback poll **30s** chỉ để kiểm tra OTBR còn sống.
- **OtbrManager** dùng OtbrDbusClient: subscribe PropertiesChanged → pull state/dataset; fallback interval 30s. State/dataset cập nhật khi nhận signal hoặc mỗi 30s.
- **WebSocketServer / Frontend**: BR Connection → màn "OTBR (D-Bus)" + trạng thái + Test connection. Không còn form host/port hay BrConnectionConfigService; CONFIG_CURRENT emit null.

### Chạy backend với OTBR

- **Backend trong Docker (khuyến nghị):** Compose có service backend mount volume `otbr-dbus:/run/dbus` (cùng với service OTBR) và env `DBUS_SYSTEM_BUS_ADDRESS=unix:path=/run/dbus/system_bus_socket`. Backend và otbr-agent dùng chung D-Bus trong volume.
- **Backend trên host:** Đã thử mount D-Bus của host (`/run/dbus`) vào container OTBR và set `DBUS_SYSTEM_BUS_ADDRESS` — otbr-agent **không đăng ký** trên system bus của host (`dbus-send --system ListNames` trên host không thấy `io.openthread.BorderRouter.wpan0`). Nguyên nhân khả dĩ: dbus-daemon trên host từ chối kết nối từ process trong container. Để dev không build lại mỗi lần: chạy backend trong Docker và mount source backend vào container.

## API D-Bus otbr-agent

Tra cứu [ot-br-posix D-Bus](https://github.com/openthread/ot-br-posix) (namespace `otbr::DBus`, `ThreadApiDBus`). Method/property có thể khác tên tùy phiên bản; OtbrDbusClient dùng tên phổ biến (State/GetDeviceRole, GetActiveDataset, Attach, Detach, PermitUnsecureJoin, AddJoiner, GetRouterTable, GetChildTable, GetJoinerTable, SetActiveDataset).

## Lưu ý

- Image `openthread/border-router` có thể dùng `/var/run/dbus` thay vì `/run/dbus`. Nếu container OTBR không tạo socket trong volume, thử đổi mount sang `otbr-dbus:/var/run/dbus` và backend dùng `unix:path=/var/run/dbus/system_bus_socket`.
