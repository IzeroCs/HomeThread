import { TransportTcp } from "../transport/tcp.transport"

export type BrConnectionStatus = { isConnected: boolean; host?: string; port?: number }

export class BrConnection {
  private transport = new TransportTcp()

  open(config: { host: string; port: number }): Promise<void> {
    return this.transport.open(config)
  }

  close(): Promise<void> {
    return this.transport.close()
  }

  writeRaw(buffer: Buffer): Promise<void> {
    return this.transport.writeRaw(buffer)
  }

  onRawData(listener: (chunk: Buffer) => void): () => void {
    return this.transport.onRawData(listener)
  }

  setOnDisconnect(cb: () => void): void {
    this.transport.setOnDisconnect(cb)
  }

  getStatus(): BrConnectionStatus {
    return this.transport.getStatus()
  }
}

