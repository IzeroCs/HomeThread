import path from "path";
import { defineConfig } from "drizzle-kit";

/** `namorix-thread/data/migrations` — chạy `db:generate` với cwd = `backend/`. */
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/database/database.schema.ts",
  out: path.resolve(process.cwd(), "..", "..", "data", "migrations"),
  breakpoints: true,
});
