/**
 * WebSocket Server - Xử lý kết nối WebSocket với frontend
 */

import { Server as HTTPServer } from "http";
import { Server, Socket } from "socket.io";
import { SerialConfigService } from "../services/SerialConfigService";
import { AppSettingsService } from "../services/AppSettingsService";
import { SerialPortService } from "../services/SerialPort";
import { CLIWrapper, type CLIResponse } from "../services/CliWrapper";

const RECONNECT_INTERVAL_MS = 3000;

export class WebSocketServer {
  private io: Server;
  private serialConfigService: SerialConfigService;
  private appSettingsService: AppSettingsService;
  private serialPort: SerialPortService | null = null;
  private cliWrapper: CLIWrapper | null = null;
  private serialDataUnsubscribe: (() => void) | null = null;
  private autoReconnectEnabled = true;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  /** Hàng đợi lệnh CLI: chỉ một lệnh chạy tại một thời điểm, tránh xung đột với getThreadState/getOtConfig/router table/child table từ nhiều nơi. */
  private cliQueue: Promise<void> = Promise.resolve();

  private async executeCommandQueued(command: string): Promise<CLIResponse> {
    if (!this.cliWrapper) throw new Error("CLI not initialized");
    const job = () => this.cliWrapper!.executeCommand(command);
    const promise = this.cliQueue.then(() => job());
    this.cliQueue = promise.then(() => undefined, () => undefined);
    return promise;
  }

  constructor(
    httpServer: HTTPServer,
    serialConfigService: SerialConfigService,
    appSettingsService: AppSettingsService
  ) {
    this.serialConfigService = serialConfigService;
    this.appSettingsService = appSettingsService;

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
      console.log(`[WS] Client connected: ${socket.id}`);

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

      // OpenThread config (panid, channel, networkname) - đọc/ghi qua CLI
      socket.on("ot:getConfig", async () => {
        await this.handleOtGetConfig(socket);
      });
      socket.on("ot:setConfig", async (data: { panid?: string; channel?: number; networkName?: string }) => {
        await this.handleOtSetConfig(socket, data);
      });
      socket.on("ot:getThreadState", async () => {
        await this.handleOtGetThreadState(socket);
      });
      socket.on("ot:setThreadRunning", async (data: { running: boolean }) => {
        await this.handleOtSetThreadRunning(socket, data);
      });
      socket.on("ot:getThreadRunOnConnect", () => {
        const runOnConnect = this.appSettingsService.getThreadRunOnConnect();
        socket.emit("ot:threadRunOnConnect", { runOnConnect });
      });
      socket.on("ot:setThreadRunOnConnect", async (data: { runOnConnect: boolean }) => {
        const runOnConnect = !!data.runOnConnect;
        this.appSettingsService.setThreadRunOnConnect(runOnConnect);
        socket.emit("ot:threadRunOnConnect", { runOnConnect });
        // Nếu serial đang kết nối thì áp dụng ngay: bật/tắt Thread theo preference
        await this.applyThreadRunPreferenceNow(runOnConnect);
      });
      socket.on("ot:getRouterTable", async () => {
        await this.handleOtGetTable(socket, "router table", "ot:routerTable");
      });
      socket.on("ot:getChildTable", async () => {
        await this.handleOtGetTable(socket, "child table", "ot:childTable");
      });

      // Xử lý khi client ngắt kết nối
      socket.on("disconnect", () => {
        console.log(`[WS] Client disconnected: ${socket.id}`);
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
    this.clearReconnectTimer();
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
      this.autoReconnectEnabled = true;
      await this.connectSerialInternal();
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
      this.serialPort.close().catch((err) => console.error("[Serial]", err));
      this.serialPort = null;
    }
    this.cliWrapper = null;

    this.serialPort = new SerialPortService({
      path: config.serialPort,
      baudRate: config.baudRate,
    });

    this.serialPort.setOnDisconnect(() => this.onSerialDisconnected());

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

  /** Serial đóng bất ngờ (rút dây) → lên lịch reconnect */
  private onSerialDisconnected(): void {
    this.serialDataUnsubscribe = null;
    this.serialPort = null;
    this.cliWrapper = null;
    this.io.emit("serial:status", { isConnected: false, path: "", baudRate: 0 });
    this.scheduleReconnect();
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    if (!this.autoReconnectEnabled) return;
    const config = this.serialConfigService.getLatest();
    if (!config) return;
    console.log(`[Serial] Will retry connection in ${RECONNECT_INTERVAL_MS}ms...`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectSerialInternal();
    }, RECONNECT_INTERVAL_MS);
  }

  /** Gọi khi server khởi động: nếu đã có config thì tự kết nối serial */
  async connectSerialIfConfigured(): Promise<void> {
    await this.connectSerialInternal();
  }

  /** Kết nối serial và kiểm tra thiết bị chạy OpenThread (version/state) rồi mới coi là thành công */
  private async connectSerialInternal(): Promise<void> {
    const config = this.serialConfigService.getLatest();
    if (!config) return;
    try {
      if (!this.serialPort || !this.cliWrapper) {
        this.initializeSerialPort(config);
      }
      await this.serialPort!.open();

      let res = await this.executeCommandQueued("version");
      if (!this.isOpenThreadResponse(res, "version")) {
        res = await this.executeCommandQueued("state");
        if (!this.isOpenThreadResponse(res, "state")) {
          if (this.serialDataUnsubscribe) {
            this.serialDataUnsubscribe();
            this.serialDataUnsubscribe = null;
          }
          await this.serialPort!.close();
          this.serialPort = null;
          this.cliWrapper = null;
          console.log("[Serial] Device is not OpenThread, closing port and will retry later.");
          this.io.emit("serial:status", { isConnected: false, path: config.serialPort, baudRate: config.baudRate });
          this.scheduleReconnect();
          return;
        }
      }

      this.clearReconnectTimer();
      this.io.emit("serial:connected", { success: true, status: this.serialPort!.getStatus() });
      this.io.emit("serial:status", this.serialPort!.getStatus());
      console.log("[Serial] Connected (OpenThread):", config.serialPort);
      await this.maybeStartThreadFromPreference();
    } catch (error) {
      console.error("[Serial] Connection failed:", error);
      this.io.emit("serial:status", { isConnected: false, path: config.serialPort, baudRate: config.baudRate });
      this.scheduleReconnect();
    }
  }

  private async handleSerialConnect(socket: Socket): Promise<void> {
    try {
      this.autoReconnectEnabled = true;
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
      this.clearReconnectTimer();
      socket.emit("serial:connected", {
        success: true,
        status: this.serialPort!.getStatus(),
      });
      this.io.emit("serial:status", this.serialPort!.getStatus());
      await this.maybeStartThreadFromPreference();
    } catch (error) {
      socket.emit("serial:error", {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      this.scheduleReconnect();
    }
  }

  private async handleSerialDisconnect(socket: Socket): Promise<void> {
    try {
      this.autoReconnectEnabled = false;
      this.clearReconnectTimer();
      if (this.serialPort) {
        await this.serialPort.close();
        this.serialPort = null;
        this.cliWrapper = null;
        this.serialDataUnsubscribe = null;
        socket.emit("serial:disconnected", { success: true });
        this.io.emit("serial:status", { isConnected: false, path: "", baudRate: 0 });
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
      executor: (command: string) => Promise<CLIResponse>
    ): Promise<{ success: boolean; error?: string }> => {
      let res = await executor("version");
      if (this.isOpenThreadResponse(res, "version")) {
        return { success: true };
      }
      res = await executor("state");
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
        const result = await runTest((cmd) => this.executeCommandQueued(cmd));
        socket.emit("serial:test:result", result);
        return;
      }

      const tempPort = new SerialPortService({ path, baudRate });
      try {
        await tempPort.open();
        const timeoutMs = parseInt(process.env.CLI_TIMEOUT_MS ?? "5000", 10);
        const tempCli = new CLIWrapper(tempPort, { commandPrefix, timeoutMs });
        const result = await runTest((cmd) => tempCli.executeCommand(cmd));
        socket.emit("serial:test:result", result);
      } finally {
        await tempPort.close();
      }
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

  /**
   * Loại dòng log firmware (ESP-IDF: I/E/W/D (timestamp) TAG: msg) khỏi output CLI
   * để tránh nhầm log với kết quả lệnh (vd panid nhận "I (3460) OT_STATE: netif up").
   */
  private filterCliOutput(lines: string[]): string[] {
    const trimmed = lines.map((l) => l.trim()).filter((l) => l && !l.includes(">"));
    // ESP-IDF: I (1234) TAG: message
    const logPattern = /^[IEWD]\s*\(\s*\d+\)/;
    return trimmed.filter((l) => !logPattern.test(l));
  }

  /**
   * Parse output dạng bảng OpenThread (dòng có | cột |, ví dụ router table / child table).
   * Trả về headers và rows; bỏ qua dòng separator (+---+).
   */
  private parseTableOutput(lines: string[]): { headers: string[]; rows: string[][] } {
    const filtered = this.filterCliOutput(lines);
    const tableLines = filtered.filter((l) => l.includes("|"));
    const rows: string[][] = [];
    for (const line of tableLines) {
      const cells = line
        .split("|")
        .map((c) => c.trim())
        .filter((c) => c !== "");
      if (cells.length === 0) continue;
      // Bỏ qua dòng separator chỉ có + - (vd +-----+--------+)
      if (cells.every((c) => /^[-+]+$/.test(c))) continue;
      rows.push(cells);
    }
    if (rows.length === 0) {
      return { headers: [], rows: [] };
    }
    const headers = rows[0];
    const dataRows = rows.slice(1);
    return { headers, rows: dataRows };
  }

  private async handleOtGetTable(
    socket: Socket,
    command: string,
    eventName: "ot:routerTable" | "ot:childTable"
  ): Promise<void> {
    if (!this.cliWrapper || !this.serialPort?.getStatus().isConnected) {
      socket.emit(eventName, { error: "Serial not connected. Connect serial first." });
      return;
    }
    try {
      const res = await this.executeCommandQueued(command);
      const { headers, rows } = this.parseTableOutput(res.output);
      socket.emit(eventName, { headers, rows });
    } catch (error) {
      socket.emit(eventName, {
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  /** Lấy một dòng giá trị từ output CLI: ưu tiên dòng khớp format (panid/channel), nếu không thì dòng đầu sau khi lọc log. */
  private pickValueLine(
    lines: string[],
    options?: { panid?: boolean; channel?: boolean; networkName?: boolean }
  ): string {
    const filtered = this.filterCliOutput(lines);
    if (options?.panid) {
      const match = filtered.find((l) => /^0x[0-9a-fA-F]{1,4}$|^[0-9a-fA-F]{1,4}$/.test(l));
      if (match) return match;
    }
    if (options?.channel) {
      const match = filtered.find((l) => {
        const n = parseInt(l, 10);
        return /^\d+$/.test(l) && !Number.isNaN(n) && n >= 11 && n <= 26;
      });
      if (match) return match;
    }
    if (options?.networkName) {
      // Tên mạng: lấy dòng đầu sau khi đã lọc log (tên có thể là bất kỳ chuỗi nào, kể cả số)
      return filtered[0] ?? "";
    }
    return filtered[0] ?? "";
  }

  /** Cấu hình OpenThread đọc từ thiết bị (panid, channel, networkname, ipaddr, dataset active) */
  private async handleOtGetConfig(socket: Socket): Promise<void> {
    if (!this.cliWrapper || !this.serialPort?.getStatus().isConnected) {
      socket.emit("ot:config", { error: "Serial not connected. Connect serial first." });
      return;
    }
    try {
      const panidRes = await this.executeCommandQueued("panid");
      const channelRes = await this.executeCommandQueued("channel");
      const networkNameRes = await this.executeCommandQueued("networkname");
      const ipaddrRes = await this.executeCommandQueued("ipaddr");
      const datasetRes = await this.executeCommandQueued("dataset active");

      const pickValueLines = (rawLines: string[]): string[] =>
        this.filterCliOutput(rawLines);

      const panid = this.pickValueLine(panidRes.output, { panid: true });
      const channel = this.pickValueLine(channelRes.output, { channel: true });
      const networkName = this.pickValueLine(networkNameRes.output, { networkName: true });
      const ipaddrLines = pickValueLines(ipaddrRes.output);
      const ipaddr = ipaddrLines.length > 0 ? ipaddrLines.join("\n") : undefined;
      const datasetLines = pickValueLines(datasetRes.output);
      const datasetActive = datasetLines.length > 0 ? datasetLines.join("\n") : undefined;

      socket.emit("ot:config", {
        panid,
        channel: channel ? parseInt(channel, 10) : undefined,
        networkName,
        ipaddr,
        datasetActive,
      });
    } catch (error) {
      socket.emit("ot:config", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  /** Validate dữ liệu cấu hình OpenThread trước khi gửi xuống thiết bị */
  private validateOtSetConfig(data: {
    panid?: string;
    channel?: number;
    networkName?: string;
  }): string | null {
    if (data.panid != null && data.panid !== "") {
      const panid = data.panid.trim();
      // OpenThread: PAN ID 16-bit hex, thường 0x0000–0xFFFE
      if (!/^0x[0-9a-fA-F]{1,4}$/.test(panid) && !/^[0-9a-fA-F]{1,4}$/.test(panid)) {
        return "PAN ID không hợp lệ (ví dụ: 0x5938 hoặc 5938)";
      }
      const num = panid.startsWith("0x") ? parseInt(panid.slice(2), 16) : parseInt(panid, 16);
      if (Number.isNaN(num) || num < 0 || num > 0xfffe) {
        return "PAN ID phải trong khoảng 0x0000–0xFFFE";
      }
    }
    if (data.channel != null) {
      const ch = Number(data.channel);
      if (!Number.isInteger(ch) || ch < 11 || ch > 26) {
        return "Channel phải là số nguyên 11–26";
      }
    }
    if (data.networkName != null && data.networkName !== "") {
      const name = data.networkName.trim();
      // OpenThread: network name max 16 bytes
      const bytes = Buffer.byteLength(name, "utf8");
      if (bytes > 16) {
        return "Network Name tối đa 16 byte (UTF-8)";
      }
      if (/[\x00-\x1f\x7f]/.test(name)) {
        return "Network Name không được chứa ký tự điều khiển";
      }
    }
    return null;
  }

  private static readonly THREAD_STATES = ["leader", "router", "child", "detached", "disabled"];

  /** Lấy state Thread hiện tại (leader/router/child/detached/disabled) — không emit */
  private async getCurrentThreadState(): Promise<string> {
    if (!this.cliWrapper) return "";
    const stateRes = await this.executeCommandQueued("state");
    const lines = this.filterCliOutput(stateRes.output);
    const first = (lines[0] ?? "").toLowerCase();
    return WebSocketServer.THREAD_STATES.includes(first) ? first : "";
  }

  /** Lấy panid/channel/networkName hiện tại từ thiết bị — không emit */
  private async getCurrentOtConfig(): Promise<{
    panid: string;
    channel: number | undefined;
    networkName: string;
  }> {
    if (!this.cliWrapper) return { panid: "", channel: undefined, networkName: "" };
    const panidRes = await this.executeCommandQueued("panid");
    const channelRes = await this.executeCommandQueued("channel");
    const networkNameRes = await this.executeCommandQueued("networkname");
    const channelStr = this.pickValueLine(channelRes.output, { channel: true });
    return {
      panid: this.pickValueLine(panidRes.output, { panid: true }),
      channel: channelStr ? parseInt(channelStr, 10) : undefined,
      networkName: this.pickValueLine(networkNameRes.output, { networkName: true }),
    };
  }

  /** So sánh giá trị mới với hiện tại — có thay đổi không (chỉ xét các field user gửi) */
  private otConfigHasChange(
    data: { panid?: string; channel?: number; networkName?: string },
    current: { panid: string; channel: number | undefined; networkName: string }
  ): boolean {
    const normPanid = (s: string) => {
      const t = s.trim().toLowerCase();
      if (t.startsWith("0x")) return parseInt(t.slice(2), 16);
      return parseInt(t, 16);
    };
    if (data.panid != null && data.panid !== "") {
      const a = normPanid(data.panid);
      const b = current.panid ? normPanid(current.panid) : NaN;
      if (Number.isNaN(a) !== Number.isNaN(b) || a !== b) return true;
    }
    if (data.channel != null && data.channel >= 11 && data.channel <= 26) {
      if (current.channel === undefined || data.channel !== current.channel) return true;
    }
    if (data.networkName != null && data.networkName !== "") {
      if ((data.networkName.trim() || "") !== (current.networkName || "")) return true;
    }
    return false;
  }

  /** Ghi cấu hình OpenThread xuống thiết bị */
  private async handleOtSetConfig(
    socket: Socket,
    data: { panid?: string; channel?: number; networkName?: string }
  ): Promise<void> {
    if (!this.cliWrapper || !this.serialPort?.getStatus().isConnected) {
      socket.emit("ot:setConfig:result", { success: false, error: "Serial not connected." });
      return;
    }
    const validationError = this.validateOtSetConfig(data);
    if (validationError) {
      socket.emit("ot:setConfig:result", { success: false, error: validationError });
      return;
    }
    try {
      const current = await this.getCurrentOtConfig();
      if (!this.otConfigHasChange(data, current)) {
        socket.emit("ot:setConfig:result", { success: true });
        return;
      }
      const stateLine = await this.getCurrentThreadState();
      const isThreadRunning = ["detached", "child", "router", "leader"].includes(stateLine);
      if (isThreadRunning) {
        await this.executeCommandQueued("thread stop");
        await this.executeCommandQueued("ifconfig down");
        console.log("[Serial] Thread stop + ifconfig down (trước khi set config)");
      }
      if (data.panid != null && data.panid !== "") {
        const res = await this.executeCommandQueued(`panid ${data.panid.trim()}`);
        if (!res.success) {
          socket.emit("ot:setConfig:result", { success: false, error: res.error ?? "panid failed" });
          return;
        }
      }
      if (data.channel != null && data.channel >= 11 && data.channel <= 26) {
        const res = await this.executeCommandQueued(`channel ${data.channel}`);
        if (!res.success) {
          socket.emit("ot:setConfig:result", { success: false, error: res.error ?? "channel failed" });
          return;
        }
      }
      if (data.networkName != null && data.networkName !== "") {
        const escaped = data.networkName.replace(/ /g, "\\ ");
        const res = await this.executeCommandQueued(`networkname ${escaped}`);
        if (!res.success) {
          socket.emit("ot:setConfig:result", { success: false, error: res.error ?? "networkname failed" });
          return;
        }
      }
      // Áp dụng dataset (panid/channel/networkname) thành Active Dataset
      const commitRes = await this.executeCommandQueued("dataset commit active");
      if (!commitRes.success) {
        socket.emit("ot:setConfig:result", { success: false, error: commitRes.error ?? "dataset commit active failed" });
        return;
      }
      console.log("[Serial] dataset commit active — OK");
      if (this.appSettingsService.getThreadRunOnConnect()) {
        await this.maybeStartThreadFromPreference();
      }
      socket.emit("ot:setConfig:result", { success: true });
    } catch (error) {
      socket.emit("ot:setConfig:result", {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  /** Lấy trạng thái Thread đang chạy hay tắt (chỉ leader/router/child/detached = đang chạy) */
  private async handleOtGetThreadState(socket: Socket): Promise<void> {
    if (!this.cliWrapper || !this.serialPort?.getStatus().isConnected) {
      socket.emit("ot:threadState", { error: "Serial not connected. Connect serial first." });
      return;
    }
    try {
      const stateRes = await this.executeCommandQueued("state");
      const lines = stateRes.output
        .map((l) => l.trim())
        .filter((l) => l && !l.includes(">"));
      const stateLine = (lines[0] ?? "").toLowerCase();
      // Chuẩn OpenThread: chỉ 4 state này = Thread đang chạy; disabled hoặc chuỗi lạ = tắt
      const running = ["detached", "child", "router", "leader"].includes(stateLine);
      socket.emit("ot:threadState", { running, state: stateLine || undefined });
      // ESP reset → state disabled nhưng preference "tự chạy" bật → tự chạy lại thread
      if (stateLine === "disabled" && this.appSettingsService.getThreadRunOnConnect()) {
        this.maybeStartThreadFromPreference().catch((err) =>
          console.warn("[Serial] Auto-restart Thread after disabled failed:", err)
        );
      }
    } catch (error) {
      socket.emit("ot:threadState", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  /** Bật hoặc tắt Thread (ifconfig up → thread start / thread stop → ifconfig down) */
  private async handleOtSetThreadRunning(
    socket: Socket,
    data: { running: boolean }
  ): Promise<void> {
    if (!this.cliWrapper || !this.serialPort?.getStatus().isConnected) {
      socket.emit("ot:setThreadRunning:result", { success: false, error: "Serial not connected." });
      return;
    }
    try {
      if (data.running) {
        const resUp = await this.executeCommandQueued("ifconfig up");
        if (!resUp.success) {
          socket.emit("ot:setThreadRunning:result", { success: false, error: resUp.error ?? "ifconfig up failed" });
          return;
        }
        const res = await this.executeCommandQueued("thread start");
        if (!res.success) {
          socket.emit("ot:setThreadRunning:result", { success: false, error: res.error ?? "thread start failed" });
          return;
        }
      } else {
        const res = await this.executeCommandQueued("thread stop");
        if (!res.success) {
          socket.emit("ot:setThreadRunning:result", { success: false, error: res.error ?? "thread stop failed" });
          return;
        }
        await this.executeCommandQueued("ifconfig down");
      }
      socket.emit("ot:setThreadRunning:result", { success: true });
    } catch (error) {
      socket.emit("ot:setThreadRunning:result", {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  /** Sau khi serial connect: nếu preference "tự chạy Thread" bật thì ifconfig up → thread start */
  private async maybeStartThreadFromPreference(): Promise<void> {
    if (!this.cliWrapper || !this.serialPort?.getStatus().isConnected) return;
    if (!this.appSettingsService.getThreadRunOnConnect()) return;
    try {
      await this.executeCommandQueued("ifconfig up");
      await this.executeCommandQueued("thread start");
      console.log("[Serial] Auto-started Thread (preference: run on connect)");
    } catch (err) {
      console.warn("[Serial] Auto thread start failed:", err);
    }
  }

  /** Áp dụng preference "tự chạy Thread" ngay khi user bật/tắt checkbox (serial đã connect) */
  private async applyThreadRunPreferenceNow(runOnConnect: boolean): Promise<void> {
    if (!this.cliWrapper || !this.serialPort?.getStatus().isConnected) return;
    try {
      if (runOnConnect) {
        await this.executeCommandQueued("ifconfig up");
        await this.executeCommandQueued("thread start");
        console.log("[Serial] Applied thread preference: ifconfig up, thread start");
      } else {
        await this.executeCommandQueued("thread stop");
        await this.executeCommandQueued("ifconfig down");
        console.log("[Serial] Applied thread preference: thread stop, ifconfig down");
      }
    } catch (err) {
      console.warn("[Serial] Apply thread preference failed:", err);
    }
  }

  /** Sau khi áp dụng cấu hình (dataset commit active): restart Thread (stop → ifconfig down; nếu preference bật: ifconfig up → start) */
  private async restartThreadFromPreference(): Promise<void> {
    if (!this.cliWrapper || !this.serialPort?.getStatus().isConnected) return;
    try {
      await this.executeCommandQueued("thread stop");
      await this.executeCommandQueued("ifconfig down");
      console.log("[Serial] thread stop, ifconfig down (restart after config apply)");
      if (this.appSettingsService.getThreadRunOnConnect()) {
        await this.executeCommandQueued("ifconfig up");
        await this.executeCommandQueued("thread start");
        console.log("[Serial] ifconfig up, thread start (restart after config apply)");
      }
    } catch (err) {
      console.warn("[Serial] Restart thread after config apply failed:", err);
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

      const response = await this.executeCommandQueued(command.trim());

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
    this.autoReconnectEnabled = false;
    this.clearReconnectTimer();
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
