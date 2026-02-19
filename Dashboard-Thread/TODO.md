# TODO – Điều khiển OpenThread qua UART (ESP32-H2, frame protocol)

## Stack & cấu trúc (đã chọn)

- **Backend**: Node.js + TypeScript (SerialPort, Socket.IO). Monorepo: `backend/`.
- **Frontend**: TypeScript + React + Vite. Monorepo: `frontend/`.
- **Chung 1 project**: npm workspaces tại root; `npm run dev` chạy đồng thời BE + FE.

## Frame protocol & kiến trúc (đã làm)

- [x] **Bỏ CLI**: Đã xóa hoàn toàn CLI (CLIWrapper, cli:command, commandPrefix bắt buộc). Giao tiếp chỉ còn frame USB CDC.
- [x] **Thư mục `communicate/`**: SerialPort, SerialConfigService, frame (constants, crc8, frameBuilder, frameParser), CommunicateManager.
- [x] **Serial raw mode**: `useFrameProtocol: true`, `onRawData(chunk)`, `writeRaw(buffer)`.
- [x] **Frame protocol**: Parse/gửi frame (SOF, Frame ID, CMD, LEN, DATA, CRC8, EOF); CMD_ACK/CMD_NACK → cập nhật cache; gửi Pull (CMD_PING, CMD_* config), polling OT config + keepalive.
- [x] **CommunicateManager**: Nắm toàn bộ dữ liệu (lastThreadState, lastOtConfig, …) và khởi tạo giao tiếp (connect, disconnect, fetchOtConfig, sendPullRequest). Main truyền `onBroadcast => io.emit` để manager push event.
- [x] **WebSocketServer**: Chỉ emit tới frontend; lấy dữ liệu qua `communicate.getStatus()`, `communicate.getLastOtConfig()`, …; không còn serial/frame logic.
- [x] **Main (`index.ts`)**: Tạo io, CommunicateManager (với onBroadcast), WebSocketServer(io, …, communicateManager); gọi `communicateManager.connectIfConfigured()` khi listen.
- [ ] **CMD_DATA (CBOR)**: Parse CBOR từ CMD_DATA để cập nhật thread state / router-child-joiner table (khi firmware gửi).
- [ ] **Set config / commissioner qua frame**: Khi firmware hỗ trợ CMD tương ứng.
- Chi tiết: [docs/migration_to_frame_protocol.md](docs/migration_to_frame_protocol.md).

## Backend

- [x] **Serial/UART**: Dùng `serialport` (Node) mở cổng COM, cấu hình baud rate (thường 115200), đọc/ghi theo giao thức CLI ot-br
  - Đã tạo `SerialPortService` trong `backend/src/services/serialPort.ts`
  - Hỗ trợ mở/đóng port, gửi/nhận dữ liệu, buffer và event listeners
  - Default port: `/dev/ttyACM0`, baud rate: `115200`
- [x] **Gửi lệnh CLI**: Viết lớp/service nhận chuỗi lệnh OpenThread (vd `state`, `scan`, `networkkey`), gửi xuống UART, chờ và thu thập toàn bộ output trả về
  - Đã tạo `CLIWrapper` trong `backend/src/services/cliWrapper.ts`
  - Method `executeCommand()` gửi lệnh và thu thập response
- [x] **Phân tách kết quả**: Parse output (dòng kết thúc, prompt "> ", lỗi "Error") để biết khi nào lệnh xong và trả đúng nội dung cho API
  - Parse tự động detect "Done", "Error", và prompt "> "
  - Timeout configurable (default 5000ms)
  - Lọc dòng log firmware (ESP-IDF: I/E/W/D (timestamp) ...) khỏi output CLI; ưu tiên dòng đúng format (panid/channel/state) để tránh nhầm log với kết quả lệnh
- [x] **WebSocket API**: Thay thế HTTP/API bằng WebSocket với socket.io
  - `status` - Lấy trạng thái serial port
  - `serial:connect` - Kết nối serial port
  - `serial:disconnect` - Ngắt kết nối serial port
  - `cli:command` - Gửi lệnh CLI (data: `{ command: "state", id?: string }`)
  - `serial:data` - Event realtime: mọi dòng đọc từ UART
  - `cli:response` - Event: response từ lệnh CLI
  - `status` - Event: trạng thái serial port thay đổi
- [x] **Realtime**: WebSocket – backend chuyển tiếp mọi dòng đọc từ UART lên frontend để làm "terminal live"
  - Đã implement realtime streaming qua event `serial:data`
  - Mọi dữ liệu từ serial port được broadcast tới tất cả clients
- [x] **Cấu hình**: Biến môi trường: tên cổng (vd `COM3`, `/dev/ttyUSB0`), baud rate, có thể thêm timeout cho mỗi lệnh
  - Hỗ trợ dotenv, biến môi trường: `SERIAL_PORT`, `SERIAL_BAUD_RATE`, `CLI_TIMEOUT_MS`, `PORT`
  - File `.env.example` đã có sẵn
- [x] **Quản lý kết nối**: Mở/đóng serial an toàn; reconnect khi mất kết nối; tránh gửi lệnh khi port chưa mở
  - Tự động mở port khi gửi lệnh nếu chưa mở
  - Graceful shutdown với SIGINT/SIGTERM
  - Error handling và logging chi tiết
- [x] **Commissioner (joiner)**: WebSocket event `commissioner:connect` với `{ eui64, psk }`; backend gửi `commissioner start` rồi `commissioner joiner add <eui64> <psk> 120` qua CLI; emit `commissioner:connect:result` với `{ success, error? }`
- [ ] **Bảo mật (nếu cần)**: Auth cho API, HTTPS, giới hạn IP nếu chạy trong mạng nội bộ

## Frontend

- [x] **Giao diện nhập lệnh**: Trang **Console** – ô input lệnh OpenThread, nút "Gửi", gọi `sendCliCommand()`; nhận output qua `onCliResponse()`; log box chiều cao cố định 320px, cuộn khi tràn
- [x] **Hiển thị kết quả**: Vùng log terminal-style trên Console: in lệnh đã gửi (`> cmd`) và từng dòng output/error từ `cli:response`
- [x] **Trạng thái kết nối**: Hiển thị "Đã kết nối / Chưa kết nối / Lỗi" tới backend (và nếu có thì tới UART)
  - Trang **Status** hiển thị Serial (port, baud) + OpenThread (PAN ID, Channel, Network Name, IP Address, Dataset Active)
  - Khi thread state chuyển sang leader/router/child thì gọi lại getOtConfig (dataset active lúc disabled/detached báo Not Found)
  - Dataset Active: card riêng, hiển thị dạng bảng Key: Value giống IP Address
- [ ] **Trang Status: gửi quá nhiều lệnh lấy thông tin** — Giảm tần suất / debounce getOtConfig (vd khi state leader); sửa sau.
- [x] **Trang Commissioner**: Form EUI64 + PSK, nút "Kết nối" gọi `commissionerConnect(eui64, psk)`; trạng thái "Đang kết nối..." (ba chấm); alert thành công/lỗi; chỉ hiện trên TopNav khi state = leader
- [x] **Trang Console**: TopNav có nút Console; component Console với log box (height 320px), form lệnh CLI + Gửi
- [x] **Form thống nhất**: Commissioner, SerialConfigForm, OpenThreadConfigForm dùng chung `form-page`, `form-card`, `form-page-title`, `form-page-description`, `form-page-alert`, `form-page-form` (max-width 640px) trong `_form.scss`
- [ ] **Settings – Khởi động Thread**: Checkbox "Khởi động Thread" chỉ áp dụng khi nhấn nút "Áp dụng"; hiện tại check/uncheck đang áp dụng ngay (sai). Sửa: checkbox chỉ cập nhật state form (local), gửi lệnh Thread start/stop khi nhấn "Áp dụng".
- [ ] **Lệnh thường dùng**: Nút shortcut cho các lệnh hay dùng: `state`, `scan`, `joiner start/stop`, `commissioner start/stop`, `networkname`, v.v.
- [ ] **Lịch sử lệnh**: Lưu và cho phép chọn lại lệnh đã gửi (localStorage hoặc chỉ trong session)
- [ ] **Realtime (nếu backend có WebSocket)**: Tab/mode "Live terminal": mọi dòng từ UART hiển thị realtime, vẫn có thể gửi lệnh từ cùng giao diện

## Tích hợp & vận hành

- [x] **CORS**: Backend bật CORS cho domain/port frontend (dev và production)
  - Đã cấu hình CORS trong socket.io (origin: "*")
- [x] **Cách chạy**: Quy ước chạy backend (port, env), frontend (dev server / build), và cách kết nối (url API)
  - README.md đã có hướng dẫn chạy project
  - Scripts trong package.json: `dev`, `dev:backend`, `dev:frontend`
- [ ] **Quyền cổng serial**: Trên Linux: user trong group `dialout` hoặc rule udev cho USB serial của ESP32-H2
- [x] **Tài liệu**: README ngắn: phần cứng (ESP32-H2, ot-br, UART), cách cấu hình cổng/baud, cách chạy backend + frontend
  - README.md đã có cấu trúc và hướng dẫn cơ bản
- [ ] **WebSocket: kết nối 1 lần nhưng báo kết nối nhiều lần** — Sửa sau; hiện dùng tạm.

---

## Thứ tự làm gợi ý

1. [x] Backend: Serial + gửi 1 lệnh đơn giản (vd `state`), in output ra console
   - Đã implement SerialPortService và CLIWrapper
   - Tự động test với lệnh `state` khi khởi động
   - Logging TX/RX để debug
2. [x] Backend: WebSocket API thay thế HTTP/API
   - Đã chuyển từ Express HTTP sang WebSocket với socket.io
   - Implement đầy đủ WebSocket events cho CLI và serial port
   - Realtime data streaming từ serial port
3. [x] Frontend: Trang Status (Serial + OpenThread config, refresh khi leader, Dataset Active dạng bảng)
4. [x] Frontend: Trang Dashboard (Router Table, Child Table)
5. [x] Frontend: Trang Console (form gửi lệnh CLI + log output); Commissioner (EUI64/PSK, commissionerConnect); form thống nhất (form-page/form-card/…)
6. [x] Trang mặc định khi mở app: Commissioner
7. Sau đó: shortcut lệnh, lịch sử lệnh, Live terminal (nếu cần)

---

## Đã hoàn thành (chi tiết)

### Backend Implementation
- **SerialPortService** (`backend/src/services/serialPort.ts`):
  - Quản lý kết nối UART với ESP32-H2
  - Mở/đóng port an toàn
  - Gửi/nhận dữ liệu qua UART
  - Buffer dữ liệu và event listeners cho realtime
  - Logging TX/RX để debug

- **CLIWrapper** (`backend/src/services/cliWrapper.ts`):
  - Gửi lệnh OpenThread CLI qua serial
  - Parse response tự động (detect "Done", "Error", prompt "> ")
  - Timeout configurable cho mỗi lệnh
  - Method `ping()` để kiểm tra kết nối

- **WebSocket Server** (`backend/src/index.ts`):
  - WebSocket server với socket.io
  - Events: `status`, `serial:connect`, `serial:disconnect`, `cli:command`
  - Realtime events: `serial:data`, `cli:response`, `status`
  - Tự động kết nối và test khi khởi động
  - Broadcast dữ liệu realtime từ serial port tới tất cả clients
  - Graceful shutdown

- **Cấu hình**:
  - Hỗ trợ dotenv
  - Default: `/dev/ttyACM0` @ `115200` baud
  - Biến môi trường: `SERIAL_PORT`, `SERIAL_BAUD_RATE`, `CLI_TIMEOUT_MS`, `PORT`

- **TypeScript**:
  - Đã chuyển từ ESM sang CommonJS để import không cần extension `.js`
  - Tất cả code đã được type-safe

- **WebSocketServer – lọc output CLI** (`backend/src/server/WebSocketServer.ts`):
  - `filterCliOutput()`: loại dòng log ESP-IDF (`I/E/W/D (số) ...`) khỏi output lệnh CLI
  - `pickValueLine(lines, options)`: lấy giá trị panid/channel/networkName với format đúng (tránh PAN ID nhận nhầm "I (3460) OT_STATE: netif up")
  - `getCurrentThreadState()`: chỉ chấp nhận state trong [leader, router, child, detached, disabled] sau khi lọc log

- **WebSocketServer – hàng đợi lệnh CLI** (`backend/src/server/WebSocketServer.ts`):
  - `cliQueue` + `executeCommandQueued(command)`: mọi lệnh CLI (getThreadState, getOtConfig, router/child table, setConfig, cli:command, …) chạy **tuần tự**, tránh xung đột khi nhiều khu vực (Dashboard, Status, App poll) gọi cùng lúc trên một serial

### Frontend – Trang Status
- **Status** (`frontend/src/components/Status.tsx`):
  - Serial: trạng thái kết nối, port, baud rate
  - OpenThread: PAN ID, Channel, Network Name, IP Address (bảng tag + value), Dataset Active (card riêng, bảng Key: Value như ipaddr)
  - Khi `threadState` là leader/router/child → gọi lại `getOtConfig()` để refresh dataset active và ipaddr (tránh "Not Found" lúc disabled/detached)
- **TopNav**: nút Status, hiển thị thread state (leader/router/child); symbol đổi màu theo state (xanh lá/tím/xanh dương/cam/xám)
- **App**: poll `getThreadState()` mỗi 4s khi serial đã kết nối

### Frontend – Trang Dashboard
- **Dashboard** (`frontend/src/components/Dashboard.tsx`):
  - Chỉ hiển thị **Router Table** và **Child Table** (bỏ hết nội dung cũ: connection status, config info)
  - Backend: `ot:getRouterTable`, `ot:getChildTable`; parse output bảng OpenThread (`parseTableOutput`), emit `ot:routerTable`, `ot:childTable`
  - Frontend: `routerTable`, `childTable`, `getRouterTable()`, `getChildTable()`; khi mount và đã kết nối serial thì gọi lấy dữ liệu; **tự động làm mới** mỗi 4 giây; nút "Làm mới" cho từng bảng
  - Gọi tuần tự: router table trước, sau 1.5s mới gọi child table (tránh hai lệnh cùng lúc trên serial)
  - Dừng hẳn khi rời tab: `mountedRef` + cleanup interval và timeout từ `refreshTables()` khi unmount; không xóa data khi gọi get (cập nhật tại chỗ, không nháy bảng)
- **App**: trang mặc định `useState<NavPage>("commissioner")` → mở app thấy Commissioner trước

### Frontend – Trang Commissioner
- **Commissioner** (`frontend/src/components/Commissioner.tsx`):
  - Form EUI64 + PSK; nút "Kết nối" gọi `commissionerConnect(eui64, psk)` từ WebSocket context
  - Loading: "Đang kết nối" + ba chấm (animation); input/button disabled khi đang gửi
  - Alert thành công/lỗi sau khi backend trả `commissioner:connect:result`
- **Backend**: `commissioner:connect` → validate EUI64 (16 hex), PSK; `commissioner start` rồi `commissioner joiner add <eui64> <psk> 120`; emit `commissioner:connect:result`
- **TopNav**: nút Commissioner chỉ bật khi `threadState === "leader"`

### Frontend – Trang Console
- **Console** (`frontend/src/components/Console.tsx`):
  - TopNav có nút Console (giữa Commissioner và Settings)
  - Vùng log: nền tối, font monospace, **height 320px** cố định, overflow-y auto; hiển thị lệnh (`> cmd`) và output/error từ `cli:response`
  - Form: input "Lệnh CLI", nút "Gửi"; gọi `sendCliCommand(cmd)`, subscribe `onCliResponse` để append vào log
  - Cảnh báo khi chưa kết nối serial; input/nút disable khi chưa kết nối

### Frontend – Form thống nhất
- **`_form.scss`**: `.form-page` (max-width 640px), `.form-card`, `.form-page-title`, `.form-page-description`, `.form-page-alert` (warn/success/error), `.form-page-form` (gap 24px); khoảng cách description–form (margin-bottom description 28px)
- **Commissioner, SerialConfigForm, OpenThreadConfigForm**: dùng chung class form-page/form-card/…; mỗi component chỉ giữ style đặc thù (nút Test Connect, checkbox OT, v.v.)

### Bổ sung gần đây

#### Frontend – UI & cấu trúc
- **Modal toàn cục** (`frontend/src/components/common/Modal.tsx`): component dùng chung — overlay, title, nút đóng, Escape/click overlay đóng; dùng cho xem chi tiết dòng bảng.
- **Dashboard – click dòng bảng**: Click một dòng trong Router Table hoặc Child Table → mở Modal hiển thị **đầy đủ** thông tin dòng (tất cả cột, kể cả cột ẩn). Tiêu đề modal dùng giá trị **RLOC16** của dòng.
- **Dashboard**: Bỏ "Tổng router/child" trong box header; đưa số lượng vào nhãn bảng: **Router Table (n)**, **Child Table (n)**.
- **TopNav & Modal** chuyển vào thư mục `frontend/src/components/common/` (Modal.tsx/scss, TopNav.tsx/scss).

#### Commissioner
- **Timeout 500s**: Thêm tuỳ chọn 500 giây cho thời gian hết hạn joiner; backend `allowedTimeouts` gồm `[30, 60, 120, 180, 500]`.

#### Backend – Serial & CLI
- **Reset khi mở serial**: Ngay sau khi mở port, backend gửi **`ot reset`** rồi chờ 5s trước khi gửi `version`/`state` — xử lý trường hợp ESP/border-router chạy trước, tránh phải nhấn reset cứng.
- **Fallback prefix "ot"**: Nếu thiết bị trả "Unrecognized command" với prefix trong config (vd. "t"), backend thử lại với prefix **"ot"**; nếu thành công thì dùng "ot" cho cả phiên.
- **CLI timeout**: Mặc định tăng lên **15000 ms** (có thể override bằng `CLI_TIMEOUT_MS` trong .env).
- **AUTO_FETCH_DATA** (config trong code, `WebSocketServer.ts`): Hằng `AUTO_FETCH_DATA = true/false` — khi **false** thì không gửi polling (Status, Router/Child table, Commissioner list); khi **true** thì gửi bình thường. **Không** dùng SQL hay .env.
- **Keepalive khi AUTO_FETCH_DATA = false**: Vẫn gửi lệnh **`state`** mỗi **15 giây** để giữ serial/thiết bị hoạt động, tránh thiết bị đứng ở "Returned from app_main()" sau khi flash qua USB/JTAG rồi cắm UART vào Dashboard.

#### Frontend – Truy cập LAN
- **Vite**: `server.host: true` — dev server lắng nghe trên `0.0.0.0`, truy cập từ máy khác bằng `http://<IP-máy>:5173`.
- **WebSocket/API**: `WS_URL` dùng `window.location.origin` khi không set `VITE_WS_URL` — khi mở từ LAN, request đi qua cùng host (proxy Vite chuyển tiếp tới backend).

#### Frontend – TopNav symbol màu sắc
- **TopNav symbol** (`frontend/src/components/common/TopNav.tsx`): Symbol trạng thái đổi màu theo thread state:
  - **Xanh lá** (`status-thread-green`) — leader
  - **Tím** (`status-thread-purple`) — router
  - **Xanh dương** (`status-thread-blue`) — child
  - **Cam** (`status-serial`) — disabled/detached hoặc chưa bật "tự chạy Thread"
  - **Xám** (`status-disconnected`) — chưa kết nối serial
