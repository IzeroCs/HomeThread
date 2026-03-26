/**
 * Backend: WebSocket server cho OpenThread qua TCP (frame protocol).
 * HTTP: Express — static addon bundle only.
 * Khởi tạo giao tiếp (BrManager) ở đây; WebSocketServer chỉ emit dữ liệu tới frontend.
 */

import path from "path";
import { randomUUID } from "node:crypto";
import { ENV } from "./env";
import fs from "fs";
import { Server } from "socket.io";
import { getDatabase, closeDatabase } from "@database/database.db";
import { runMigrations } from "@database/database.migrations";
import { BrConnectionConfigService, BrManager } from "@communicate";
import { AppSettingsService } from "@settings/app-settings.service";
import { WebSocketServer } from "@websocket/websocket.server";
import { startCoapDeviceServer as startDeviceCoapServer } from "@coap/device/device-coap.server";
import { getAddonRegistrationSecret } from "./addon-secret";
import {
  AddonControlStateService,
  createAddonControlAllowRequestGuard,
  createAddonControlClient,
  createAddonBackendServer,
  logger,
  type RegistrationStateSnapshot,
} from "@namorix/core-backend";
import { BackendControlReasonCode } from "@namorix/core-shared";
import { EVENTS } from "shared/src/events";

const serverLog = logger.child("Server");
const registerLog = logger.child("AddonRegister");

/** Default 4000 — matches Namorix Desktop addon baseUrl. */
const PORT = ENV.PORT;

/** Built addon output: `dist/addon` (Vite `vite.addon.config.ts`). */
const addonStaticDir =
  ENV.ADDON_STATIC_DIR ?? path.join(__dirname, "../../dist/addon");

/** Namorix Desktop shell origin (browser); used for CORS + Socket.io. */
const desktopOrigin = ENV.DESKTOP_ORIGIN;
const addonId = "thread";
const desktopBackendUrl = ENV.DESKTOP_BACKEND_URL;
const addonRegistrationSecret = getAddonRegistrationSecret();
const controlStateService = new AddonControlStateService();
const controlClientInstanceId = `${addonId}-${process.pid}-${randomUUID()}`;
let lastManifestSyncSignature = "";
let registrationStateRef: RegistrationStateSnapshot | null = null;
let controlClientRef:
  | ReturnType<typeof createAddonControlClient>
  | null = null;
let registerRetryTimer: ReturnType<typeof setTimeout> | null = null;
let isWsRegistered = false;
let latestRegistrationState: RegistrationStateSnapshot = {
  status: "pending",
  attempts: 0,
  lastError: null,
  lastHttpStatus: null,
  registeredAt: null,
  stopped: false,
  controlLifecycle: controlStateService.getSnapshot().lifecycle,
  controlReasonCode: controlStateService.getSnapshot().reasonCode,
};

getDatabase();
runMigrations();

const brConnectionConfigService = new BrConnectionConfigService();
const appSettingsService = new AppSettingsService();

function loadAddonManifest(): Record<string, unknown> {
  const pkgPath = path.join(__dirname, "../../frontend/package.json");
  let version = "0.0.0";
  try {
    const raw = fs.readFileSync(pkgPath, "utf8");
    version = (JSON.parse(raw) as { version?: string }).version ?? "0.0.0";
  } catch {
    serverLog.warn(
      `Could not read frontend package.json for addon version (${pkgPath})`,
    );
  }

  return {
    id: "thread",
    displayName: "Thread",
    version,
    entry: "/assets/thread.js",
    styles: "/assets/thread.css",
    element: "nmx-thread-main",
    defaultWindowSize: { width: 1100, height: 700 },
    minWindowSize: { width: 800, height: 500 },
    singleInstance: false,
    permissions: ["thread:read", "thread:write"],
    logEnabled: true,
  };
}

function resolveAddonPublicBaseUrl(): string {
  const fromEnv = ENV.ADDON_PUBLIC_BASE_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  return `http://localhost:${PORT}`;
}

function buildManifestSyncBody() {
  const body = {
    addonId,
    baseUrl: resolveAddonPublicBaseUrl(),
    manifest: loadAddonManifest(),
    registrationSecret: addonRegistrationSecret,
  };
  const signature = JSON.stringify({
    baseUrl: body.baseUrl,
    manifest: body.manifest,
  });
  return { body, signature };
}

function scheduleRegisterViaWs(delayMs: number): void {
  if (registerRetryTimer) clearTimeout(registerRetryTimer);
  registerRetryTimer = setTimeout(() => {
    if (isWsRegistered) return;
    controlClientRef?.requestRegister({
      id: addonId,
      baseUrl: resolveAddonPublicBaseUrl(),
      manifest: loadAddonManifest(),
      registrationSecret: addonRegistrationSecret,
    });
  }, delayMs);
}

const addonServer = createAddonBackendServer({
  addonId,
  serviceName: "namorix-thread-backend",
  port: PORT,
  addonStaticDir,
  desktopOrigin,
  desktopBackendUrl,
  resolveManifest: loadAddonManifest,
  resolvePublicBaseUrl: resolveAddonPublicBaseUrl,
  registrationSecret: addonRegistrationSecret,
  logger: {
    server: {
      info: (msg) => serverLog.info(msg),
      warn: (msg) => serverLog.warn(msg),
      error: (msg) => serverLog.error(msg),
    },
    register: {
      info: (msg) => registerLog.info(msg),
      warn: (msg) => registerLog.warn(msg),
      error: (msg) => registerLog.error(msg),
    },
  },
  onRegistrationStateChange: (nextState: RegistrationStateSnapshot) => {
    registrationStateRef = nextState;
    nextState.controlLifecycle = controlStateService.getSnapshot().lifecycle;
    nextState.controlReasonCode = controlStateService.getSnapshot().reasonCode;
    latestRegistrationState = { ...nextState };
    if (nextState.status !== "registered") return;
  },
  mountDomainRoutes: () => {},
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
        allowRequest: createAddonControlAllowRequestGuard(controlStateService),
      });

      const communicateManager = new BrManager(
        brConnectionConfigService,
        appSettingsService,
        (event, data) => io.emit(event, data),
      );

      void new WebSocketServer(io, brConnectionConfigService, appSettingsService, communicateManager);
      io.on("connection", (socket) => {
        socket.emit(EVENTS.ADDON_CONTROL_STATE, controlStateService.getSnapshot());
      });
      const controlClient = createAddonControlClient({
        desktopBackendUrl,
        addonId,
        registrationSecret: addonRegistrationSecret,
        instanceId: controlClientInstanceId,
        stateService: controlStateService,
        onLifecycle: (payload) => {
          if (registrationStateRef) {
            registrationStateRef.controlLifecycle = payload.lifecycle;
            registrationStateRef.controlReasonCode = payload.reasonCode;
          }
          latestRegistrationState = {
            ...latestRegistrationState,
            controlLifecycle: payload.lifecycle,
            controlReasonCode: payload.reasonCode,
          };
          io.emit(EVENTS.ADDON_CONTROL_STATE, controlStateService.getSnapshot());
          if (payload.lifecycle === "approved") {
            const { body, signature } = buildManifestSyncBody();
            if (signature !== lastManifestSyncSignature) {
              controlClient.requestManifestSync(body);
            }
          }
          if (!controlStateService.isRuntimeAllowed()) {
            io.disconnectSockets(true);
          }
        },
        onRegisterAck: (payload) => {
          if (payload.status === "pending") {
            latestRegistrationState = {
              ...latestRegistrationState,
              status: "pending",
              attempts: latestRegistrationState.attempts + 1,
              lastHttpStatus: null,
              lastError: null,
            };
            scheduleRegisterViaWs(2000);
            return;
          }
          isWsRegistered = true;
          latestRegistrationState = {
            ...latestRegistrationState,
            status: "registered",
            registeredAt: new Date().toISOString(),
            stopped: true,
            lastError: null,
            controlReasonCode: BackendControlReasonCode.AddonApproved,
          };
          if (registrationStateRef) Object.assign(registrationStateRef, latestRegistrationState);
          const { body, signature } = buildManifestSyncBody();
          if (signature !== lastManifestSyncSignature) {
            controlClient.requestManifestSync(body);
          }
        },
        onManifestSyncAck: (payload) => {
          if (payload.status === "approved" && payload.updated) {
            const { signature } = buildManifestSyncBody();
            lastManifestSyncSignature = signature;
            registerLog.info("manifest-sync sent successfully via WS");
          }
        },
      });
      controlClientRef = controlClient;
      controlClient.start();
      scheduleRegisterViaWs(250);
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
        controlClient.stop();
        if (registerRetryTimer) clearTimeout(registerRetryTimer);
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
