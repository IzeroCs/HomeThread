/**
 * WebSocket Server - Xử lý kết nối WebSocket với frontend
 */

import { Server as HTTPServer } from "http";
import { Server, Socket } from "socket.io";
import { SerialConfigService } from "../services/SerialConfigService";
import { SerialPortService } from "../services/SerialPort";
import { CLIWrapper } from "../services/CliWrapper";

export class WebSocketServer {
  private io: Server;
  private serialConfigService: SerialConfigService;
  private serialPort: SerialPortService | null = null;
  private cliWrapper: CLIWrapper | null = null;

  constructor(httpServer: HTTPServer, serialConfigService: SerialConfigService) {
    this.serialConfigService = serialConfigService;

    this.io = new Server(httpServer, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"],
      },
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.io.on("connection", (socket: Socket) => {
      console.log(`Client connected: ${socket.id}`);

      // Gửi config hiện tại khi client kết nối
      this.sendCurrentConfig(socket);

      // Gửi trạng thái serial port hiện tại
      this.sendSerialStatus(socket);

      // Config events
      socket.on("config:get", () => {
        this.sendCurrentConfig(socket);
      });

      socket.on("config:save", async (data: {
        serialPort: string;
        baudRate: number;
        commandPrefix: string;
      }) => {
        await this.handleConfigSave(socket, data);
      });

      socket.on("config:update", async (data: {
        id: number;
        serialPort?: string;
        baudRate?: number;
        commandPrefix?: string;
      }) => {
        await this.handleConfigUpdate(socket, data);
      });

      // Serial port events
      socket.on("serial:connect", async () => {
        await this.handleSerialConnect(socket);
      });

      socket.on("serial:disconnect", async () => {
        await this.handleSerialDisconnect(socket);
      });

      socket.on("serial:status", () => {
        this.sendSerialStatus(socket);
      });

      // CLI command events
      socket.on("cli:command", async (data: { command: string; id?: string }) => {
        await this.handleCliCommand(socket, data);
      });

      // Xử lý khi client ngắt kết nối
      socket.on("disconnect", () => {
        console.log(`Client disconnected: ${socket.id}`);
      });
    });
  }

  private sendCurrentConfig(socket: Socket): void {
    const config = this.serialConfigService.getLatest();
    socket.emit("config:current", config);
  }

  private async handleConfigSave(
    socket: Socket,
    data: { serialPort: string; baudRate: number; commandPrefix: string }
  ): Promise<void> {
    try {
      const config = this.serialConfigService.create({
        serialPort: data.serialPort,
        baudRate: data.baudRate,
        commandPrefix: data.commandPrefix,
      });
      socket.emit("config:saved", config);
      this.io.emit("config:current", config);
    } catch (error) {
      socket.emit("config:error", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  private async handleConfigUpdate(
    socket: Socket,
    data: {
      id: number;
      serialPort?: string;
      baudRate?: number;
      commandPrefix?: string;
    }
  ): Promise<void> {
    try {
      const config = this.serialConfigService.update(data.id, {
        serialPort: data.serialPort,
        baudRate: data.baudRate,
        commandPrefix: data.commandPrefix,
      });
      if (config) {
        socket.emit("config:updated", config);
        this.io.emit("config:current", config);
      } else {
        socket.emit("config:error", { error: "Config not found" });
      }
    } catch (error) {
      socket.emit("config:error", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  private initializeSerialPort(config: {
    serialPort: string;
    baudRate: number;
    commandPrefix: string;
  }): void {
    if (this.serialPort) {
      this.serialPort.close().catch(console.error);
    }

    this.serialPort = new SerialPortService({
      path: config.serialPort,
      baudRate: config.baudRate,
    });

    const timeoutMs = parseInt(process.env.CLI_TIMEOUT_MS ?? "5000", 10);
    this.cliWrapper = new CLIWrapper(this.serialPort, {
      commandPrefix: config.commandPrefix,
      timeoutMs,
    });

    // Đăng ký listener để broadcast dữ liệu realtime
    this.serialPort.onData((data) => {
      this.io.emit("serial:data", data);
    });
  }

  private async handleSerialConnect(socket: Socket): Promise<void> {
    try {
      const config = this.serialConfigService.getLatest();
      if (!config) {
        socket.emit("serial:error", {
          error: "No serial config found. Please configure first.",
        });
        return;
      }

      if (!this.serialPort || !this.cliWrapper) {
        this.initializeSerialPort(config);
      }

      await this.serialPort!.open();
      socket.emit("serial:connected", {
        success: true,
        status: this.serialPort!.getStatus(),
      });
      this.io.emit("serial:status", this.serialPort!.getStatus());
    } catch (error) {
      socket.emit("serial:error", {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  private async handleSerialDisconnect(socket: Socket): Promise<void> {
    try {
      if (this.serialPort) {
        await this.serialPort.close();
        socket.emit("serial:disconnected", { success: true });
        this.io.emit("serial:status", this.serialPort.getStatus());
      }
    } catch (error) {
      socket.emit("serial:error", {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  private sendSerialStatus(socket: Socket): void {
    if (this.serialPort) {
      socket.emit("serial:status", this.serialPort.getStatus());
    } else {
      socket.emit("serial:status", {
        isConnected: false,
        path: "",
        baudRate: 0,
      });
    }
  }

  private async handleCliCommand(
    socket: Socket,
    data: { command: string; id?: string }
  ): Promise<void> {
    const { command, id } = data;

    if (!command || typeof command !== "string") {
      socket.emit("cli:response", {
        id,
        success: false,
        error: "Missing or invalid 'command'",
      });
      return;
    }

    if (!this.cliWrapper) {
      socket.emit("cli:response", {
        id,
        success: false,
        error: "Serial port not initialized. Please connect first.",
      });
      return;
    }

    try {
      // Đảm bảo serial port đã mở
      if (!this.serialPort!.getStatus().isConnected) {
        await this.serialPort!.open();
      }

      const response = await this.cliWrapper.executeCommand(command.trim());

      socket.emit("cli:response", {
        id,
        success: response.success,
        command: command,
        output: response.output,
        error: response.error,
      });
    } catch (error) {
      socket.emit("cli:response", {
        id,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        command: command,
      });
    }
  }

  async close(): Promise<void> {
    if (this.serialPort) {
      await this.serialPort.close();
    }
  }
}
