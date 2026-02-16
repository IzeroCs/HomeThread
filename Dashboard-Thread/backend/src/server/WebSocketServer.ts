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
  private serialDataUnsubscribe: (() => void) | null = null;

  constructor(httpServer: HTTPServer, serialConfigService: SerialConfigService) {
    this.serialConfigService = serialConfigService;

    this.io = new Server(httpServer, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: true,
      },
      // Tối ưu memory - giảm các giá trị mặc định
      pingTimeout: 20000, // 20 seconds
      pingInterval: 10000, // 10 seconds
      maxHttpBufferSize: 100e3, // 100KB thay vì 1MB
      allowEIO3: false,
      transports: ["websocket", "polling"], // Cho phép cả websocket và polling
      // Giới hạn connections
      allowRequest: (req, callback) => {
        callback(null, true);
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

      socket.on("serial:test", async (data: {
        serialPort: string;
        baudRate: number;
        commandPrefix: string;
      }) => {
        await this.handleSerialTest(socket, data);
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

  /**
   * Đóng serial port hiện tại và reset reference (để lần Connect tiếp theo dùng config mới từ DB)
   */
  private async resetSerialPort(): Promise<void> {
    if (this.serialDataUnsubscribe) {
      this.serialDataUnsubscribe();
      this.serialDataUnsubscribe = null;
    }
    if (this.serialPort) {
      await this.serialPort.close();
      this.serialPort = null;
      this.cliWrapper = null;
      this.io.emit("serial:status", {
        isConnected: false,
        path: "",
        baudRate: 0,
      });
    }
  }

  private validateConfig(data: {
    serialPort?: string;
    baudRate?: number;
    commandPrefix?: string;
  }): string | null {
    if (data.serialPort !== undefined) {
      if (typeof data.serialPort !== "string" || !data.serialPort.trim()) {
        return "Serial port is required";
      }
    }
    if (data.baudRate !== undefined) {
      const n = Number(data.baudRate);
      if (!Number.isInteger(n) || n < 9600 || n > 2000000) {
        return "Baud rate must be an integer between 9600 and 2000000";
      }
    }
    if (data.commandPrefix !== undefined) {
      if (typeof data.commandPrefix !== "string" || !data.commandPrefix.trim()) {
        return "Command prefix is required";
      }
    }
    return null;
  }

  private async handleConfigSave(
    socket: Socket,
    data: { serialPort: string; baudRate: number; commandPrefix: string }
  ): Promise<void> {
    const err = this.validateConfig(data);
    if (err) {
      socket.emit("config:error", { error: err });
      return;
    }
    try {
      await this.resetSerialPort();
      const config = this.serialConfigService.saveOrUpdate({
        serialPort: data.serialPort.trim(),
        baudRate: Number(data.baudRate),
        commandPrefix: data.commandPrefix.trim(),
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
    if (typeof data.id !== "number" || !Number.isInteger(data.id) || data.id < 1) {
      socket.emit("config:error", { error: "Invalid config id" });
      return;
    }
    const err = this.validateConfig(data);
    if (err) {
      socket.emit("config:error", { error: err });
      return;
    }
    try {
      const updates: { serialPort?: string; baudRate?: number; commandPrefix?: string } = {};
      if (data.serialPort !== undefined) updates.serialPort = data.serialPort.trim();
      if (data.baudRate !== undefined) updates.baudRate = Number(data.baudRate);
      if (data.commandPrefix !== undefined) updates.commandPrefix = data.commandPrefix.trim();
      const config = this.serialConfigService.update(data.id, updates);
      if (config) {
        await this.resetSerialPort();
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
    // Cleanup listener cũ nếu có
    if (this.serialDataUnsubscribe) {
      this.serialDataUnsubscribe();
      this.serialDataUnsubscribe = null;
    }

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

    // Đăng ký listener để broadcast dữ liệu realtime và lưu unsubscribe function
    this.serialDataUnsubscribe = this.serialPort.onData((data) => {
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

  /**
   * Kiểm tra response có phải OpenThread: dùng lệnh "version" (chuẩn), output thường chứa "openthread".
   * Fallback: lệnh "state" với disabled/detached/leader/child/router.
   */
  private isOpenThreadResponse(
    res: { success: boolean; output: string[] },
    command: "version" | "state"
  ): boolean {
    const text = res.output.join(" ").toLowerCase();
    if (command === "version") {
      return res.success && text.includes("openthread");
    }
    const validStates = ["disabled", "detached", "leader", "child", "router"];
    return res.output.some((line) =>
      validStates.some((s) => line.toLowerCase().includes(s))
    );
  }

  /**
   * Test connect: mở port, chạy lệnh version (chuẩn); nếu không có version thì thử state.
   */
  private async handleSerialTest(
    socket: Socket,
    data: { serialPort: string; baudRate: number; commandPrefix: string }
  ): Promise<void> {
    const err = this.validateConfig(data);
    if (err) {
      socket.emit("serial:test:result", { success: false, error: err });
      return;
    }
    const path = data.serialPort.trim();
    const baudRate = Number(data.baudRate);
    const commandPrefix = data.commandPrefix.trim();

    const runTest = async (
      cli: CLIWrapper,
      port: SerialPortService
    ): Promise<{ success: boolean; error?: string }> => {
      let res = await cli.executeCommand("version");
      if (this.isOpenThreadResponse(res, "version")) {
        return { success: true };
      }
      res = await cli.executeCommand("state");
      if (this.isOpenThreadResponse(res, "state")) {
        return { success: true };
      }
      return {
        success: false,
        error:
          res.output.length > 0
            ? "Not OpenThread firmware (version/state check failed)"
            : res.error ?? "No response from device",
      };
    };

    try {
      const status = this.serialPort?.getStatus();
      if (status?.isConnected && status.path === path) {
        const result = await runTest(this.cliWrapper!, this.serialPort!);
        socket.emit("serial:test:result", result);
        return;
      }

      const tempPort = new SerialPortService({ path, baudRate });
      await tempPort.open();
      const timeoutMs = parseInt(process.env.CLI_TIMEOUT_MS ?? "5000", 10);
      const tempCli = new CLIWrapper(tempPort, { commandPrefix, timeoutMs });
      const result = await runTest(tempCli, tempPort);
      await tempPort.close();
      socket.emit("serial:test:result", result);
    } catch (error) {
      socket.emit("serial:test:result", {
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
    // Cleanup listener
    if (this.serialDataUnsubscribe) {
      this.serialDataUnsubscribe();
      this.serialDataUnsubscribe = null;
    }

    if (this.serialPort) {
      await this.serialPort.close();
      this.serialPort = null;
      this.cliWrapper = null;
    }
  }
}
