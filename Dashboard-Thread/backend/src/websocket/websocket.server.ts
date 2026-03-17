/**
 * WebSocket Server - Chỉ emit dữ liệu tới frontend.
 * Dữ liệu và khởi tạo giao tiếp nằm ở BrManager; handlers tách trong handler/.
 */

import { Server, Socket } from "socket.io";
import type { BrConnectionConfigService, BrManager } from "@communicate";
import { AppSettingsService } from "@settings/app-settings.service";
import { logger } from "@utils/logger.util";
import { EVENTS } from "shared/src/events";
import { getWsRoutes } from "./ws.type";
import {
  ConfigHandler,
  BrHandler,
  DeviceHandler,
  ThreadHandler,
  CommissionerHandler,
  SrpHandler,
} from "./handler";

const wsLog = logger.child("WS");

export class WebSocketServer {
  private io: Server;
  private brConnectionConfigService: BrConnectionConfigService;
  private appSettingsService: AppSettingsService;
  private communicate: BrManager;

  private configHandler: ConfigHandler;
  private brHandler: BrHandler;
  private deviceHandler: DeviceHandler;
  private threadHandler: ThreadHandler;
  private commissionerHandler: CommissionerHandler;
  private srpHandler: SrpHandler;

  constructor(
    io: Server,
    brConnectionConfigService: BrConnectionConfigService,
    appSettingsService: AppSettingsService,
    communicate: BrManager
  ) {
    this.io = io;
    this.brConnectionConfigService = brConnectionConfigService;
    this.appSettingsService = appSettingsService;
    this.communicate = communicate;

    this.configHandler = new ConfigHandler(io, brConnectionConfigService, communicate);
    this.brHandler = new BrHandler(io, communicate);
    this.deviceHandler = new DeviceHandler(communicate);
    this.threadHandler = new ThreadHandler(communicate, appSettingsService);
    this.commissionerHandler = new CommissionerHandler(communicate);
    this.srpHandler = new SrpHandler(communicate);

    this.setupEventHandlers();
  }

  /** Gọi khi server khởi động: nếu đã có config thì tự kết nối BR (ở main). */
  async connectBrIfConfigured(): Promise<void> {
    await this.communicate.connectIfConfigured();
  }

  async close(): Promise<void> {
    await this.communicate.disconnect();
  }

  private setupEventHandlers(): void {
    const handlerInstances = [
      this.configHandler,
      this.brHandler,
      this.deviceHandler,
      this.threadHandler,
      this.commissionerHandler,
      this.srpHandler,
    ];

    this.io.on("connection", (socket: Socket) => {
      wsLog.info(`Client connected: ${socket.id}`);

      this.configHandler.sendCurrentConfig(socket);
      this.brHandler.sendBrStatus(socket);

      const lastThreadState = this.communicate.getLastThreadState();
      if (lastThreadState != null) socket.emit(EVENTS.OT_THREAD_STATE, lastThreadState);
      const lastOtConfig = this.communicate.getLastOtConfig();
      if (lastOtConfig != null) socket.emit(EVENTS.OT_CONFIG, lastOtConfig);
      const lastRouterTable = this.communicate.getLastRouterTable();
      if (lastRouterTable != null) socket.emit(EVENTS.OT_ROUTER_TABLE, lastRouterTable);
      const lastChildTable = this.communicate.getLastChildTable();
      if (lastChildTable != null) socket.emit(EVENTS.OT_CHILD_TABLE, lastChildTable);
      const lastJoinerTable = this.communicate.getLastJoinerTable();
      if (lastJoinerTable != null) socket.emit(EVENTS.OT_JOINER_TABLE, lastJoinerTable);

      for (const h of handlerInstances) {
        const routes = getWsRoutes(h.constructor as new (...args: unknown[]) => unknown);
        for (const { event, propertyKey } of routes) {
          socket.on(event, (data?: unknown) => {
            const fn = (h as unknown as Record<string, (s: Socket, d?: unknown) => void | Promise<void>>)[propertyKey];
            if (typeof fn === "function") fn.call(h, socket, data);
          });
        }
      }

      socket.on("disconnect", () => {
        wsLog.info(`Client disconnected: ${socket.id}`);
      });
    });
  }
}
