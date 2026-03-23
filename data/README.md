# Runtime data (thread backend)

Thư mục này nằm ở **root repo** `namorix-thread/`.

- **`database/`** — SQLite (`database.db` + WAL). Git-ignore.
- **`migrations/`** — file migration do Drizzle (`drizzle-kit generate` từ `backend/`).

Docker: `docker-compose.yml` (root repo) mount `./data` → `/app/data`; backend dùng `NAMORIX_DATA_DIR=/app/data`.
