import path from "path";
import { ENV } from "./env";
import {
  createAddonBackendServer,
  logger,
} from "@namorix/core-backend";
import { Server } from "socket.io";
import { getDatabase, closeDatabase } from "@database/database.db";
import { runMigrations } from "@database/database.migrations";
import { BrConnectionConfigService, BrManager } from "@communicate";
import { AppSettingsService } from "@settings/app-settings.service";
import { WebSocketServer } from "@websocket/websocket.server";
import { startCoapDeviceServer as startDeviceCoapServer } from "@coap/device/device-coap.server";

const serverLog = logger.child("Server");
/** Default 4000 — matches Namorix Desktop addon baseUrl. */
const PORT = ENV.PORT;

/** Built addon output: `dist/addon` (Vite `vite.addon.config.ts`). */
const addonStaticDir =
  ENV.ADDON_STATIC_DIR ?? path.join(__dirname, "../../dist/addon");

/** Namorix Desktop shell origin (browser); used for CORS + Socket.io. */
const desktopOrigin = ENV.DESKTOP_ORIGIN;

getDatabase();
runMigrations();

const brConnectionConfigService = new BrConnectionConfigService();
const appSettingsService = new AppSettingsService();

const addonServer = createAddonBackendServer({
  addonId: "thread",
  port: PORT,
  addonStaticDir,
  desktopOrigin,
  logger: { server: serverLog },
  hooks: {
    onAfterListen: ({ httpServer }) => {
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
      });

      const communicateManager = new BrManager(
        brConnectionConfigService,
        appSettingsService,
        (event, data) => io.emit(event, data),
      );

      void new WebSocketServer(io, brConnectionConfigService, appSettingsService, communicateManager);
      startDeviceCoapServer();

      serverLog.info("=".repeat(50));
      serverLog.info("Backend HTTP + WebSocket server initialized");
      serverLog.info(`Listening on http://localhost:${PORT} (addon static: ${addonStaticDir})`);
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

      const shutdown = (): void => {
        serverLog.info("Shutting down...");
        communicateManager.shutdown();
        closeDatabase();
        void addonServer.stop(0);
      };
      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);
    },
    onShutdown: () => {
      // `closeDatabase` handled by thread shutdown callback.
    },
  },
});

void addonServer.start();
