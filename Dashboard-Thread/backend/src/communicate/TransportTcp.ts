/**
 * TransportTcp - Kết nối TCP tới BR (frame protocol qua socket)
 * Thay SerialPort; host có thể hostname (vd. Thread-Host.local) hoặc IP.
 */

import * as net from "net";
import { serialLogger } from "../utils/logger";

export interface TransportTcpConfig {
  host: string;
  port: number;
}

export class TransportTcp {
  private socket: net.Socket | null = null;
  private config: TransportTcpConfig | null = null;
  private isConnected = false;
  private rawListeners: Set<(chunk: Buffer) => void> = new Set();
  private closedByUs = false;
  private onDisconnectCallback: (() => void) | null = null;

  /** Gọi khi socket đóng bất ngờ (BR tắt, mất mạng) – không gọi khi close() chủ động */
  setOnDisconnect(cb: () => void): void {
    this.onDisconnectCallback = cb;
  }

  /**
   * Mở kết nối TCP tới host:port
   * host có thể là hostname (vd. Thread-Host.local) hoặc IP; Node resolve DNS.
   */
  async open(config: TransportTcpConfig): Promise<void> {
    if (this.socket?.writable) {
      return;
    }

    this.closedByUs = false;
    this.config = config;

    return new Promise((resolve, reject) => {
      const sock = net.createConnection(
        { host: config.host, port: config.port },
        () => {
          this.isConnected = true;
          serialLogger.info(`TCP connected: ${config.host}:${config.port}`);
          resolve();
        }
      );

      sock.on("data", (chunk: Buffer) => {
        this.rawListeners.forEach((listener) => listener(chunk));
      });

      const triggerDisconnect = () => {
        this.isConnected = false;
        this.socket = null;
        this.rawListeners.clear();
        if (!this.closedByUs && this.onDisconnectCallback) {
          this.onDisconnectCallback();
        }
      };

      sock.on("error", (err) => {
        serialLogger.error(`TCP error (${config.host}:${config.port}): ${err?.message ?? err}`);
        triggerDisconnect();
        if (!this.closedByUs) reject(err);
      });

      sock.on("close", () => {
        serialLogger.info(`TCP closed: ${config.host}:${config.port}`);
        triggerDisconnect();
      });

      sock.on("end", () => {
        triggerDisconnect();
      });

      this.socket = sock;
    });
  }

  async close(): Promise<void> {
    this.closedByUs = true;
    this.rawListeners.clear();

    if (!this.socket) {
      this.isConnected = false;
      this.config = null;
      return;
    }

    return new Promise((resolve) => {
      const sock = this.socket;
      this.socket = null;
      this.isConnected = false;
      this.config = null;

      if (sock.destroyed) {
        resolve();
        return;
      }

      sock.once("close", () => resolve());
      sock.destroy();
    });
  }

  /**
   * Gửi raw bytes (frame protocol)
   */
  async writeRaw(buffer: Buffer): Promise<void> {
    if (!this.socket?.writable) {
      throw new Error("TCP socket is not open");
    }
    return new Promise((resolve, reject) => {
      this.socket!.write(buffer, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Đăng ký listener nhận raw bytes (trả về hàm unsubscribe)
   */
  onRawData(listener: (chunk: Buffer) => void): () => void {
    this.rawListeners.add(listener);
    return () => this.rawListeners.delete(listener);
  }

  getStatus(): { isConnected: boolean; host?: string; port?: number } {
    return {
      isConnected: this.isConnected && this.socket?.writable === true,
      host: this.config?.host,
      port: this.config?.port,
    };
  }
}
