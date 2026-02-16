/**
 * Backend: OpenThread CLI qua UART (ESP32-H2 ot-br).
 */

import "dotenv/config";
import { createServer } from "http";
import { getDatabase, closeDatabase } from "./database/Database";
import { runMigrations } from "./database/migrations";
import { SerialConfigService } from "./services/SerialConfigService";
import { WebSocketServer } from "./server/WebSocketServer";

const PORT = process.env.PORT ?? 3000;

// Khởi tạo database và chạy migrations
getDatabase();
runMigrations();

// Khởi tạo services
const serialConfigService = new SerialConfigService();

// Khởi tạo HTTP server và WebSocket
const httpServer = createServer();
const wsServer = new WebSocketServer(httpServer, serialConfigService);

// Khởi động server
httpServer.listen(PORT, () => {
  console.log("=".repeat(50));
  console.log("Backend WebSocket server initialized");
  console.log(`WebSocket server listening on ws://localhost:${PORT}`);
  console.log("=".repeat(50));

  const config = serialConfigService.getLatest();
  if (config) {
    console.log("Current serial config:");
    console.log(`  Serial Port: ${config.serialPort}`);
    console.log(`  Baud Rate: ${config.baudRate}`);
    console.log(`  Command Prefix: ${config.commandPrefix}`);
  } else {
    console.log("No serial config found. Frontend can configure via WebSocket.");
  }

  console.log("=".repeat(50));
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\nShutting down...");
  await wsServer.close();
  closeDatabase();
  httpServer.close(() => {
    process.exit(0);
  });
});

process.on("SIGTERM", async () => {
  console.log("\nShutting down...");
  await wsServer.close();
  closeDatabase();
  httpServer.close(() => {
    process.exit(0);
  });
});
