/**
 * SerialPort Service - Quản lý kết nối UART với ESP32-H2 ot-br
 */

import { SerialPort } from "serialport";
import { serialLogger } from "../utils/logger";

export interface SerialPortConfig {
  path: string;
  baudRate: number;
}

export class SerialPortService {
  private port: SerialPort | null = null;
  private config: SerialPortConfig;
  private isConnected: boolean = false;
  private rawListeners: Set<(chunk: Buffer) => void> = new Set();
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

        this.port.on("data", (chunk: Buffer) => {
          this.rawListeners.forEach((listener) => listener(chunk));
        });

        const triggerDisconnect = () => {
          this.isConnected = false;
          this.port = null;
          this.rawListeners.clear();
          if (!this.closedByUs && this.onDisconnectCallback) {
            this.onDisconnectCallback();
          }
        };

        // Xử lý lỗi (rút dây, lỗi phần cứng, ESP reset re-enumerate USB)
        this.port.on("error", (err) => {
          serialLogger.error(`Port error (rút dây / ESP reset?): ${err?.message ?? err}`);
          triggerDisconnect();
          reject(err);
        });

        // Xử lý khi port đóng (rút dây, ESP reset, hoặc close chủ động)
        this.port.on("close", () => {
          serialLogger.info("Port closed — device disconnected or ESP reset.");
          triggerDisconnect();
        });

        // Mở port
        this.port.open((err) => {
          if (err) {
            serialLogger.error(`Failed to open port: ${err?.message ?? err}`);
            this.isConnected = false;
            reject(err);
          } else {
            serialLogger.info(`Port opened: ${this.config.path} @ ${this.config.baudRate} baud`);
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
      this.rawListeners.clear();

      if (!this.port || !this.port.isOpen) {
        this.isConnected = false;
        this.port = null;
        resolve();
        return;
      }

      this.port.close((err) => {
        if (err) {
          serialLogger.error(`Error closing port: ${err?.message ?? err}`);
        }
        this.isConnected = false;
        this.port = null;
        resolve();
      });
    });
  }

  /**
   * Gửi raw bytes (định dạng frame). Không thêm \r\n.
   */
  async writeRaw(buffer: Buffer): Promise<void> {
    if (!this.port || !this.port.isOpen) {
      throw new Error("Serial port is not open");
    }
    const isFrame = buffer.length >= 7 && buffer[0] === 0xaa && buffer[buffer.length - 1] === 0x55;
    if (!isFrame) {
      serialLogger.info(`TX raw (${buffer.length} bytes): ${buffer.toString("hex")}`);
    }
    return new Promise((resolve, reject) => {
      this.port!.write(buffer, (err) => {
        if (err) reject(err);
        else this.port!.drain(() => resolve());
      });
    });
  }

  /**
   * Đăng ký listener để nhận raw bytes (định dạng frame).
   */
  onRawData(listener: (chunk: Buffer) => void): () => void {
    this.rawListeners.add(listener);
    return () => this.rawListeners.delete(listener);
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
