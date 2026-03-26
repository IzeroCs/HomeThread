import path from "node:path";
import { config } from "dotenv";
import { parsePort } from "@namorix/core-backend";

config({ path: path.join(__dirname, "../../.env") });

function parseDesktopOrigin(): string {
  const explicit = process.env.DESKTOP_ORIGIN?.trim();
  if (explicit) return explicit;
  const port = process.env.DESKTOP_VITE_PORT?.trim() ?? "5173";
  return `http://localhost:${port}`;
}

function parseSrpPort(raw: string | undefined, fallback: number): number {
  const n = Number(raw ?? "");
  if (!Number.isInteger(n) || n < 1 || n > 65535) return fallback;
  return n;
}

export const ENV = {
  PORT: parsePort(process.env.PORT, 4000),
  ADDON_STATIC_DIR: process.env.ADDON_STATIC_DIR?.trim() || null,
  DESKTOP_ORIGIN: parseDesktopOrigin(),
  DESKTOP_BACKEND_URL: process.env.DESKTOP_BACKEND_URL?.trim() || "http://localhost:3000",
  ADDON_PUBLIC_BASE_URL: process.env.ADDON_PUBLIC_BASE_URL?.trim() || "",
  BACKEND_IPV6: process.env.BACKEND_IPV6?.trim() || "",
  SRP_HOSTNAME: process.env.SRP_HOSTNAME?.trim() || "dashboard",
  SRP_PORT: parseSrpPort(process.env.SRP_PORT, 5683),
} as const;
