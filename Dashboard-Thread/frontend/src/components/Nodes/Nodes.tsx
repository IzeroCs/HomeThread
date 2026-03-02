import { useEffect, useMemo, useRef, useState } from "react";
import { useWebSocketContext } from "../../hooks/useWebSocketContext";
import Modal from "../common/Modal";
import CommissionNodeModal from "./CommissionNodeModal";
import JoinerList from "./JoinerList";
import "./Nodes.scss";

/** Chuẩn hóa tên cột để so khớp (trim, lowercase) */
function normCol(name: string): string {
  return String(name).trim().toLowerCase();
}

/** Lấy index cột từ headers (không phân biệt hoa thường). */
function colIndex(headers: string[] | undefined, name: string): number {
  if (!headers?.length) return -1;
  const n = normCol(name);
  const i = headers.findIndex((h) => normCol(h) === n);
  return i >= 0 ? i : -1;
}

/** Backend LQ 0–3 → percent 0–100. */
function lqToPercent(cell: string): number {
  const v = parseInt(cell, 10);
  if (Number.isNaN(v)) return 0;
  return Math.round((Math.min(3, Math.max(0, v)) / 3) * 100);
}

/** Bar color class by percent: green >= 80, primary >= 50, else amber. */
function lqBarClass(percent: number): string {
  if (percent >= 80) return "nodes-lq-bar-fill--good";
  if (percent >= 50) return "nodes-lq-bar-fill--mid";
  return "nodes-lq-bar-fill--warn";
}

type TableData = { headers?: string[]; rows?: string[][]; error?: string } | null;
type SelectedRow = { type: "router"; rowIndex: number } | { type: "child"; rowIndex: number };

export default function Nodes() {
  const {
    serialStatus,
    otConfig,
    config: brConfig,
    testBrConnect,
    routerTable,
    childTable,
    joinerTable,
    getRouterTable,
    getChildTable,
    getJoinerTable,
  } = useWebSocketContext();
  const isConnected = serialStatus?.isConnected ?? false;
  const [selectedRow, setSelectedRow] = useState<SelectedRow | null>(null);
  const [isCommissionModalOpen, setCommissionModalOpen] = useState(false);

  const routerLoading = isConnected && routerTable === null;
  const childLoading = isConnected && childTable === null;
  const routerCount = routerTable?.rows?.length ?? 0;
  const childCount = childTable?.rows?.length ?? 0;

  // Column indices for router table (backend: RouterId, RLOC16, ExtAddress, LinkQualityIn, LinkQualityOut, Age)
  const rH = routerTable?.headers ?? [];
  const rRouterId = colIndex(rH, "RouterId");
  const rRloc16 = colIndex(rH, "RLOC16");
  const rExtAddress = colIndex(rH, "ExtAddress");
  const rLqIn = colIndex(rH, "LinkQualityIn");
  const rLqOut = colIndex(rH, "LinkQualityOut");
  const rAge = colIndex(rH, "Age");

  // Column indices for child table
  const cH = childTable?.headers ?? [];
  const cChildId = colIndex(cH, "ChildId");
  const cRloc16 = colIndex(cH, "RLOC16");
  const cExtAddress = colIndex(cH, "ExtAddress");
  const cLqIn = colIndex(cH, "LinkQualityIn");
  const cAvgRssi = colIndex(cH, "AverageRssi");
  const cFtd = colIndex(cH, "FullThreadDevice");
  const cRxOnIdle = colIndex(cH, "RxOnWhenIdle");
  const cAge = colIndex(cH, "Age");

  // Age offsets for live "Xs" display
  const [routerAgeOffsets, setRouterAgeOffsets] = useState<number[]>([]);
  const [childAgeOffsets, setChildAgeOffsets] = useState<number[]>([]);
  const routerRowsRef = useRef<string[][] | null>(null);
  const childRowsRef = useRef<string[][] | null>(null);

  const routerRows = routerTable?.rows ?? [];
  const childRows = childTable?.rows ?? [];

  useEffect(() => {
    if (rAge < 0 || routerRows.length === 0) {
      setRouterAgeOffsets([]);
      routerRowsRef.current = null;
      return;
    }
    if (routerRowsRef.current !== routerRows) {
      routerRowsRef.current = routerRows;
      setRouterAgeOffsets(new Array(routerRows.length).fill(0));
    }
  }, [routerRows, rAge]);

  useEffect(() => {
    if (cAge < 0 || childRows.length === 0) {
      setChildAgeOffsets([]);
      childRowsRef.current = null;
      return;
    }
    if (childRowsRef.current !== childRows) {
      childRowsRef.current = childRows;
      setChildAgeOffsets(new Array(childRows.length).fill(0));
    }
  }, [childRows, cAge]);

  useEffect(() => {
    if (rAge < 0 || routerRows.length === 0) return;
    const t = setInterval(() => setRouterAgeOffsets((prev) => prev.map((v) => v + 1)), 1000);
    return () => clearInterval(t);
  }, [rAge, routerRows.length]);

  useEffect(() => {
    if (cAge < 0 || childRows.length === 0) return;
    const t = setInterval(() => setChildAgeOffsets((prev) => prev.map((v) => v + 1)), 1000);
    return () => clearInterval(t);
  }, [cAge, childRows.length]);

  const leaderRloc16 = otConfig?.leaderRloc16 ?? null;
  const showDisconnectedOverlay = !isConnected;

  const tableForRow = selectedRow?.type === "router" ? routerTable : childTable;
  const selectedRowData =
    selectedRow != null && tableForRow?.headers?.length && tableForRow.rows?.[selectedRow.rowIndex]
      ? tableForRow.rows[selectedRow.rowIndex]
      : null;
  const rloc16Index =
    tableForRow?.headers?.findIndex((h) => normCol(h) === "rloc16") ?? -1;
  const rloc16Value = selectedRowData && rloc16Index >= 0 ? selectedRowData[rloc16Index] ?? "" : "";
  const tableLabel = selectedRow?.type === "router" ? "Router Table" : "Child Table";
  const modalTitle =
    selectedRow == null ? "" : `${tableLabel} - ${rloc16Value}`;
  const modalEntries: { key: string; value: string }[] = [];
  if (selectedRow != null && tableForRow?.headers?.length && selectedRowData) {
    tableForRow.headers.forEach((h, i) => {
      modalEntries.push({ key: h, value: selectedRowData[i] ?? "" });
    });
  }

  const hasRouterData =
    routerTable && !routerTable.error && (rH.length > 0 || routerRows.length > 0);
  const hasChildData =
    childTable && !childTable.error && (cH.length > 0 || childRows.length > 0);

  const handleTryReconnect = () => {
    if (!brConfig) return;
    void testBrConnect({ brHost: brConfig.brHost, brPort: brConfig.brPort });
  };

  return (
    <div className="nodes-page">
      {showDisconnectedOverlay && (
        <div className="nodes-disconnected-overlay">
          <div className="nodes-disconnected-card">
            <div className="nodes-disconnected-icon">
              <span className="material-symbols-outlined">wifi_off</span>
            </div>
            <h1 className="nodes-disconnected-title">Border Router Disconnected</h1>
            <p className="nodes-disconnected-text">
              Connect to the Border Router to view network topology and node information.
            </p>
            <button
              type="button"
              className="nodes-disconnected-btn"
              onClick={handleTryReconnect}
              disabled={!brConfig}
            >
              <span className="material-symbols-outlined">refresh</span>
              <span>Try Reconnecting</span>
            </button>
          </div>
        </div>
      )}

      <div className="nodes-content">
        <div className="nodes-header">
          <div className="nodes-header-text">
            <h1 className="nodes-title">Nodes</h1>
            <p className="nodes-subtitle">
              Manage and monitor network topology and connectivity
            </p>
          </div>
          <button
            type="button"
            className="nodes-btn-commission"
            onClick={() => setCommissionModalOpen(true)}
          >
            <span className="material-symbols-outlined">add_circle</span>
            <span>Commission Node</span>
          </button>
        </div>

        <section className="nodes-section">
        <h2 className="nodes-section-title">
          <span className="material-symbols-outlined nodes-section-icon">router</span>
          Router Table
        </h2>
        <div className="nodes-table-wrap">
          {showDisconnectedOverlay ? (
            <p className="nodes-muted">Loading…</p>
          ) : routerTable?.error ? (
            <p className="nodes-error">{routerTable.error}</p>
          ) : routerLoading && !hasRouterData ? (
            <p className="nodes-muted">Loading…</p>
          ) : !hasRouterData ? (
            <p className="nodes-muted">No routers found in the network.</p>
          ) : (
            <table className="nodes-table">
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
                {routerRows.length === 0 ? (
                  <tr className="nodes-row-empty">
                    <td className="nodes-cell-empty" colSpan={6}>
                      No routers found in the network.
                    </td>
                  </tr>
                ) : (
                  routerRows.map((row, ri) => {
                    const rloc16 = rRloc16 >= 0 ? row[rRloc16] ?? "" : "";
                    const isLeader =
                      leaderRloc16 != null &&
                      rloc16.toLowerCase() === leaderRloc16.toLowerCase();
                    const baseAge = rAge >= 0 ? parseInt(row[rAge] ?? "0", 10) : 0;
                    const ageSec = Number.isNaN(baseAge)
                      ? 0
                      : baseAge + (routerAgeOffsets[ri] ?? 0);
                    const routerKey = rloc16 || `router-${rExtAddress >= 0 ? row[rExtAddress] ?? ri : ri}`;
                    return (
                      <tr
                        key={routerKey}
                        className={isLeader ? "nodes-table-row-leader" : ""}
                        onClick={() => setSelectedRow({ type: "router", rowIndex: ri })}
                      >
                        <td className="nodes-cell-id">
                          <span className="nodes-cell-id-main">
                            {rRouterId >= 0 ? row[rRouterId] : ""}
                          </span>
                          {isLeader && (
                            <span className="nodes-leader-badge">LEADER</span>
                          )}
                        </td>
                        <td className="nodes-cell-mono">{rRloc16 >= 0 ? row[rRloc16] : ""}</td>
                        <td className="nodes-cell-mono">{rExtAddress >= 0 ? row[rExtAddress] : ""}</td>
                        <td>
                          <LqBarCell value={rLqIn >= 0 ? row[rLqIn] : ""} />
                        </td>
                        <td>
                          <LqBarCell value={rLqOut >= 0 ? row[rLqOut] : ""} />
                        </td>
                        <td className="nodes-cell-age">{ageSec}s</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>
      </section>

        <section className="nodes-section">
        <h2 className="nodes-section-title">
          <span className="material-symbols-outlined nodes-section-icon">account_tree</span>
          Child Table
        </h2>
        <div className="nodes-table-wrap">
          {showDisconnectedOverlay ? (
            <p className="nodes-muted">Loading…</p>
          ) : childTable?.error ? (
            <p className="nodes-error">{childTable.error}</p>
          ) : childLoading && !hasChildData ? (
            <p className="nodes-muted">Loading…</p>
          ) : !hasChildData ? (
            <p className="nodes-muted">No child nodes connected.</p>
          ) : (
            <table className="nodes-table">
              <thead>
                <tr>
                  <th>Child ID</th>
                  <th>RLOC16</th>
                  <th>Ext Address</th>
                  <th>LQ In</th>
                  <th>Avg RSSI</th>
                  <th className="nodes-th-center">FTD</th>
                  <th className="nodes-th-center">RxOnIdle</th>
                  <th>Age</th>
                </tr>
              </thead>
              <tbody>
                {childRows.length === 0 ? (
                  <tr className="nodes-row-empty">
                    <td className="nodes-cell-empty" colSpan={8}>
                      No child nodes connected.
                    </td>
                  </tr>
                ) : (
                  childRows.map((row, ri) => {
                    const childRloc = cRloc16 >= 0 ? row[cRloc16] ?? "" : "";
                    const childExt = cExtAddress >= 0 ? row[cExtAddress] ?? "" : "";
                    const childKey = childRloc || childExt || `child-${ri}`;
                    const baseAge = cAge >= 0 ? parseInt(row[cAge] ?? "0", 10) : 0;
                    const ageSec = Number.isNaN(baseAge)
                      ? 0
                      : baseAge + (childAgeOffsets[ri] ?? 0);
                    const ftdVal = cFtd >= 0 ? row[cFtd] ?? "" : "";
                    const rxVal = cRxOnIdle >= 0 ? row[cRxOnIdle] ?? "" : "";
                    return (
                      <tr
                        key={childKey}
                        onClick={() => setSelectedRow({ type: "child", rowIndex: ri })}
                      >
                        <td className="nodes-cell-id">{cChildId >= 0 ? row[cChildId] : ""}</td>
                        <td className="nodes-cell-mono">{cRloc16 >= 0 ? row[cRloc16] : ""}</td>
                        <td className="nodes-cell-mono">{cExtAddress >= 0 ? row[cExtAddress] : ""}</td>
                        <td>
                          <LqBarsCell value={cLqIn >= 0 ? row[cLqIn] : ""} />
                        </td>
                        <td className="nodes-cell-rssi">{cAvgRssi >= 0 ? row[cAvgRssi] : ""}</td>
                        <td className="nodes-cell-icon">
                          {ftdVal === "FTD" ? (
                            <span className="material-symbols-outlined nodes-icon-ok">check_circle</span>
                          ) : (
                            <span className="material-symbols-outlined nodes-icon-no">cancel</span>
                          )}
                        </td>
                        <td className="nodes-cell-icon">
                          {rxVal === "Yes" ? (
                            <span className="material-symbols-outlined nodes-icon-ok">check_circle</span>
                          ) : (
                            <span className="material-symbols-outlined nodes-icon-no">cancel</span>
                          )}
                        </td>
                        <td className="nodes-cell-age">{ageSec}s</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>
      </section>

        <JoinerList
          joinerTable={joinerTable}
          getJoinerTable={getJoinerTable}
          isConnected={isConnected}
        />

        <Modal
          open={selectedRow != null}
          onClose={() => setSelectedRow(null)}
          title={modalTitle}
        >
          <ul className="modal-detail-list">
            {modalEntries.map(({ key: fieldKey, value }) => (
              <li key={fieldKey}>
                <span className="modal-detail-key">{fieldKey}</span>
                <span className="modal-detail-value">{value}</span>
              </li>
            ))}
          </ul>
        </Modal>

        <CommissionNodeModal
          open={isCommissionModalOpen}
          onClose={() => setCommissionModalOpen(false)}
        />
      </div>
    </div>
  );
}

function LqBarCell({ value }: { value: string }) {
  const percent = lqToPercent(value);
  const fillClass = lqBarClass(percent);
  return (
    <div className="nodes-lq-bar-cell">
      <div className="nodes-lq-bar-track">
        <div
          className={`nodes-lq-bar-fill ${fillClass}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="nodes-lq-bar-num">{percent}</span>
    </div>
  );
}

function LqBarsCell({ value }: { value: string }) {
  const n = Math.min(4, Math.max(0, parseInt(value, 10) || 0));
  return (
    <div className="nodes-lq-bars-cell">
      <div className="nodes-lq-bars">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={`lq-bar-${i}`}
            className={`nodes-lq-bar-v ${i < n ? "nodes-lq-bar-v--filled" : ""}`}
          />
        ))}
      </div>
      <span className="nodes-lq-bars-num">{n}</span>
    </div>
  );
}
