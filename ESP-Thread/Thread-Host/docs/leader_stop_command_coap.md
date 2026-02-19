# CoAP Stop Command - Leader Control

## Tổng quan

Border Router gửi **GET `/network`** (một segment) đến Leader để yêu cầu offline; sau đó BR có thể trở thành Leader mới. **Leader Control Client** chạy suốt vòng đời device, check mỗi 5 giây.

## Request (BR → Leader)

| Mục | Giá trị |
|-----|---------|
| Method | GET (0.01) |
| Type | CONFIRMABLE |
| Path | **Một segment** `"network"` (OpenThread match full path → không dùng `/network/stop`) |
| Payload | Không có |
| Port | 5683 |
| Destination | Leader RLOC: `mesh_prefix + 0000:00ff:fe00:RLOC16` (RLOC16 từ `otThreadGetLeaderRloc()`) |

## Response (Leader → BR)

- Thành công: **2.05 Content** (ACK).
- Lỗi: 4.xx / 5.xx.

**Quan trọng (endpoint):** Gửi 2.05 **trước**, sau đó mới `otThreadSetEnabled(false)`. Dùng **`otCoapMessageInitResponse(response, aMessage, ...)`** để copy Message ID + Token từ request → client mới nhận được response.

## Khi nào BR gửi lệnh stop?

1. **First time** — chưa gửi lần nào  
2. **Leader changed** — RLOC16 Leader thay đổi  
3. **Retry on failure** — lần trước timeout hoặc lỗi  
4. **Retry timeout** — đã gửi thành công nhưng sau **2 phút** Leader vẫn còn → gửi lại  

Timeout đợi response: 5 giây. Retry ở lần check tiếp theo (5 giây sau).

## Leader election timing

Sau khi Leader cũ offline: **~60–120 s** Router detect Leader offline → **~10–30 s** leader election → **tổng ~1–2.5 phút** mới có Leader mới. BR (weight +16) được ưu tiên.

## Endpoint checklist

- Enable CoAP API; `otCoapStart()`; đăng ký resource `mUriPath = "network"`.
- Handler: check GET; gửi response bằng `otCoapMessageInitResponse(..., aMessage, ...)`; sau đó `otThreadSetEnabled(false)`.
