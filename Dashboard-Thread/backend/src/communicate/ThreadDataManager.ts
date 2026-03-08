/**
 * ThreadDataManager - Quản lý và lưu dữ liệu runtime OT/Thread: thread state, router/child/joiner table.
 */

export type ThreadState = { running: boolean; state?: string } | null;

export type TableData = { headers?: string[]; rows?: string[][]; error?: string } | null;

export class ThreadDataManager {
  private threadState: ThreadState = null;
  private routerTable: TableData = null;
  private childTable: TableData = null;
  private joinerTable: TableData = null;

  getThreadState(): ThreadState {
    return this.threadState;
  }
  setThreadState(v: ThreadState): void {
    this.threadState = v;
  }

  getRouterTable(): TableData {
    return this.routerTable;
  }
  setRouterTable(v: TableData): void {
    this.routerTable = v;
  }

  getChildTable(): TableData {
    return this.childTable;
  }
  setChildTable(v: TableData): void {
    this.childTable = v;
  }

  getJoinerTable(): TableData {
    return this.joinerTable;
  }
  setJoinerTable(v: TableData): void {
    this.joinerTable = v;
  }

  clear(): void {
    this.threadState = null;
    this.routerTable = null;
    this.childTable = null;
    this.joinerTable = null;
  }
}
