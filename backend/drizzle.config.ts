import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/database/database.schema.ts",
  out: "../data/migrations",
  breakpoints: true,
});
