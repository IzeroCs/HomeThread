/**
 * Backend: API + Serial/UART cho OpenThread CLI (ESP32-H2 ot-br).
 * Chưa implement logic – chỉ khởi động server.
 */

import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT ?? 3000;

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "backend" });
});

app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});
