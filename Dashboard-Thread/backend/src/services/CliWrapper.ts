/**
 * CLI Wrapper - Gửi lệnh OpenThread CLI và parse response
 */

import { SerialPortService } from "./SerialPort";

export interface CLIResponse {
  success: boolean;
  output: string[];
  error?: string;
}

export interface CLIWrapperConfig {
  commandPrefix?: string;
  timeoutMs?: number;
  /** Delay (ms) sau mỗi lệnh trước khi lệnh tiếp theo — tránh thiết bị tràn buffer */
  delayAfterMs?: number;
}

export class CLIWrapper {
  private serialPort: SerialPortService;
  private timeoutMs: number;
  private commandPrefix: string;
  private delayAfterMs: number;

  constructor(
    serialPort: SerialPortService,
    config: CLIWrapperConfig | number = 5000
  ) {
    this.serialPort = serialPort;

    // Hỗ trợ cả cách cũ (chỉ timeout) và cách mới (config object)
    if (typeof config === "number") {
      this.timeoutMs = config;
      this.commandPrefix = "ot";
      this.delayAfterMs = 300;
    } else {
      this.timeoutMs = config.timeoutMs ?? 5000;
      this.commandPrefix = config.commandPrefix ?? "ot";
      this.delayAfterMs = config.delayAfterMs ?? 300;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Gửi lệnh CLI và chờ response
   * Format OpenThread CLI:
   *   > command
   *   output line 1
   *   output line 2
   *   Done
   *   >
   */
  async executeCommand(command: string): Promise<CLIResponse> {
    if (!this.serialPort.getStatus().isConnected) {
      throw new Error("Serial port is not connected");
    }

    // Xóa buffer cũ
    this.serialPort.readBuffer();

    // Đăng ký listener để thu thập response
    const responseLines: string[] = [];
    const unsubscribe = this.serialPort.onData((line) => {
      responseLines.push(line);
    });

    try {
      // Thêm tiền tố vào lệnh nếu có
      const prefix = this.commandPrefix;
      const fullCommand = prefix ? `${prefix} ${command}` : command;

      // Gửi lệnh
      await this.serialPort.write(fullCommand);

      // Chờ response với timeout
      const response = await this.waitForResponse(responseLines);

      unsubscribe();
      await this.delay(this.delayAfterMs);
      return response;
    } catch (error) {
      unsubscribe();
      throw error;
    }
  }

  /**
   * Gửi một lệnh với prefix tạm thời (vd. fallback "ot" khi prefix trong config không được nhận).
   */
  async executeCommandWithPrefix(command: string, overridePrefix: string): Promise<CLIResponse> {
    if (!this.serialPort.getStatus().isConnected) {
      throw new Error("Serial port is not connected");
    }
    this.serialPort.readBuffer();
    const responseLines: string[] = [];
    const unsubscribe = this.serialPort.onData((line) => {
      responseLines.push(line);
    });
    try {
      const fullCommand = overridePrefix ? `${overridePrefix} ${command}` : command;
      await this.serialPort.write(fullCommand);
      const response = await this.waitForResponse(responseLines);
      unsubscribe();
      await this.delay(this.delayAfterMs);
      return response;
    } catch (error) {
      unsubscribe();
      throw error;
    }
  }

  /**
   * Chờ response từ CLI với timeout
   * Response kết thúc khi thấy "Done" hoặc "Error"
   */
  private async waitForResponse(
    responseLines: string[]
  ): Promise<CLIResponse> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const checkInterval = 50; // Check mỗi 50ms
      let promptTimeout: NodeJS.Timeout | null = null;

      const cleanup = () => {
        if (promptTimeout) {
          clearTimeout(promptTimeout);
          promptTimeout = null;
        }
      };

      const checkResponse = setInterval(() => {
        const elapsed = Date.now() - startTime;

        // Kiểm tra timeout
        if (elapsed > this.timeoutMs) {
          cleanup();
          clearInterval(checkResponse);
          reject(
            new Error(
              `CLI command timeout after ${this.timeoutMs}ms. Response so far: ${responseLines.join("\n")}`
            )
          );
          return;
        }

        // Tìm "Done" hoặc "Error" trong response
        const doneIndex = responseLines.findIndex((line) =>
          line.trim().toLowerCase().startsWith("done")
        );
        const errorIndex = responseLines.findIndex((line) =>
          line.trim().toLowerCase().startsWith("error")
        );

        if (doneIndex !== -1) {
          cleanup();
          clearInterval(checkResponse);
          // Lấy output từ sau lệnh đến trước "Done"
          const output = responseLines.slice(0, doneIndex);
          resolve({
            success: true,
            output: output.filter((line) => line.trim() !== ""),
          });
          return;
        }

        if (errorIndex !== -1) {
          cleanup();
          clearInterval(checkResponse);
          // Lấy error message
          const errorLine = responseLines[errorIndex];
          const output = responseLines.slice(0, errorIndex);
          resolve({
            success: false,
            output: output.filter((line) => line.trim() !== ""),
            error: errorLine,
          });
          return;
        }

        // Kiểm tra nếu có prompt "> " ở cuối (có thể là prompt mới sau khi command xong)
        const lastLine = responseLines[responseLines.length - 1];
        if (lastLine && lastLine.trim() === ">") {
          // Có thể command đã xong nhưng không có "Done"
          // Đợi thêm một chút để chắc chắn không còn dữ liệu
          if (!promptTimeout) {
            promptTimeout = setTimeout(() => {
              cleanup();
              clearInterval(checkResponse);
              const output = responseLines.filter(
                (line) => line.trim() !== "" && line.trim() !== ">"
              );
              resolve({
                success: true,
                output,
              });
            }, 200);
          }
          return;
        }
      }, checkInterval);
    });
  }

  /**
   * Kiểm tra kết nối bằng cách gửi lệnh đơn giản
   */
  async ping(): Promise<boolean> {
    try {
      const response = await this.executeCommand("state");
      return response.success;
    } catch (error) {
      return false;
    }
  }
}
