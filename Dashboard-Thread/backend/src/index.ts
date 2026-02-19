/**
 * Backend: WebSocket server cho OpenThread qua UART (ESP32-H2, frame protocol).
 * Khởi tạo giao tiếp (CommunicateManager) ở đây; WebSocketServer chỉ emit dữ liệu tới frontend.
 */

import "dotenv/config";
import { createServer } from "http";
import { Server } from "socket.io";
import { getDatabase, closeDatabase } from "./database/Database";
import { runMigrations } from "./database/migrations";
import { SerialConfigService, CommunicateManager } from "./communicate";
import { AppSettingsService } from "./services/AppSettingsService";
import { WebSocketServer } from "./server/WebSocketServer";

const PORT = process.env.PORT ?? 3000;

getDatabase();
runMigrations();

const serialConfigService = new SerialConfigService();
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
  serialConfigService,
  appSettingsService,
  (event, data) => io.emit(event, data)
);

const wsServer = new WebSocketServer(io, serialConfigService, appSettingsService, communicateManager);

httpServer.listen(PORT, () => {
  console.log("=".repeat(50));
  console.log("[Server] Backend WebSocket server initialized");
  console.log(`[Server] Listening on ws://localhost:${PORT}`);
  console.log("=".repeat(50));

  const config = serialConfigService.getLatest();
  if (config) {
    console.log("[Server] Current serial config:");
    console.log(`[Server]   Serial Port: ${config.serialPort}`);
    console.log(`[Server]   Baud Rate: ${config.baudRate}`);
    console.log(`[Server]   Command Prefix: ${config.commandPrefix}`);
    communicateManager.connectIfConfigured().catch((err) => {
      console.error("[Server] Serial auto-connect failed:", err);
    });
  } else {
    console.log("[Server] No serial config. Configure via frontend WebSocket.");
  }

  console.log("=".repeat(50));
});

process.on("SIGINT", async () => {
  console.log("\n[Server] Shutting down...");
  await wsServer.close();
  closeDatabase();
  httpServer.close(() => process.exit(0));
});

process.on("SIGTERM", async () => {
  console.log("\n[Server] Shutting down...");
  await wsServer.close();
  closeDatabase();
  httpServer.close(() => process.exit(0));
});
