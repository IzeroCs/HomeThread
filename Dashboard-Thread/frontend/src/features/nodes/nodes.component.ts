import { LitElement, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { OtConfig, OtTableData } from "@shared/types/websocket.type";

import "@shared/components/modal/modal.component";
import "@nodes/components/commission-node-modal/commission-node-modal.component";
import "@nodes/components/joiner-list/joiner-list.component";
import "@nodes/nodes.style.scss";

function normCol(name: string): string {
  return String(name).trim().toLowerCase();
}

function colIndex(headers: string[] | undefined, name: string): number {
  if (!headers?.length) return -1;
  const n = normCol(name);
  return headers.findIndex((h) => normCol(h) === n);
}

function linkQualityToPercent(cell: string): number {
  const v = parseInt(cell, 10);
  if (Number.isNaN(v)) return 0;
  return Math.round((Math.min(3, Math.max(0, v)) / 3) * 100);
}

function linkQualityBarClass(percent: number): string {
  if (percent >= 80) return "nodes-link-quality-bar-fill--good";
  if (percent >= 50) return "nodes-link-quality-bar-fill--mid";
  return "nodes-link-quality-bar-fill--warn";
}

type SelectedRow = { type: "router"; rowIndex: number } | { type: "child"; rowIndex: number };

@customElement("nodes-view")
export class NodesComponent extends LitElement {
  override createRenderRoot() {
    return this;
  }

  @property({ type: Boolean }) isConnected = false;
  @property({ type: Object }) brConfig: { brHost: string; brPort: number } | null = null;
  @property({ type: Object }) routerTable: OtTableData | null = null;
  @property({ type: Object }) childTable: OtTableData | null = null;
  @property({ type: Object }) joinerTable: OtTableData | null = null;
  @property({ type: Object }) otConfig: OtConfig | null = null;
  @property({ attribute: false }) testBrConnect: (config: { brHost: string; brPort: number }) => Promise<{ success: boolean; error?: string }> = async () => ({ success: false });
  @property({ attribute: false }) getJoinerTable: () => void = () => {};
  @property({ attribute: false }) commissionerConnect: (eui64: string, psk: string, timeoutSeconds?: number) => Promise<{ success: boolean; error?: string }> = async () => ({ success: false });
  @property({ attribute: false }) showToast: (type: "success" | "error", message: string) => void = () => {};
  @property({ type: String }) threadState: string | null = null;

  @state() private selectedRow: SelectedRow | null = null;
  @state() private isCommissionModalOpen = false;
  @state() private routerAgeOffsets: number[] = [];
  @state() private childAgeOffsets: number[] = [];

  private _routerRowsRef: string[][] | null = null;
  private _childRowsRef: string[][] | null = null;
  private _routerTick: ReturnType<typeof setInterval> | null = null;
  private _childTick: ReturnType<typeof setInterval> | null = null;

  override willUpdate(changed: Map<string, unknown>) {
    const routerRows = this.routerTable?.rows ?? [];
    const childRows = this.childTable?.rows ?? [];
    const rH = this.routerTable?.headers ?? [];
    const cH = this.childTable?.headers ?? [];
    const rAge = colIndex(rH, "Age");
    const cAge = colIndex(cH, "Age");

    if (changed.has("routerTable") && rAge >= 0 && routerRows.length > 0) {
      if (this._routerRowsRef !== routerRows) {
        this._routerRowsRef = routerRows;
        this.routerAgeOffsets = new Array(routerRows.length).fill(0);
      }
    } else if (rAge < 0 || routerRows.length === 0) {
      this.routerAgeOffsets = [];
      this._routerRowsRef = null;
    }

    if (changed.has("childTable") && cAge >= 0 && childRows.length > 0) {
      if (this._childRowsRef !== childRows) {
        this._childRowsRef = childRows;
        this.childAgeOffsets = new Array(childRows.length).fill(0);
      }
    } else if (cAge < 0 || childRows.length === 0) {
      this.childAgeOffsets = [];
      this._childRowsRef = null;
    }
  }

  override updated(changed: Map<string, unknown>) {
    const rH = this.routerTable?.headers ?? [];
    const cH = this.childTable?.headers ?? [];
    const rAge = colIndex(rH, "Age");
    const cAge = colIndex(cH, "Age");
    const routerRows = this.routerTable?.rows ?? [];
    const childRows = this.childTable?.rows ?? [];

    if (changed.has("routerTable") || changed.has("routerAgeOffsets")) {
      if (this._routerTick) clearInterval(this._routerTick);
      if (rAge >= 0 && routerRows.length > 0) {
        this._routerTick = setInterval(() => {
          this.routerAgeOffsets = this.routerAgeOffsets.map((v) => v + 1);
        }, 1000);
      } else this._routerTick = null;
    }
    if (changed.has("childTable") || changed.has("childAgeOffsets")) {
      if (this._childTick) clearInterval(this._childTick);
      if (cAge >= 0 && childRows.length > 0) {
        this._childTick = setInterval(() => {
          this.childAgeOffsets = this.childAgeOffsets.map((v) => v + 1);
        }, 1000);
      } else this._childTick = null;
    }
  }

  override disconnectedCallback() {
    if (this._routerTick) clearInterval(this._routerTick);
    if (this._childTick) clearInterval(this._childTick);
    super.disconnectedCallback();
  }

  private _linkQualityBarCell(value: string) {
    const percent = linkQualityToPercent(value);
    const fillClass = linkQualityBarClass(percent);
    return html`
      <div class="nodes-link-quality-bar-cell">
        <div class="nodes-link-quality-bar-track">
          <div class="nodes-link-quality-bar-fill ${fillClass}" style="width: ${percent}%"></div>
        </div>
        <span class="nodes-link-quality-bar-num">${percent}</span>
      </div>
    `;
  }

  private _linkQualityBarsCell(value: string) {
    const n = Math.min(4, Math.max(0, parseInt(value, 10) || 0));
    return html`
      <div class="nodes-link-quality-bars-cell">
        <div class="nodes-link-quality-bars">
          ${[0, 1, 2, 3].map((i) => html`<div class="nodes-link-quality-bar-v ${i < n ? "nodes-link-quality-bar-v--filled" : ""}"></div>`)}
        </div>
        <span class="nodes-link-quality-bars-num">${n}</span>
      </div>
    `;
  }

  render() {
    const rH = this.routerTable?.headers ?? [];
    const cH = this.childTable?.headers ?? [];
    const rRouterId = colIndex(rH, "RouterId");
    const rRloc16 = colIndex(rH, "RLOC16");
    const rExtAddress = colIndex(rH, "ExtAddress");
    const rLqIn = colIndex(rH, "LinkQualityIn");
    const rLqOut = colIndex(rH, "LinkQualityOut");
    const rAge = colIndex(rH, "Age");
    const cChildId = colIndex(cH, "ChildId");
    const cRloc16 = colIndex(cH, "RLOC16");
    const cExtAddress = colIndex(cH, "ExtAddress");
    const cLqIn = colIndex(cH, "LinkQualityIn");
    const cAvgRssi = colIndex(cH, "AverageRssi");
    const cFtd = colIndex(cH, "FullThreadDevice");
    const cRxOnIdle = colIndex(cH, "RxOnWhenIdle");
    const cAge = colIndex(cH, "Age");

    const routerRows = this.routerTable?.rows ?? [];
    const childRows = this.childTable?.rows ?? [];
    const leaderRloc16 = this.otConfig?.leaderRloc16 ?? null;
    const routerLoading = this.isConnected && this.routerTable === null;
    const childLoading = this.isConnected && this.childTable === null;
    const hasRouterData = this.routerTable && !this.routerTable.error && (rH.length > 0 || routerRows.length > 0);
    const hasChildData = this.childTable && !this.childTable.error && (cH.length > 0 || childRows.length > 0);

    const tableForRow = this.selectedRow?.type === "router" ? this.routerTable : this.childTable;
    const selectedRowData =
      this.selectedRow != null && tableForRow?.headers?.length && tableForRow.rows?.[this.selectedRow.rowIndex]
        ? tableForRow.rows[this.selectedRow.rowIndex]
        : null;
    const rloc16Index = tableForRow?.headers?.findIndex((h) => normCol(h) === "rloc16") ?? -1;
    const rloc16Value = selectedRowData && rloc16Index >= 0 ? selectedRowData[rloc16Index] ?? "" : "";
    const tableLabel = this.selectedRow?.type === "router" ? "Router Table" : "Child Table";
    const modalTitle = this.selectedRow == null ? "" : `${tableLabel} - ${rloc16Value}`;
    const modalEntries: { key: string; value: string }[] = [];
    if (this.selectedRow != null && tableForRow?.headers?.length && selectedRowData) {
      tableForRow.headers.forEach((h, i) => {
        modalEntries.push({ key: h, value: selectedRowData[i] ?? "" });
      });
    }

    return html`
      <page-header
        heading="Nodes"
        subtitle="Manage and monitor network topology and connectivity"
        .action=${html`
          <button type="button" class="btn-icon" @click=${() => (this.isCommissionModalOpen = true)}>
            <span class="material-symbols-outlined">add_circle</span>
        </button>
        `}
      ></page-header>
      <div class="page-container">
        <div class="nodes-page">
          <section class="nodes-section">
            <h2 class="nodes-section-title">
              <span class="material-symbols-outlined nodes-section-icon">router</span>
              Router Table
            </h2>
            <div class="nodes-table-wrap">
              <table class="nodes-table">
                <thead>
                  <tr>
                    <th>Router ID</th>
                    <th>RLOC16</th>
                    <th>Ext Address</th>
                    <th>Link Quality In</th>
                    <th>Link Quality Out</th>
                    <th>Age</th>
                  </tr>
                </thead>
                <tbody>
                  ${!this.isConnected ? html `
                    <tr class="nodes-row-empty">
                      <td class="nodes-cell-empty" colspan="6">Connect to the Border Router to view network topology and node information.</td>
                    </tr>
                  ` : this.routerTable?.error ? html `
                    <tr class="nodes-row-empty">
                      <td class="nodes-cell-empty nodes-error" colspan="6">${this.routerTable.error}sadasd</td>
                    </tr>
                  ` : routerLoading && !hasRouterData ? html `
                    <tr class="nodes-row-empty">
                      <td class="nodes-cell-empty nodes-muted" colspan="6">Loading…</td>
                    </tr>
                  ` : !hasRouterData ? html `
                    <tr class="nodes-row-empty">
                      <td class="nodes-cell-empty nodes-muted" colspan="6">No routers found in the network.</td>
                    </tr>
                  ` : routerRows.map((row, ri) => {
                    const rloc16 = rRloc16 >= 0 ? row[rRloc16] ?? "" : "";
                    const isLeader = leaderRloc16 != null && rloc16.toLowerCase() === leaderRloc16.toLowerCase();
                    const baseAge = rAge >= 0 ? parseInt(row[rAge] ?? "0", 10) : 0;
                    const ageSec = baseAge + (this.routerAgeOffsets[ri] ?? 0);
                    return html`
                      <tr class="${isLeader ? "nodes-table-row-leader" : ""}" @click=${() => (this.selectedRow = { type: "router", rowIndex: ri })}>
                        <td class="nodes-cell-id">
                          <span class="nodes-cell-id-main">${rRouterId >= 0 ? row[rRouterId] : ""}</span>
                          ${isLeader ? html`<span class="nodes-leader-badge">LEADER</span>` : ""}
                        </td>
                        <td class="nodes-cell-mono">${rRloc16 >= 0 ? row[rRloc16] : ""}</td>
                        <td class="nodes-cell-mono">${rExtAddress >= 0 ? row[rExtAddress] : ""}</td>
                        <td>${this._linkQualityBarCell(rLqIn >= 0 ? row[rLqIn] : "")}</td>
                        <td>${this._linkQualityBarCell(rLqOut >= 0 ? row[rLqOut] : "")}</td>
                        <td class="nodes-cell-age">${ageSec}s</td>
                      </tr>
                    `;
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section class="nodes-section">
            <h2 class="nodes-section-title">
              <span class="material-symbols-outlined nodes-section-icon">account_tree</span>
              Child Table
            </h2>
            <div class="nodes-table-wrap">
              ${!this.isConnected
                ? html`<p class="nodes-muted">Loading…</p>`
                : this.childTable?.error
                  ? html`<p class="nodes-error">${this.childTable.error}</p>`
                  : childLoading && !hasChildData
                    ? html`<p class="nodes-muted">Loading…</p>`
                    : !hasChildData
                      ? html`<p class="nodes-muted">No child nodes connected.</p>`
                      : html`
                          <table class="nodes-table">
                            <thead>
                              <tr>
                                <th>Child ID</th>
                                <th>RLOC16</th>
                                <th>Ext Address</th>
                                <th>LQ In</th>
                                <th>Avg RSSI</th>
                                <th class="nodes-th-center">FTD</th>
                                <th class="nodes-th-center">RxOnIdle</th>
                                <th>Age</th>
                              </tr>
                            </thead>
                            <tbody>
                              ${childRows.length === 0
                                ? html`<tr class="nodes-row-empty"><td class="nodes-cell-empty" colspan="8">No child nodes connected.</td></tr>`
                                : childRows.map((row, ri) => {
                                    const baseAge = cAge >= 0 ? parseInt(row[cAge] ?? "0", 10) : 0;
                                    const ageSec = baseAge + (this.childAgeOffsets[ri] ?? 0);
                                    const ftdVal = cFtd >= 0 ? row[cFtd] ?? "" : "";
                                    const rxVal = cRxOnIdle >= 0 ? row[cRxOnIdle] ?? "" : "";
                                    return html`
                                      <tr @click=${() => (this.selectedRow = { type: "child", rowIndex: ri })}>
                                        <td class="nodes-cell-id">${cChildId >= 0 ? row[cChildId] : ""}</td>
                                        <td class="nodes-cell-mono">${cRloc16 >= 0 ? row[cRloc16] : ""}</td>
                                        <td class="nodes-cell-mono">${cExtAddress >= 0 ? row[cExtAddress] : ""}</td>
                                        <td>${this._linkQualityBarsCell(cLqIn >= 0 ? row[cLqIn] : "")}</td>
                                        <td class="nodes-cell-rssi">${cAvgRssi >= 0 ? row[cAvgRssi] : ""}</td>
                                        <td class="nodes-cell-icon">
                                          ${ftdVal === "FTD"
                                            ? html`<span class="material-symbols-outlined nodes-icon-ok">check_circle</span>`
                                            : html`<span class="material-symbols-outlined nodes-icon-no">cancel</span>`}
                                        </td>
                                        <td class="nodes-cell-icon">
                                          ${rxVal === "Yes"
                                            ? html`<span class="material-symbols-outlined nodes-icon-ok">check_circle</span>`
                                            : html`<span class="material-symbols-outlined nodes-icon-no">cancel</span>`}
                                        </td>
                                        <td class="nodes-cell-age">${ageSec}s</td>
                                      </tr>
                                    `;
                                  })}
                            </tbody>
                          </table>
                        `}
            </div>
          </section>

          <joiner-list .joinerTable=${this.joinerTable} .getJoinerTable=${this.getJoinerTable} .isConnected=${this.isConnected}></joiner-list>

          <modal-dialog
            .open=${this.selectedRow != null}
            .title=${modalTitle}
            .body=${html`
              <ul class="modal-detail-list">
                ${modalEntries.map(({ key: fieldKey, value }) => html`<li><span class="modal-detail-key">${fieldKey}</span><span class="modal-detail-value">${value}</span></li>`)}
              </ul>
            `}
            .onClose=${() => (this.selectedRow = null)}
          ></modal-dialog>

          <commission-node-modal
            .open=${this.isCommissionModalOpen}
            .onClose=${() => (this.isCommissionModalOpen = false)}
            .threadState=${this.threadState}
            .commissionerConnect=${this.commissionerConnect}
            .showToast=${this.showToast}
          ></commission-node-modal>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "nodes-view": NodesComponent;
  }
}
