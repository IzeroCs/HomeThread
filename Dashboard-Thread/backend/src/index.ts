/**
 * Backend: WebSocket server cho OpenThread CLI qua UART (ESP32-H2 ot-br).
 */

import "dotenv/config";
import { createServer } from "http";
import { getDatabase, closeDatabase } from "./database/Database";
import { runMigrations } from "./database/migrations";
import { SerialConfigService } from "./services/SerialConfigService";
import { AppSettingsService } from "./services/AppSettingsService";
import { WebSocketServer } from "./server/WebSocketServer";

const PORT = process.env.PORT ?? 3000;

// Khởi tạo database và chạy migrations
getDatabase();
runMigrations();

// Khởi tạo services
const serialConfigService = new SerialConfigService();
const appSettingsService = new AppSettingsService();

// Khởi tạo HTTP server và WebSocket
const httpServer = createServer();

// Tối ưu memory cho HTTP server
httpServer.maxConnections = 50;
httpServer.timeout = 60000;
httpServer.keepAliveTimeout = 5000;

const wsServer = new WebSocketServer(httpServer, serialConfigService, appSettingsService);

// Khởi động server
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
    wsServer.connectSerialIfConfigured().catch((err) => {
      console.error("[Server] Serial auto-connect failed:", err);
    });
  } else {
    console.log("[Server] No serial config. Configure via frontend WebSocket.");
  }

  console.log("=".repeat(50));
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n[Server] Shutting down...");
  await wsServer.close();
  closeDatabase();
  httpServer.close(() => {
    process.exit(0);
  });
});

process.on("SIGTERM", async () => {
  console.log("\n[Server] Shutting down...");
  await wsServer.close();
  closeDatabase();
  httpServer.close(() => {
    process.exit(0);
  });
});
