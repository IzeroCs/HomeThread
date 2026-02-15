# TODO – Điều khiển OpenThread CLI qua UART (ESP32-H2 ot-br)

## Stack & cấu trúc (đã chọn)

- **Backend**: Node.js + TypeScript (Express, SerialPort). Monorepo: `backend/`.
- **Frontend**: TypeScript + React + Vite. Monorepo: `frontend/`.
- **Chung 1 project**: npm workspaces tại root; `npm run dev` chạy đồng thời BE + FE.

## Backend

- [ ] **Serial/UART**: Dùng `serialport` (Node) mở cổng COM, cấu hình baud rate (thường 115200), đọc/ghi theo giao thức CLI ot-br
- [ ] **Gửi lệnh CLI**: Viết lớp/service nhận chuỗi lệnh OpenThread (vd `state`, `scan`, `networkkey`), gửi xuống UART, chờ và thu thập toàn bộ output trả về
- [ ] **Phân tách kết quả**: Parse output (dòng kết thúc, prompt "> ", lỗi "Error") để biết khi nào lệnh xong và trả đúng nội dung cho API
- [ ] **Web API**: REST hoặc RPC, ví dụ `POST /api/cli` body `{ "command": "state" }` trả về output; có thể thêm `GET /api/status` (serial đã mở chưa, thiết bị có phản hồi không)
- [ ] **Realtime (tùy chọn)**: WebSocket – backend chuyển tiếp mọi dòng đọc từ UART lên frontend để làm "terminal live" thay vì chỉ trả 1 response
- [ ] **Cấu hình**: Biến môi trường: tên cổng (vd `COM3`, `/dev/ttyUSB0`), baud rate, có thể thêm timeout cho mỗi lệnh
- [ ] **Quản lý kết nối**: Mở/đóng serial an toàn; reconnect khi mất kết nối; tránh gửi lệnh khi port chưa mở
- [ ] **Bảo mật (nếu cần)**: Auth cho API, HTTPS, giới hạn IP nếu chạy trong mạng nội bộ

## Frontend

- [ ] **Giao diện nhập lệnh**: Ô input để gõ lệnh OpenThread (vd `state`, `scan`, `joiner start 0`), nút "Gửi" hoặc Enter
- [ ] **Hiển thị kết quả**: Vùng hiển thị output (terminal-style hoặc log): in từng dòng/block text backend trả về
- [ ] **Trạng thái kết nối**: Hiển thị "Đã kết nối / Chưa kết nối / Lỗi" tới backend (và nếu có thì tới UART)
- [ ] **Lệnh thường dùng**: Nút shortcut cho các lệnh hay dùng: `state`, `scan`, `joiner start/stop`, `commissioner start/stop`, `networkname`, v.v.
- [ ] **Lịch sử lệnh**: Lưu và cho phép chọn lại lệnh đã gửi (localStorage hoặc chỉ trong session)
- [ ] **Realtime (nếu backend có WebSocket)**: Tab/mode "Live terminal": mọi dòng từ UART hiển thị realtime, vẫn có thể gửi lệnh từ cùng giao diện

## Tích hợp & vận hành

- [ ] **CORS**: Backend bật CORS cho domain/port frontend (dev và production)
- [ ] **Cách chạy**: Quy ước chạy backend (port, env), frontend (dev server / build), và cách kết nối (url API)
- [ ] **Quyền cổng serial**: Trên Linux: user trong group `dialout` hoặc rule udev cho USB serial của ESP32-H2
- [ ] **Tài liệu**: README ngắn: phần cứng (ESP32-H2, ot-br, UART), cách cấu hình cổng/baud, cách chạy backend + frontend

---

## Thứ tự làm gợi ý

1. Backend: Serial + gửi 1 lệnh đơn giản (vd `state`), in output ra console
2. Backend: API `POST /api/cli` trả về output
3. Frontend: form gửi lệnh + hiển thị kết quả, gọi API
4. Sau đó: shortcut lệnh, lịch sử, cấu hình, WebSocket (nếu cần terminal realtime)
