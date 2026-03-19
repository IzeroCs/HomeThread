import { LitElement, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { store } from "@/store/store";
import { createLocaleController } from "@/core/i18n/locale-controller";
import { LitStoreController, shallowEqual } from "@namorix/core/store";
import { selectBrStatus, selectChildTable, selectOtConfig, selectRouterTable, selectThreadState } from "@/store/selectors";
import { appBarActions } from "@/store/slices/appbar.slice";
import { t } from "@/core/i18n/i18n";

import "@namorix/core/components/modal";
import "./nodes.style.scss";

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

  private readonly locale = createLocaleController(this);

  private readonly appState = new LitStoreController(
    this,
    store,
    (s) => ({
      isConnected: selectBrStatus(s)?.isConnected ?? false,
      routerTable: selectRouterTable(s),
      childTable: selectChildTable(s),
      otConfig: selectOtConfig(s),
      threadState: selectThreadState(s),
    }),
    shallowEqual
  );

  @state() private selectedRow: SelectedRow | null = null;
  @state() private routerAgeOffsets: number[] = [];
  @state() private childAgeOffsets: number[] = [];
  private _lastAppBarSig = "";

  private _routerRowsRef: string[][] | null = null;
  private _childRowsRef: string[][] | null = null;
  private _routerTick: ReturnType<typeof setInterval> | null = null;
  private _childTick: ReturnType<typeof setInterval> | null = null;

  override willUpdate(_changed: Map<string, unknown>) {
    const { routerTable, childTable } = this.appState.value;
    const routerRows = routerTable?.rows ?? [];
    const childRows = childTable?.rows ?? [];
    const rH = routerTable?.headers ?? [];
    const cH = childTable?.headers ?? [];
    const rAge = colIndex(rH, "Age");
    const cAge = colIndex(cH, "Age");

    if (rAge >= 0 && routerRows.length > 0) {
      if (this._routerRowsRef !== routerRows) {
        this._routerRowsRef = routerRows;
        this.routerAgeOffsets = new Array(routerRows.length).fill(0);
      }
    } else if (rAge < 0 || routerRows.length === 0) {
      this.routerAgeOffsets = [];
      this._routerRowsRef = null;
    }

    if (cAge >= 0 && childRows.length > 0) {
      if (this._childRowsRef !== childRows) {
        this._childRowsRef = childRows;
        this.childAgeOffsets = new Array(childRows.length).fill(0);
      }
    } else if (cAge < 0 || childRows.length === 0) {
      this.childAgeOffsets = [];
      this._childRowsRef = null;
    }
  }

  override updated(_changed: Map<string, unknown>) {
    const { routerTable, childTable } = this.appState.value;
    const rH = routerTable?.headers ?? [];
    const cH = childTable?.headers ?? [];
    const rAge = colIndex(rH, "Age");
    const cAge = colIndex(cH, "Age");
    const routerRows = routerTable?.rows ?? [];
    const childRows = childTable?.rows ?? [];

    if (rAge >= 0 && routerRows.length > 0) {
      if (!this._routerTick) {
        this._routerTick = setInterval(() => {
          this.routerAgeOffsets = this.routerAgeOffsets.map((v) => v + 1);
        }, 1000);
      }
    } else if (this._routerTick) {
      clearInterval(this._routerTick);
      this._routerTick = null;
    }

    if (cAge >= 0 && childRows.length > 0) {
      if (!this._childTick) {
        this._childTick = setInterval(() => {
          this.childAgeOffsets = this.childAgeOffsets.map((v) => v + 1);
        }, 1000);
      }
    } else if (this._childTick) {
      clearInterval(this._childTick);
      this._childTick = null;
    }
  }

  override disconnectedCallback() {
    if (this._routerTick) clearInterval(this._routerTick);
    if (this._childTick) clearInterval(this._childTick);
    store.dispatch(appBarActions.clearAppBar());
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
    void this.locale.value;
    const appBar = {
      heading: t("nodes.header.title"),
      subtitle: t("nodes.header.subtitle"),
      actions: [],
    };
    const sig = JSON.stringify(appBar);
    if (sig !== this._lastAppBarSig) {
      this._lastAppBarSig = sig;
      store.dispatch(appBarActions.setAppBar(appBar));
    }
    const { isConnected, routerTable, childTable, otConfig } = this.appState.value;
    const rH = routerTable?.headers ?? [];
    const cH = childTable?.headers ?? [];
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

    const routerRows = routerTable?.rows ?? [];
    const childRows = childTable?.rows ?? [];
    const leaderRloc16 = otConfig?.leaderRloc16 ?? null;

    const tableForRow = this.selectedRow?.type === "router" ? routerTable : childTable;
    const selectedRowData =
      this.selectedRow != null && tableForRow?.headers?.length && tableForRow.rows?.[this.selectedRow.rowIndex]
        ? tableForRow.rows[this.selectedRow.rowIndex]
        : null;
    const rloc16Index = tableForRow?.headers?.findIndex((h) => normCol(h) === "rloc16") ?? -1;
    const rloc16Value = selectedRowData && rloc16Index >= 0 ? selectedRowData[rloc16Index] ?? "" : "";
    const tableLabel = this.selectedRow?.type === "router" ? t("nodes.routerTable.title") : t("nodes.childTable.title");
    const modalTitle = this.selectedRow == null ? "" : `${tableLabel} - ${rloc16Value}`;
    const modalEntries: { key: string; value: string }[] = [];
    if (this.selectedRow != null && tableForRow?.headers?.length && selectedRowData) {
      tableForRow.headers.forEach((h, i) => {
        modalEntries.push({ key: h, value: selectedRowData[i] ?? "" });
      });
    }

    return html`
      <div class="page-container">
        <div class="nodes-page">
          <section class="nodes-section">
            <h2 class="nodes-section-title">
              <span class="material-symbols-outlined nodes-section-icon">router</span>
              ${t("nodes.routerTable.title")}
            </h2>
            <div class="nodes-table-wrap">
              <table class="nodes-table">
                <thead>
                  <tr>
                    <th>${t("nodes.routerTable.columns.routerId")}</th>
                    <th>${t("nodes.common.columns.rloc16")}</th>
                    <th>${t("nodes.common.columns.extAddress")}</th>
                    <th>${t("nodes.routerTable.columns.linkQualityIn")}</th>
                    <th>${t("nodes.routerTable.columns.linkQualityOut")}</th>
                    <th>${t("nodes.common.columns.age")}</th>
                  </tr>
                </thead>
                <tbody>
                  ${!isConnected ? html `
                    <tr class="nodes-row-empty">
                      <td class="nodes-cell-empty nodes-muted" colspan="6">
                        ${t("nodes.common.empty.connectToBr")}
                      </td>
                    </tr>
                  ` : routerTable?.error ? html `
                    <tr class="nodes-row-empty">
                      <td class="nodes-cell-empty nodes-error" colspan="6">
                        ${routerTable.error}
                      </td>
                    </tr>
                  ` : routerTable == null || routerRows.length === 0 ? html `
                    <tr class="nodes-row-empty">
                      <td class="nodes-cell-empty nodes-muted" colspan="6">
                        ${t("nodes.routerTable.empty.none")}
                      </td>
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
                          ${isLeader ? html`<span class="nodes-leader-badge">${t("nodes.common.badges.leader")}</span>` : ""}
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
              ${t("nodes.childTable.title")}
            </h2>
            <div class="nodes-table-wrap">
              <table class="nodes-table">
                <thead>
                  <tr>
                    <th>${t("nodes.childTable.columns.childId")}</th>
                    <th>${t("nodes.common.columns.rloc16")}</th>
                    <th>${t("nodes.common.columns.extAddress")}</th>
                    <th>${t("nodes.childTable.columns.lqIn")}</th>
                    <th>${t("nodes.childTable.columns.avgRssi")}</th>
                    <th class="nodes-th-center">FTD</th>
                    <th class="nodes-th-center">RxOnIdle</th>
                    <th>${t("nodes.common.columns.age")}</th>
                  </tr>
                </thead>
                <tbody>
                  ${!isConnected ? html `
                    <tr class="nodes-row-empty">
                      <td class="nodes-cell-empty nodes-muted" colspan="8">
                        ${t("nodes.common.empty.connectToBr")}
                      </td>
                    </tr>
                  ` : childTable?.error ? html `
                    <tr class="nodes-row-empty">
                      <td class="nodes-cell-empty nodes-error" colspan="8">
                        ${childTable.error}
                      </td>
                    </tr>
                  ` : childTable == null || childRows.length === 0 ? html `
                  <tr class="nodes-row-empty">
                      <td class="nodes-cell-empty nodes-muted" colspan="8">\
                        ${t("nodes.childTable.empty.none")}
                      </td>
                    </tr>
                  ` : childRows.map((row, ri) => {
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
            </div>
          </section>

          <nmx-modal
            .open=${this.selectedRow != null}
            .title=${modalTitle}
            .closeAriaLabel=${t("modal.closeAriaLabel")}
            .body=${html`
              <ul class="nodes-modal-detail-list">
                ${modalEntries.map(({ key: fieldKey, value }) => html`
                  <li>
                    <span class="nodes-modal-detail-key">${fieldKey}</span>
                    <span class="nodes-modal-detail-value">${value}</span>
                  </li>
                `)}
              </ul>
            `}
            .onClose=${() => (this.selectedRow = null)}
          ></nmx-modal>
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
