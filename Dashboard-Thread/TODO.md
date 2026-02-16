# TODO – Điều khiển OpenThread CLI qua UART (ESP32-H2 ot-br)

## Stack & cấu trúc (đã chọn)

- **Backend**: Node.js + TypeScript (Express, SerialPort). Monorepo: `backend/`.
- **Frontend**: TypeScript + React + Vite. Monorepo: `frontend/`.
- **Chung 1 project**: npm workspaces tại root; `npm run dev` chạy đồng thời BE + FE.

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
- [ ] **Bảo mật (nếu cần)**: Auth cho API, HTTPS, giới hạn IP nếu chạy trong mạng nội bộ

## Frontend

- [ ] **Giao diện nhập lệnh**: Ô input để gõ lệnh OpenThread (vd `state`, `scan`, `joiner start 0`), nút "Gửi" hoặc Enter
- [ ] **Hiển thị kết quả**: Vùng hiển thị output (terminal-style hoặc log): in từng dòng/block text backend trả về
- [ ] **Trạng thái kết nối**: Hiển thị "Đã kết nối / Chưa kết nối / Lỗi" tới backend (và nếu có thì tới UART)
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
3. Frontend: form gửi lệnh + hiển thị kết quả, gọi API
4. Sau đó: shortcut lệnh, lịch sử, cấu hình, WebSocket (nếu cần terminal realtime)

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
