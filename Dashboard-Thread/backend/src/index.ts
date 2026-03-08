/**
 * Backend: WebSocket server cho OpenThread qua OTBR REST API.
 * Khởi tạo OtbrManager ở đây; WebSocketServer relay event tới frontend.
 */

import "dotenv/config";
import { mkdirSync } from "fs";
import { createServer } from "http";
import { Server } from "socket.io";
import { getDatabase, closeDatabase } from "./database/database.db";
import { runMigrations } from "./database/database.migrations";
import { OtbrManager } from "./otbr";
import { AppSettingsService } from "./services/app-settings.service";
import { WebSocketServer } from "./server/websocket.server";
import { startCoapDeviceServer } from "./server/coap-device.server";
import { SUPERVISOR_SOCK_DIR } from "./supervisor/socket.client";
import { logger } from "./utils/logger.util";

const serverLog = logger.child("Server");

const PORT = process.env.PORT ?? 3000;

getDatabase();
runMigrations();

try {
  mkdirSync(SUPERVISOR_SOCK_DIR, { recursive: true });
} catch {
  // Ignore (e.g. read-only fs, không mount sock)
}

const appSettingsService = new AppSettingsService();

const httpServer = createServer();
httpServer.maxConnections = 50;
httpServer.timeout = 60000;
httpServer.keepAliveTimeout = 5000;

const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"], credentials: true },
  pingTimeout: 20000,
  pingInterval: 10000,
  maxHttpBufferSize: 100e3,
  allowEIO3: false,
  transports: ["websocket", "polling"],
  allowRequest: (_req, callback) => callback(null, true),
});

const otbrManager = new OtbrManager(appSettingsService, (event, data) => io.emit(event, data));

const wsServer = new WebSocketServer(io, appSettingsService, otbrManager);

startCoapDeviceServer();

httpServer.listen(PORT, () => {
  serverLog.info("=".repeat(50));
  serverLog.info("Backend WebSocket server initialized");
  serverLog.info(`Listening on ws://localhost:${PORT}`);
  serverLog.info("=".repeat(50));

  serverLog.info("OTBR: connecting via REST...");
  otbrManager.connectIfConfigured().catch((err) => {
    serverLog.error(`OTBR auto-connect failed: ${err?.message ?? err}`);
  });

  serverLog.info("=".repeat(50));
});

process.on("SIGINT", () => {
  serverLog.info("Shutting down...");
  otbrManager.shutdown();
  closeDatabase();
  httpServer.close(() => process.exit(0));
});

process.on("SIGTERM", () => {
  serverLog.info("Shutting down...");
  otbrManager.shutdown();
  closeDatabase();
  httpServer.close(() => process.exit(0));
});
