/**
 * Backend: WebSocket server cho OpenThread qua TCP (frame protocol).
 * HTTP: Express — static plugin bundle (Namorix Desktop), manifest.json, health.
 * Khởi tạo giao tiếp (BrManager) ở đây; WebSocketServer chỉ emit dữ liệu tới frontend.
 */

import "dotenv/config";
import path from "path";
import fs from "fs";
import { createServer } from "http";
import express from "express";
import cors from "cors";
import { Server } from "socket.io";
import { getDatabase, closeDatabase } from "@database/database.db";
import { runMigrations } from "@database/database.migrations";
import { BrConnectionConfigService, BrManager } from "@communicate";
import { AppSettingsService } from "@settings/app-settings.service";
import { WebSocketServer } from "@websocket/websocket.server";
import { startCoapDeviceServer as startDeviceCoapServer } from "@coap/device/device-coap.server";
import { logger } from "@utils/logger.util";

const serverLog = logger.child("Server");

/** Default 4000 — matches Namorix Desktop `plugins.config.json` plugin baseUrl. */
const PORT = Number(process.env.PORT ?? 4000);

/** Built plugin output: `dashboard/dist/plugin` (Vite `vite.plugin.config.ts`). */
const pluginStaticDir =
  process.env.PLUGIN_STATIC_DIR ?? path.join(__dirname, "../../dist/plugin");

/** Namorix Desktop Vite dev origin (browser); used for CORS + Socket.io. */
const desktopOrigin = process.env.DESKTOP_ORIGIN ?? "http://localhost:5174";

getDatabase();
runMigrations();

const brConnectionConfigService = new BrConnectionConfigService();
const appSettingsService = new AppSettingsService();

const app = express();

app.use(
  cors({
    origin: desktopOrigin,
    credentials: true,
  }),
);

function loadPluginManifest(): Record<string, unknown> {
  const pkgPath = path.join(__dirname, "../../frontend/package.json");
  let version = "0.0.0";
  try {
    const raw = fs.readFileSync(pkgPath, "utf8");
    version = (JSON.parse(raw) as { version?: string }).version ?? "0.0.0";
  } catch {
    serverLog.warn(
      `Could not read frontend package.json for plugin version (${pkgPath})`,
    );
  }

  const devBase = process.env.PLUGIN_DEV_FRONTEND_URL?.trim();
  if (devBase) {
    const base = devBase.replace(/\/+$/, "");
    return {
      id: "thread",
      displayName: "Thread",
      version,
      entry: `${base}/src/main.ts`,
      element: "nmx-main",
      defaultWindowSize: { width: 1100, height: 700 },
      minWindowSize: { width: 800, height: 500 },
      singleInstance: false,
      health: "/health",
      permissions: ["thread:read", "thread:write"],
      logEnabled: true,
    };
  }

  return {
    id: "thread",
    displayName: "Thread",
    version,
    entry: "/assets/thread.js",
    styles: "/assets/thread.css",
    element: "nmx-main",
    defaultWindowSize: { width: 1100, height: 700 },
    minWindowSize: { width: 800, height: 500 },
    singleInstance: false,
    health: "/health",
    permissions: ["thread:read", "thread:write"],
    logEnabled: true,
  };
}

app.get("/manifest.json", (_req, res) => {
  res.json(loadPluginManifest());
});

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true, service: "namorix-thread-backend" });
});

app.use(express.static(pluginStaticDir));

const httpServer = createServer(app);
httpServer.maxConnections = 50;
httpServer.timeout = 60000;
httpServer.keepAliveTimeout = 5000;

const io = new Server(httpServer, {
  cors: { origin: desktopOrigin, methods: ["GET", "POST"], credentials: true },
  pingTimeout: 20000,
  pingInterval: 10000,
  maxHttpBufferSize: 100e3,
  allowEIO3: false,
  transports: ["websocket", "polling"],
  allowRequest: (_req, callback) => callback(null, true),
});

const communicateManager = new BrManager(
  brConnectionConfigService,
  appSettingsService,
  (event, data) => io.emit(event, data),
);

void new WebSocketServer(io, brConnectionConfigService, appSettingsService, communicateManager);

startDeviceCoapServer();

httpServer.listen(PORT, () => {
  serverLog.info("=".repeat(50));
  serverLog.info("Backend HTTP + WebSocket server initialized");
  serverLog.info(`Listening on http://localhost:${PORT} (plugin static: ${pluginStaticDir})`);
  serverLog.info(`Desktop CORS origin: ${desktopOrigin}`);
  serverLog.info("=".repeat(50));

  const config = brConnectionConfigService.getLatest();
  if (config) {
    serverLog.info("Current BR connection config:");
    serverLog.info(`  Host: ${config.brHost}`);
    serverLog.info(`  Port: ${config.brPort}`);
    communicateManager.connectIfConfigured().catch((err) => {
      serverLog.error(`BR auto-connect failed: ${err?.message ?? err}`);
    });
  } else {
    serverLog.info("No BR config. Configure via frontend WebSocket.");
  }

  serverLog.info("=".repeat(50));
});

process.on("SIGINT", () => {
  serverLog.info("Shutting down...");
  communicateManager.shutdown();
  closeDatabase();
  httpServer.close(() => process.exit(0));
});

process.on("SIGTERM", () => {
  serverLog.info("Shutting down...");
  communicateManager.shutdown();
  closeDatabase();
  httpServer.close(() => process.exit(0));
});
