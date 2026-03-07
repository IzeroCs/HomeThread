/**
 * Backend: WebSocket server cho OpenThread qua UART (ESP32-H2, frame protocol).
 * Khởi tạo giao tiếp (CommunicateManager) ở đây; WebSocketServer chỉ emit dữ liệu tới frontend.
 */

import "dotenv/config";
import { mkdirSync } from "fs";
import { createServer } from "http";
import { Server } from "socket.io";
import { getDatabase, closeDatabase } from "./database/Database";
import { runMigrations } from "./database/migrations";
import { BrConnectionConfigService, CommunicateManager } from "./communicate";
import { AppSettingsService } from "./services/AppSettingsService";
import { WebSocketServer } from "./server/WebSocketServer";
import { startCoapDeviceServer } from "./server/CoapDeviceServer";
import { SUPERVISOR_SOCK_DIR } from "./supervisor/socketClient";
import { logger } from "./utils/logger";

const serverLog = logger.child("Server");

const PORT = process.env.PORT ?? 3000;

getDatabase();
runMigrations();

try {
  mkdirSync(SUPERVISOR_SOCK_DIR, { recursive: true });
} catch {
  // Ignore (e.g. read-only fs, không mount sock)
}

const brConnectionConfigService = new BrConnectionConfigService();
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

const communicateManager = new CommunicateManager(
  brConnectionConfigService,
  appSettingsService,
  (event, data) => io.emit(event, data)
);

const wsServer = new WebSocketServer(io, brConnectionConfigService, appSettingsService, communicateManager);

startCoapDeviceServer();

httpServer.listen(PORT, () => {
  serverLog.info("=".repeat(50));
  serverLog.info("Backend WebSocket server initialized");
  serverLog.info(`Listening on ws://localhost:${PORT}`);
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
