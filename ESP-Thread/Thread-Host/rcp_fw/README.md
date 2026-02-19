# Firmware RCP (partition rcp_fw)

Đặt file binary RCP vào đây và **đặt tên là `ot_rcp`** (không có đuôi .bin trong tên file).

- Nếu bạn có `Thread-RCP.bin`: copy hoặc rename thành `ot_rcp`:
  - Linux/macOS: `cp Thread-RCP.bin ot_rcp`
  - Hoặc rename: `mv Thread-RCP.bin ot_rcp`

Component RCP update đọc path `/rcp_fw/ot_rcp` khi mount partition này.
