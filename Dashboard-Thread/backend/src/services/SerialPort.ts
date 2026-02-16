/**
 * SerialPort Service - Quản lý kết nối UART với ESP32-H2 ot-br
 */

import { SerialPort } from "serialport";
import { ReadlineParser } from "@serialport/parser-readline";

export interface SerialPortConfig {
  path: string;
  baudRate: number;
}

export class SerialPortService {
  private port: SerialPort | null = null;
  private parser: ReadlineParser | null = null;
  private config: SerialPortConfig;
  private isConnected: boolean = false;
  private dataBuffer: string[] = [];
  private dataListeners: Set<(data: string) => void> = new Set();
  private closedByUs: boolean = false;
  private onDisconnectCallback: (() => void) | null = null;

  constructor(config: SerialPortConfig) {
    this.config = config;
  }

  /** Gọi khi port đóng bất ngờ (rút dây, lỗi) – không gọi khi close() chủ động */
  setOnDisconnect(cb: () => void): void {
    this.onDisconnectCallback = cb;
  }

  /**
   * Mở kết nối serial port
   */
  async open(): Promise<void> {
    if (this.isConnected && this.port?.isOpen) {
      return;
    }

    this.closedByUs = false;

    return new Promise((resolve, reject) => {
      try {
        this.port = new SerialPort({
          path: this.config.path,
          baudRate: this.config.baudRate,
          autoOpen: false,
        });

        // Parser để đọc từng dòng
        this.parser = this.port.pipe(new ReadlineParser({ delimiter: "\n" }));

        // Lắng nghe dữ liệu từ serial
        this.parser.on("data", (data: string) => {
          const line = data.toString().trim();
          if (line) {
            // Log raw data để debug (có thể comment lại sau)
            console.log(`[Serial] RX: ${line}`);
            
            // Giới hạn buffer size để tránh memory leak
            if (this.dataBuffer.length > 1000) {
              this.dataBuffer.shift();
            }
            this.dataBuffer.push(line);
            
            // Thông báo cho các listener
            this.dataListeners.forEach((listener) => listener(line));
          }
        });

        const triggerDisconnect = () => {
          this.isConnected = false;
          this.port = null;
          this.parser = null;
          this.dataListeners.clear();
          this.dataBuffer = [];
          if (!this.closedByUs && this.onDisconnectCallback) {
            this.onDisconnectCallback();
          }
        };

        // Xử lý lỗi (rút dây, lỗi phần cứng)
        this.port.on("error", (err) => {
          console.error("[Serial] Port error:", err);
          triggerDisconnect();
          reject(err);
        });

        // Xử lý khi port đóng (rút dây hoặc close chủ động)
        this.port.on("close", () => {
          console.log("[Serial] Port closed");
          triggerDisconnect();
        });

        // Mở port
        this.port.open((err) => {
          if (err) {
            console.error("[Serial] Failed to open port:", err);
            this.isConnected = false;
            reject(err);
          } else {
            console.log(`[Serial] Port opened: ${this.config.path} @ ${this.config.baudRate} baud`);
            this.isConnected = true;
            resolve();
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Đóng kết nối serial port
   */
  async close(): Promise<void> {
    return new Promise((resolve) => {
      this.closedByUs = true;
      this.dataListeners.clear();
      this.dataBuffer = [];

      if (!this.port || !this.port.isOpen) {
        this.isConnected = false;
        this.port = null;
        this.parser = null;
        resolve();
        return;
      }

      this.port.close((err) => {
        if (err) {
          console.error("[Serial] Error closing port:", err);
        }
        this.isConnected = false;
        this.port = null;
        this.parser = null;
        resolve();
      });
    });
  }

  /**
   * Gửi dữ liệu qua serial port
   */
  async write(data: string): Promise<void> {
    if (!this.port || !this.port.isOpen) {
      throw new Error("Serial port is not open");
    }

    // Log command để debug
    console.log(`[Serial] TX: ${data}`);

    return new Promise((resolve, reject) => {
      this.port!.write(data + "\r\n", (err) => {
        if (err) {
          reject(err);
        } else {
          // Đợi dữ liệu được gửi đi
          this.port!.drain(() => {
            resolve();
          });
        }
      });
    });
  }

  /**
   * Đọc dữ liệu từ buffer (non-blocking)
   */
  readBuffer(): string[] {
    const data = [...this.dataBuffer];
    this.dataBuffer = [];
    return data;
  }

  /**
   * Đăng ký listener để nhận dữ liệu realtime
   */
  onData(listener: (data: string) => void): () => void {
    this.dataListeners.add(listener);
    // Trả về hàm unsubscribe
    return () => {
      this.dataListeners.delete(listener);
    };
  }

  /**
   * Kiểm tra trạng thái kết nối
   */
  getStatus(): {
    isConnected: boolean;
    path: string;
    baudRate: number;
  } {
    return {
      isConnected: this.isConnected && this.port?.isOpen === true,
      path: this.config.path,
      baudRate: this.config.baudRate,
    };
  }
}
