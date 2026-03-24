import { BrConnection } from "./br.connection"
import { BrCommand, type AckDataConfig } from "./br.command"
import { FrameParser, type ParsedFrame } from "../frame"
import { logger } from "@namorix/core-backend"
import { BrConnectionConfigService } from "@settings/br-connection.service"
import { AppSettingsService } from "@settings/app-settings.service"
import { getPreferredBackendIPv6 } from "@utils/ipv6.util"
import { ENV } from "../../env"
import { DEVICE_ROLE, DEVICE_ROLE_NAMES } from "@thread/thread-role"
import type { DeviceRole } from "@thread/thread-role"
import { OtConfigStore, type OtConfig as OtConfigShape } from "@thread/thread.config"
import { ThreadData, type ThreadState, type TableData } from "@thread/thread.data"
import { ThreadPolling } from "@thread/thread.polling"
import { persistBrTopology } from "@thread/br-topology-persist"
import { upsertDeviceInfo as repoUpsertDeviceInfo, getBrDeviceId } from "@database/repositories/device.repository"
import { upsertBrHealth } from "@database/repositories/device-health.repository"
import { parseBrHealthPayload } from "./br.command"
import { parseRouterTable, parseChildTable, parseJoinerTable, parseRouterEntries, parseChildEntries } from "../frame"
import type { RouterEntry, ChildEntry } from "../frame"
import { EVENTS, type EventName } from "shared/src/events"
import type { ConnectionStatus } from "shared/src/types"

const RECONNECT_INTERVAL_MS = 3000
/** STATE 5 lần không có phản hồi (bất kỳ frame từ leader) thì đóng port và reconnect. */
const STATE_WITHOUT_RESPONSE_LIMIT = 5
const transportLogger = logger.child("Transport")

export type OnBroadcast = (event: EventName, data?: unknown) => void

export type BrSessionDeps = {
  brConnectionConfigService: BrConnectionConfigService
  appSettingsService: AppSettingsService
  connection: BrConnection
  command: BrCommand
  onBroadcast?: OnBroadcast
}

export class BrSession {
  private brConnectionConfigService: BrConnectionConfigService
  private appSettingsService: AppSettingsService
  private connection: BrConnection
  private command: BrCommand
  private onBroadcast: OnBroadcast | null = null

  private frameParser = new FrameParser()
  private frameUnsubscribe: (() => void) | null = null

  private autoReconnectEnabled = true
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private stateWithoutResponseCount = 0

  private otConfig = new OtConfigStore()
  private threadData = new ThreadData()
  private pollingManager = new ThreadPolling({
    fetchRouterTable: () => this.fetchRouterTable(),
    fetchChildTable: () => this.fetchChildTable(),
    fetchJoinerTable: () => this.fetchJoinerTable(),
  })

  private stateIntervalId: ReturnType<typeof setInterval> | null = null
  /** Keep polling STATE only. */
  private static readonly STATE_INTERVAL_MS = 5000
  private brHealthIntervalId: ReturnType<typeof setInterval> | null = null
  private static readonly BR_HEALTH_POLL_MS = 60_000

  private notifyDebounceTimeoutId: ReturnType<typeof setTimeout> | null = null
  private notifyPendingMask = 0

  private lastRoleByte: number | null = null
  private connectedThisSession = false
  private borderRouterMacHex: string | null = null

  constructor(deps: BrSessionDeps) {
    this.brConnectionConfigService = deps.brConnectionConfigService
    this.appSettingsService = deps.appSettingsService
    this.connection = deps.connection
    this.command = deps.command
    this.onBroadcast = deps.onBroadcast ?? null

    this.command = deps.command
    this.connection.setOnDisconnect(() => this.onTransportDisconnected())
  }

  setOnBroadcast(cb: OnBroadcast | null): void {
    this.onBroadcast = cb
  }

  private broadcast(event: EventName, data?: unknown): void {
    this.onBroadcast?.(event, data)
  }

  getStatus(): ConnectionStatus {
    return this.connection.getStatus()
  }

  getLastThreadState(): ThreadState {
    return this.threadData.getThreadState()
  }

  getLastOtConfig(): OtConfigShape | null {
    return this.otConfig.get()
  }

  getLastRouterTable(): TableData {
    return this.threadData.getRouterTable()
  }

  getLastChildTable(): TableData {
    return this.threadData.getChildTable()
  }

  getLastJoinerTable(): TableData {
    return this.threadData.getJoinerTable()
  }

  private attachFramePipeline(): void {
    if (this.frameUnsubscribe) {
      this.frameUnsubscribe()
      this.frameUnsubscribe = null
    }
    this.frameParser.reset()

    // Wire command callbacks for this session
    ;(this.command as unknown as { callbacks?: unknown }).callbacks = undefined

    // Recreate a command instance is expensive; instead we rely on the existing BrCommand callbacks wiring
    // via a lightweight wrapper below.
    const command = this.command
    const applyAck = (partial: AckDataConfig) => {
      this.otConfig.update(partial)
      this.broadcast(EVENTS.OT_CONFIG, this.otConfig.get())
    }

    // Patch in callbacks by creating a new BrCommand bound to this connection.
    // This keeps BrCommand stateless regarding transport and allows us to swap transport on reconnect.
    this.command = new BrCommand({
      writeRaw: (buf) => this.connection.writeRaw(buf),
      broadcast: (event, data) => this.broadcast(event, data),
      onAckDataToConfig: applyAck,
      onNotify: (changedMask) => this.onThreadHostNotify(changedMask),
    })
    // Preserve nextFrameId/pending map? We intentionally reset per reconnect to avoid dangling promises.
    command.clearPending?.()

    this.frameUnsubscribe = this.connection.onRawData((chunk: Buffer) => {
      this.broadcast(EVENTS.BR_DATA, chunk.toString("hex"))
      this.frameParser.push(
        chunk,
        (frame: ParsedFrame) => {
          this.stateWithoutResponseCount = 0
          this.command.handle(frame)
        },
        (bytes, reason) => {
          const text = bytes
            .toString("utf8")
            .replace(/[\r\n]+/g, " ")
            .trim()
          transportLogger.info(`RX (lỗi: ${reason}): ${bytes.length} bytes ${text}`)
        },
      )
    })
  }

  async connect(): Promise<void> {
    this.autoReconnectEnabled = true
    await this.connectInternal()
  }

  async disconnect(): Promise<void> {
    this.autoReconnectEnabled = false
    this.clearReconnectTimer()
    this.stopAllPolling()
    await this.connection.close()
    this.frameUnsubscribe = null
    this.command.clearPending()
    this.frameParser.reset()
    this.broadcast(EVENTS.BR_STATUS, { isConnected: false })
  }

  async connectIfConfigured(): Promise<void> {
    await this.connectInternal()
  }

  async resetTransport(): Promise<void> {
    this.clearReconnectTimer()
    if (this.frameUnsubscribe) {
      this.frameUnsubscribe()
      this.frameUnsubscribe = null
    }
    this.command.clearPending()
    this.frameParser.reset()
    await this.connection.close()
    this.broadcast(EVENTS.BR_STATUS, { isConnected: false })
  }

  async testConnection(
    host: string,
    port: number,
  ): Promise<{ success: boolean; error?: string }> {
    const status = this.connection.getStatus()
    if (status?.isConnected && status.host === host && status.port === port) {
      return { success: true }
    }

    // Use a temporary connection without touching current session state.
    const temp = new BrConnection()
    try {
      await temp.open({ host, port })
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }
    } finally {
      await temp.close()
    }
  }

  async fetchOtConfig(): Promise<OtConfigShape> {
    if (!this.connection.getStatus().isConnected) {
      return { error: "BR not connected. Connect to BR first." }
    }

    await this.command.fetchDatasetActive()
    const currentState = this.threadData.getThreadState()
    if (currentState?.state) {
      if (this.isLeaderRouterOrChild(currentState.state)) {
        await this.command.fetchIpAddr()
      }
    }
    const payload = this.otConfig.get()
    this.broadcast(EVENTS.OT_CONFIG, payload ?? {})
    return payload ?? {}
  }

  sendPullRequest(
    cmd: number,
    data?: Buffer,
  ): Promise<{ ack: boolean; data?: Buffer; errorCode?: number }> {
    return this.command.sendRequest(cmd, data)
  }

  async setPanid(panid: string): Promise<{ ack: boolean; errorCode?: number }> {
    const result = await this.command.setPanid(panid)
    return { ack: result.ack, errorCode: result.errorCode }
  }

  async setChannel(channel: number): Promise<{ ack: boolean; errorCode?: number }> {
    const result = await this.command.setChannel(channel)
    return { ack: result.ack, errorCode: result.errorCode }
  }

  async setNetworkName(
    networkName: string,
  ): Promise<{ ack: boolean; errorCode?: number }> {
    const result = await this.command.setNetworkName(networkName)
    return { ack: result.ack, errorCode: result.errorCode }
  }

  async setExtendedPanid(
    extendedPanId: string,
  ): Promise<{ ack: boolean; errorCode?: number }> {
    const result = await this.command.setExtendedPanid(extendedPanId)
    return { ack: result.ack, errorCode: result.errorCode }
  }

  async setNetworkKey(
    networkKey: string,
  ): Promise<{ ack: boolean; errorCode?: number }> {
    const result = await this.command.setNetworkKey(networkKey)
    return { ack: result.ack, errorCode: result.errorCode }
  }

  async reset(): Promise<{ ack: boolean; errorCode?: number }> {
    const result = await this.command.reset()
    return { ack: result.ack, errorCode: result.errorCode }
  }

  async factoryReset(): Promise<{ ack: boolean; errorCode?: number }> {
    const result = await this.command.factoryReset()
    return { ack: result.ack, errorCode: result.errorCode }
  }

  async startThread(): Promise<{ ack: boolean; errorCode?: number }> {
    const result = await this.command.startThread()
    return { ack: result.ack, errorCode: result.errorCode }
  }

  async stopThread(): Promise<{ ack: boolean; errorCode?: number }> {
    const result = await this.command.stopThread()
    return { ack: result.ack, errorCode: result.errorCode }
  }

  async getThreadVersion(): Promise<{ ack: boolean; data?: Buffer; errorCode?: number }> {
    const result = await this.command.getThreadVersion()
    return { ack: result.ack, data: result.data, errorCode: result.errorCode }
  }

  async commissionerJoiner(
    eui64: string,
    pskd: string,
    timeoutSeconds: number,
  ): Promise<{ ack: boolean; errorCode?: number }> {
    const result = await this.command.commissionerJoiner(eui64, pskd, timeoutSeconds)
    return { ack: result.ack, errorCode: result.errorCode }
  }

  async srpRegister(
    hostname: string,
    backendIPv6: string,
    port: number,
  ): Promise<{ ack: boolean; errorCode?: number }> {
    const result = await this.command.sendSrpRegister(hostname, backendIPv6, port)
    return { ack: result.ack, errorCode: result.errorCode }
  }

  private stopAllPolling(): void {
    this.pollingManager.stopAll()
    this.threadData.clear()
    this.otConfig.clear()
    if (this.stateIntervalId != null) {
      clearInterval(this.stateIntervalId)
      this.stateIntervalId = null
    }
    if (this.brHealthIntervalId != null) {
      clearInterval(this.brHealthIntervalId)
      this.brHealthIntervalId = null
    }
    if (this.notifyDebounceTimeoutId != null) {
      clearTimeout(this.notifyDebounceTimeoutId)
      this.notifyDebounceTimeoutId = null
    }
    this.notifyPendingMask = 0
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer()
    if (!this.autoReconnectEnabled) return
    const config = this.brConnectionConfigService.getLatest()
    if (!config) return
    transportLogger.info(`Will retry BR connection in ${RECONNECT_INTERVAL_MS}ms...`)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connectInternal()
    }, RECONNECT_INTERVAL_MS)
  }

  private async connectInternal(): Promise<void> {
    const config = this.brConnectionConfigService.getLatest()
    if (!config) return
    try {
      this.attachFramePipeline()
      await this.connection.open({ host: config.brHost, port: config.brPort })

      this.clearReconnectTimer()
      this.stateWithoutResponseCount = 0
      const status = this.connection.getStatus()
      this.broadcast(EVENTS.BR_CONNECTED, { success: true, status })
      this.broadcast(EVENTS.BR_STATUS, status)
      transportLogger.info(`Connected to BR: ${config.brHost}:${config.brPort}`)
      await this.pullAllOnReconnect()
      this.startStateInterval()
      this.startBrHealthPoll()
    } catch (error) {
      transportLogger.error(`BR connection failed: ${error}`)
      this.broadcast(EVENTS.BR_STATUS, {
        isConnected: false,
        host: config.brHost,
        port: config.brPort,
      })
      this.scheduleReconnect()
    }
  }

  shutdown(): void {
    this.autoReconnectEnabled = false
    this.clearReconnectTimer()
    this.stopAllPolling()
    this.command.clearPending()
    if (this.frameUnsubscribe) {
      this.frameUnsubscribe()
      this.frameUnsubscribe = null
    }
    this.frameParser.reset()
    transportLogger.info("Server shutdown: BR connection left open.")
  }

  private onTransportDisconnected(): void {
    this.lastRoleByte = null
    this.connectedThisSession = false
    this.stateWithoutResponseCount = 0
    this.stopAllPolling()
    this.frameUnsubscribe = null
    this.command.clearPending()
    this.frameParser.reset()
    this.broadcast(EVENTS.BR_STATUS, { isConnected: false })
    this.scheduleReconnect()
  }

  private startStateInterval(): void {
    if (this.stateIntervalId != null) return
    if (!this.connection.getStatus().isConnected) return
    this.stateIntervalId = setInterval(() => {
      this.pullState()
    }, BrSession.STATE_INTERVAL_MS)
  }

  private startBrHealthPoll(): void {
    if (this.brHealthIntervalId != null) return
    if (!this.connection.getStatus().isConnected) return
    this.brHealthIntervalId = setInterval(() => {
      this.fetchBrHealthAndPersist().catch(() => {})
    }, BrSession.BR_HEALTH_POLL_MS)
  }

  private onThreadHostNotify(changedMask: number): void {
    this.notifyPendingMask |= changedMask >>> 0
    if (this.notifyDebounceTimeoutId != null) return
    this.notifyDebounceTimeoutId = setTimeout(() => {
      this.notifyDebounceTimeoutId = null
      const mask = this.notifyPendingMask >>> 0
      this.notifyPendingMask = 0
      this.handleChangedMask(mask)
    }, 250)
  }

  private handleChangedMask(mask: number): void {
    if (!this.connection.getStatus().isConnected) return

    // NOTE: Bit mapping is defined by Thread-Host (ot_change_detector). Keep in sync.
    const BIT_STATE = 1 << 0
    const BIT_DATASET = 1 << 1
    const BIT_IPADDR = 1 << 2
    const BIT_ROUTER_TABLE = 1 << 3
    const BIT_CHILD_TABLE = 1 << 4
    const BIT_JOINER_TABLE = 1 << 5

    if (mask & BIT_STATE) this.pullState()
    if (mask & BIT_DATASET) this.command.fetchDatasetActive().catch(() => {})
    if (mask & BIT_IPADDR) this.command.fetchIpAddr().catch(() => {})
    if (mask & BIT_ROUTER_TABLE) this.fetchRouterTable().catch(() => {})
    if (mask & BIT_CHILD_TABLE) this.fetchChildTable().catch(() => {})
    if (mask & BIT_JOINER_TABLE) this.fetchJoinerTable().catch(() => {})

    const BIT_BR_HEALTH = 1 << 6
    if (mask & BIT_BR_HEALTH) this.fetchBrHealthAndPersist().catch(() => {})
  }

  private async fetchBrHealthAndPersist(): Promise<void> {
    const deviceId = getBrDeviceId()
    if (deviceId == null) return
    const res = await this.command.fetchBrHealth()
    if (!res.ack || !res.data) return
    const payload = parseBrHealthPayload(res.data)
    if (!payload) return
    try {
      upsertBrHealth(
        deviceId,
        payload.freeHeap,
        payload.minimumFreeHeap,
        payload.uptime,
        payload.mleDetachCount,
        payload.stackHwm,
      )
    } catch {
      // ignore DB errors
    }
  }

  private isLeaderRouterOrChild(
    roleOrState?: number | string | ThreadState | null,
  ): boolean {
    if (roleOrState == null) return false
    if (typeof roleOrState === "number") {
      return (
        roleOrState === DEVICE_ROLE.LEADER ||
        roleOrState === DEVICE_ROLE.ROUTER ||
        roleOrState === DEVICE_ROLE.CHILD
      )
    }
    const state = typeof roleOrState === "string" ? roleOrState : roleOrState.state
    if (!state) return false
    return (
      state === DEVICE_ROLE_NAMES[DEVICE_ROLE.LEADER] ||
      state === DEVICE_ROLE_NAMES[DEVICE_ROLE.ROUTER] ||
      state === DEVICE_ROLE_NAMES[DEVICE_ROLE.CHILD]
    )
  }

  async fetchRouterTable(): Promise<RouterEntry[] | null> {
    try {
      const res = await this.command.fetchRouterTable()
      if (res.ack && res.data) {
        const entries = parseRouterEntries(res.data)
        const tableData = parseRouterTable(res.data)
        this.threadData.setRouterTable(tableData)
        this.broadcast(EVENTS.OT_ROUTER_TABLE, tableData)
        return entries
      }
      return null
    } catch (err) {
      transportLogger.warn(`fetchRouterTable failed: ${(err as Error)?.message ?? err}`)
      const errorData: TableData = {
        headers: [],
        rows: [],
        error: `Failed: ${(err as Error)?.message ?? err}`,
      }
      this.threadData.setRouterTable(errorData)
      this.broadcast(EVENTS.OT_ROUTER_TABLE, errorData)
      return null
    }
  }

  async fetchChildTable(): Promise<ChildEntry[] | null> {
    try {
      const res = await this.command.fetchChildTable()
      if (res.ack && res.data) {
        const entries = parseChildEntries(res.data)
        const tableData = parseChildTable(res.data)
        this.threadData.setChildTable(tableData)
        this.broadcast(EVENTS.OT_CHILD_TABLE, tableData)
        return entries
      }
      return null
    } catch (err) {
      transportLogger.warn(`fetchChildTable failed: ${(err as Error)?.message ?? err}`)
      const errorData: TableData = {
        headers: [],
        rows: [],
        error: `Failed: ${(err as Error)?.message ?? err}`,
      }
      this.threadData.setChildTable(errorData)
      this.broadcast(EVENTS.OT_CHILD_TABLE, errorData)
      return null
    }
  }

  async fetchJoinerTable(): Promise<void> {
    try {
      const res = await this.command.fetchJoinerTable()
      if (res.ack && res.data) {
        const tableData = parseJoinerTable(res.data)
        this.threadData.setJoinerTable(tableData)
        this.broadcast(EVENTS.OT_JOINER_TABLE, tableData)
      }
    } catch (err) {
      transportLogger.warn(`fetchJoinerTable failed: ${(err as Error)?.message ?? err}`)
      const errorData: TableData = {
        headers: [],
        rows: [],
        error: `Failed: ${(err as Error)?.message ?? err}`,
      }
      this.threadData.setJoinerTable(errorData)
      this.broadcast(EVENTS.OT_JOINER_TABLE, errorData)
    }
  }

  private async fetchThreadVersion(): Promise<void> {
    if (this.otConfig.get()?.threadVersion != null) return
    this.getThreadVersion()
      .then((versionRes) => {
        if (versionRes.ack && versionRes.data && versionRes.data.length > 0) {
          let version: string
          if (versionRes.data.length <= 2) {
            version = versionRes.data.readUIntBE(0, versionRes.data.length).toString()
          } else {
            version = versionRes.data.toString("utf8").replace(/\0/g, "").trim()
          }
          this.otConfig.update({ threadVersion: version })
          this.broadcast(EVENTS.OT_CONFIG, this.otConfig.get())
        }
      })
      .catch((err) =>
        transportLogger.warn(`getThreadVersion failed: ${(err as Error)?.message ?? err}`),
      )
  }

  private async pullAllOnReconnect(): Promise<void> {
    if (!this.connection.getStatus().isConnected) return
    try {
      await this.command
        .fetchMacAddress()
        .then((r) => {
          if (!r.ack || !r.data) return
          if (r.data.length !== 8) return
          const macHex = r.data.toString("hex").toLowerCase()
          this.borderRouterMacHex = macHex
          try {
            repoUpsertDeviceInfo({
              macHex,
              deviceName: "Border Router",
              deviceNameRaw: "Border Router",
              deviceType: null,
              isBorderRouter: 1,
              manufacturer: null,
              model: null,
              swVersion: null,
              hwVersion: null,
            })
          } catch {
            // ignore DB errors
          }
        })
        .catch(() => {})

      await this.fetchBrHealthAndPersist().catch(() => {})

      const res = await this.command.fetchState()
      if (!(res.ack && res.data && res.data.length >= 1)) return

      this.stateWithoutResponseCount = 0
      const roleByte = res.data[0]! as DeviceRole
      const stateName = DEVICE_ROLE_NAMES[roleByte] ?? "unknown"
      this.lastRoleByte = roleByte

      this.threadData.setThreadState({ running: true, state: stateName })
      this.broadcast(EVENTS.OT_THREAD_STATE, this.threadData.getThreadState())

      await this.fetchThreadVersion().catch(() => {})
      await this.command.fetchDatasetActive().catch(() => {})
      await this.command.fetchIpAddr().catch(() => {})

      if (this.isLeaderRouterOrChild(roleByte)) {
        const routerEntries = await this.fetchRouterTable().catch(() => null)
        const childEntries = await this.fetchChildTable().catch(() => null)
        await this.fetchJoinerTable().catch(() => {})

        if (routerEntries && childEntries) {
          const otConfig = this.otConfig.get()
          let brRloc16: number | null = null
          if (otConfig?.leaderRloc16 != null) {
            const n = parseInt(otConfig.leaderRloc16.replace(/^0x/i, ""), 16)
            if (!Number.isNaN(n)) brRloc16 = n
          }
          if (brRloc16 == null && routerEntries.length > 0) {
            brRloc16 = routerEntries.reduce((a, b) => (a.age <= b.age ? a : b)).rloc16
          }
          try {
            persistBrTopology({
              routerEntries,
              childEntries,
              brRloc16OrNull: brRloc16,
              roleByte,
            })
          } catch {
            // ignore DB errors
          }
        }
      }

      await this.tryAutoStartThreadIfDisabled(roleByte)
    } catch (err) {
      transportLogger.warn(`pullAllOnReconnect failed: ${(err as Error)?.message ?? err}`)
    }
  }

  private async tryAutoStartThreadIfDisabled(roleByte: number): Promise<void> {
    if (roleByte !== DEVICE_ROLE.DISABLED || !this.appSettingsService.getThreadRunOnConnect()) return
    const result = await this.startThread().catch(() => ({
      ack: false as const,
      errorCode: undefined,
    }))
    if (result.ack) {
      transportLogger.info("Auto-started Thread (thread_run_on_connect=true, state was disabled)")
    } else if (result.errorCode != null) {
      transportLogger.warn(`Auto-start Thread failed: errorCode=${result.errorCode}`)
    }
  }

  private pullState(): void {
    if (!this.connection.getStatus().isConnected) return
    if (this.stateWithoutResponseCount >= STATE_WITHOUT_RESPONSE_LIMIT) {
      transportLogger.warn(
        `State ${STATE_WITHOUT_RESPONSE_LIMIT} lần không có phản hồi — đóng và reconnect`,
      )
      this.connection
        .close()
        .then(() => this.onTransportDisconnected())
        .catch(() => this.onTransportDisconnected())
      return
    }

    this.command
      .fetchState()
      .then((res) => {
        if (res.ack && res.data && res.data.length >= 1) {
          this.stateWithoutResponseCount = 0
          const roleByte = res.data[0]! as DeviceRole
          const stateName = DEVICE_ROLE_NAMES[roleByte] ?? "unknown"
          const stateChangedOrFirst = this.lastRoleByte === null || this.lastRoleByte !== roleByte
          const isLeaderRouterOrChild = this.isLeaderRouterOrChild(roleByte)
          this.lastRoleByte = roleByte

          this.threadData.setThreadState({ running: true, state: stateName })
          this.broadcast(EVENTS.OT_THREAD_STATE, this.threadData.getThreadState())

          if (stateChangedOrFirst) {
            this.tryAutoStartThreadIfDisabled(roleByte).catch((err) =>
              transportLogger.warn(`Auto-start Thread error: ${(err as Error)?.message ?? err}`),
            )
          }

          if (!this.connectedThisSession && isLeaderRouterOrChild) {
            const backendIPv6 = ENV.BACKEND_IPV6 || getPreferredBackendIPv6()
            if (backendIPv6) {
              const hostname = ENV.SRP_HOSTNAME
              const srpPort = ENV.SRP_PORT
              transportLogger.info(
                `SRP register: IPv6=${backendIPv6} hostname=${hostname} port=${srpPort}`,
              )
              this.srpRegister(hostname, backendIPv6, srpPort)
                .then((result) => {
                  this.connectedThisSession = true
                  if (result.ack) {
                    transportLogger.info("SRP register sent (BR is leader/router).")
                  } else {
                    transportLogger.warn(
                      `SRP register failed: errorCode=0x${result.errorCode?.toString(16) ?? "?"}`,
                    )
                  }
                })
                .catch((err) => {
                  transportLogger.warn(`SRP register error: ${(err as Error)?.message ?? err}`)
                })
            } else {
              transportLogger.info(
                "SRP register skipped: no IPv6 found (set BACKEND_IPV6 in .env or ensure host has ULA/link-local).",
              )
            }
          }
        } else {
          this.stateWithoutResponseCount++
        }
      })
      .catch(() => {
        this.stateWithoutResponseCount++
      })
  }
}

