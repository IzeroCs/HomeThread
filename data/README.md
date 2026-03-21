# Runtime data (dashboard backend)

Thư mục này nằm ở **root repo** `namorix-thread/` (cạnh `dashboard/`), không còn trong `dashboard/backend/data`.

- **`database/`** — SQLite (`database.db` + WAL). Git-ignore.
- **`migrations/`** — file migration do Drizzle (`drizzle-kit generate` từ `dashboard/backend/`).

Docker: `dashboard/docker-compose.yml` mount `../data` → `/app/data`; backend dùng `NAMORIX_DATA_DIR=/app/data`.
