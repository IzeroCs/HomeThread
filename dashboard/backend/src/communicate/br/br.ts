/**
 * BrManager - Facade: điểm vào duy nhất cho BR.
 * Delegate xuống BrConnection + BrCommand + BrSession.
 */

import { BrConnectionConfigService } from "@settings/br-connection.service"
import { AppSettingsService } from "@settings/app-settings.service"
import { BrConnection } from "./br.connection"
import { BrCommand } from "./br.command"
import { BrSession, type OnBroadcast } from "./br.session"
import type { OtConfig as OtConfigShape } from "@thread/thread.config"
import type { ThreadState, TableData } from "@thread/thread.data"
import type { ConnectionStatus } from "shared/src/types"

export type { OtConfig } from "@thread/thread.config"
export type { ThreadState, TableData } from "@thread/thread.data"
export type { ConnectionStatus }
export type { OnBroadcast }

export class BrManager {
  private session: BrSession

  constructor(
    brConnectionConfigService: BrConnectionConfigService,
    appSettingsService: AppSettingsService,
    onBroadcast?: OnBroadcast,
  ) {
    const connection = new BrConnection()
    const command = new BrCommand({
      writeRaw: (buf) => connection.writeRaw(buf),
      broadcast: (event, data) => onBroadcast?.(event, data),
      // Will be re-wired by BrSession on connect
      onAckDataToConfig: () => {},
      onNotify: () => {},
    })

    this.session = new BrSession({
      brConnectionConfigService,
      appSettingsService,
      connection,
      command,
      onBroadcast,
    })
  }

  setOnBroadcast(cb: OnBroadcast | null): void {
    this.session.setOnBroadcast(cb)
  }

  getStatus(): ConnectionStatus {
    return this.session.getStatus()
  }

  getLastThreadState(): ThreadState {
    return this.session.getLastThreadState()
  }

  getLastOtConfig(): OtConfigShape | null {
    return this.session.getLastOtConfig()
  }

  getLastRouterTable(): TableData {
    return this.session.getLastRouterTable()
  }

  getLastChildTable(): TableData {
    return this.session.getLastChildTable()
  }

  getLastJoinerTable(): TableData {
    return this.session.getLastJoinerTable()
  }

  connect(): Promise<void> {
    return this.session.connect()
  }

  disconnect(): Promise<void> {
    return this.session.disconnect()
  }

  connectIfConfigured(): Promise<void> {
    return this.session.connectIfConfigured()
  }

  resetTransport(): Promise<void> {
    return this.session.resetTransport()
  }

  testConnection(host: string, port: number): Promise<{ success: boolean; error?: string }> {
    return this.session.testConnection(host, port)
  }

  fetchOtConfig(): Promise<OtConfigShape> {
    return this.session.fetchOtConfig()
  }

  sendPullRequest(
    cmd: number,
    data?: Buffer,
  ): Promise<{ ack: boolean; data?: Buffer; errorCode?: number }> {
    return this.session.sendPullRequest(cmd, data)
  }

  setPanid(panid: string): Promise<{ ack: boolean; errorCode?: number }> {
    return this.session.setPanid(panid)
  }

  setChannel(channel: number): Promise<{ ack: boolean; errorCode?: number }> {
    return this.session.setChannel(channel)
  }

  setNetworkName(networkName: string): Promise<{ ack: boolean; errorCode?: number }> {
    return this.session.setNetworkName(networkName)
  }

  setExtendedPanid(extendedPanId: string): Promise<{ ack: boolean; errorCode?: number }> {
    return this.session.setExtendedPanid(extendedPanId)
  }

  setNetworkKey(networkKey: string): Promise<{ ack: boolean; errorCode?: number }> {
    return this.session.setNetworkKey(networkKey)
  }

  reset(): Promise<{ ack: boolean; errorCode?: number }> {
    return this.session.reset()
  }

  factoryReset(): Promise<{ ack: boolean; errorCode?: number }> {
    return this.session.factoryReset()
  }

  startThread(): Promise<{ ack: boolean; errorCode?: number }> {
    return this.session.startThread()
  }

  stopThread(): Promise<{ ack: boolean; errorCode?: number }> {
    return this.session.stopThread()
  }

  getThreadVersion(): Promise<{ ack: boolean; data?: Buffer; errorCode?: number }> {
    return this.session.getThreadVersion()
  }

  commissionerJoiner(
    eui64: string,
    pskd: string,
    timeoutSeconds: number,
  ): Promise<{ ack: boolean; errorCode?: number }> {
    return this.session.commissionerJoiner(eui64, pskd, timeoutSeconds)
  }

  srpRegister(
    hostname: string,
    backendIPv6: string,
    port: number,
  ): Promise<{ ack: boolean; errorCode?: number }> {
    return this.session.srpRegister(hostname, backendIPv6, port)
  }

  shutdown(): void {
    this.session.shutdown()
  }
}

