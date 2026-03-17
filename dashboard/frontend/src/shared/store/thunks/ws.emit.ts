import { EVENTS } from "shared/src/events";
import { getSocket } from "@/shared/ws/ws-bridge";

export function wsEmitConfigGet(): void {
  getSocket()?.emit(EVENTS.CONFIG_GET);
}

export function wsEmitConfigSave(data: { brHost: string; brPort: number; useMdns?: boolean }): void {
  getSocket()?.emit(EVENTS.CONFIG_SAVE, data);
}

export function wsEmitBrConnect(): void {
  getSocket()?.emit(EVENTS.BR_CONNECT);
}

export function wsEmitBrDisconnect(): void {
  getSocket()?.emit(EVENTS.BR_DISCONNECT);
}

export function wsEmitGetThreadState(): void {
  getSocket()?.emit(EVENTS.OT_GET_THREAD_STATE);
}

export function wsEmitGetThreadRunOnConnect(): void {
  getSocket()?.emit(EVENTS.OT_GET_THREAD_RUN_ON_CONNECT);
}

export function wsEmitSetThreadRunOnConnect(runOnConnect: boolean): void {
  getSocket()?.emit(EVENTS.OT_SET_THREAD_RUN_ON_CONNECT, { runOnConnect });
}

export function wsEmitGetRouterTable(): void {
  getSocket()?.emit(EVENTS.OT_GET_ROUTER_TABLE);
}

export function wsEmitGetChildTable(): void {
  getSocket()?.emit(EVENTS.OT_GET_CHILD_TABLE);
}

export function wsEmitGetJoinerTable(): void {
  getSocket()?.emit(EVENTS.COMMISSIONER_GET_JOINER_TABLE);
}

