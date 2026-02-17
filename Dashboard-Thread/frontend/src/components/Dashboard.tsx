import { useMemo, useState } from "react";
import { useWebSocketContext } from "../hooks/useWebSocketContext";
import Modal from "./common/Modal";
import "./Dashboard.scss";

/** Cột ẩn trên UI (Router Table): Next Hop, Path Cost, Extended MAC, LQ In/Out, Link. */
const ROUTER_TABLE_HIDDEN_COLUMNS = [
  "Next Hop",
  "Path Cost",
  "Link",
];

/** Cột ẩn trên UI (Child Table): R, S, D, N, Extended MAC. */
const CHILD_TABLE_HIDDEN_COLUMNS = ["R", "S", "D", "N", "C_VN", "Ver", "CSL", "Suprvsn", "QMsgCnt"];

/** Chuẩn hóa tên cột để so khớp (trim, lowercase) */
function normCol(name: string): string {
  return String(name).trim().toLowerCase();
}

function TableSection({
  title,
  data,
  onRefresh,
  loading,
  isConnected,
  hiddenColumns = [],
  onRowClick,
}: {
  title: string;
  data: { headers?: string[]; rows?: string[][]; error?: string } | null;
  onRefresh: () => void;
  loading: boolean;
  isConnected: boolean;
  /** Tên cột không hiển thị (so khớp không phân biệt hoa thường). Backend vẫn gửi đủ. */
  hiddenColumns?: string[];
  /** Gọi khi user click vào một dòng (rowIndex). */
  onRowClick?: (rowIndex: number) => void;
}) {
  const hasData =
    data &&
    !data.error &&
    ((data.headers?.length ?? 0) > 0 || (data.rows?.length ?? 0) > 0);

  const hiddenSet = useMemo(() => {
    const set = new Set(hiddenColumns.map(normCol));
    return set;
  }, [hiddenColumns]);

  const visibleIndices = useMemo(() => {
    const headers = data?.headers ?? [];
    return headers.map((_, i) => i).filter((i) => !hiddenSet.has(normCol(headers[i])));
  }, [data?.headers, hiddenSet]);

  return (
    <section className="dashboard-section">
      <div className="dashboard-section-header">
        <h2>{title}</h2>
        <button
          type="button"
          className="dashboard-refresh"
          onClick={onRefresh}
          disabled={!isConnected || loading}
        >
          {loading ? "Đang tải…" : "Làm mới"}
        </button>
      </div>
      <div className="dashboard-table-wrap">
        {!isConnected ? (
          <p className="dashboard-muted">Kết nối serial để xem bảng.</p>
        ) : data?.error ? (
          <p className="dashboard-error">{data.error}</p>
        ) : loading && !hasData ? (
          <p className="dashboard-muted">Đang tải…</p>
        ) : !hasData ? (
          <p className="dashboard-muted">Không có dữ liệu.</p>
        ) : (
          <table className="dashboard-table">
            <thead>
              <tr>
                {visibleIndices.map((i) => (
                  <th key={i}>{(data!.headers ?? [])[i]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data!.rows ?? []).map((row, ri) => (
                <tr
                  key={ri}
                  className={onRowClick ? "dashboard-table-row-clickable" : undefined}
                  onClick={onRowClick ? () => onRowClick(ri) : undefined}
                >
                  {visibleIndices.map((ci) => (
                    <td key={ci}>{row[ci] ?? ""}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

type SelectedRow = { type: "router"; rowIndex: number } | { type: "child"; rowIndex: number };

export default function Dashboard() {
  const {
    serialStatus,
    routerTable,
    childTable,
    getRouterTable,
    getChildTable,
  } = useWebSocketContext();
  const isConnected = serialStatus?.isConnected ?? false;
  const [selectedRow, setSelectedRow] = useState<SelectedRow | null>(null);
  // Router/Child table do backend interval (6s) broadcast; frontend chỉ hiển thị. Nút "Làm mới" gọi getRouterTable/getChildTable (backend trả cache hoặc poll 1 lần).

  const routerLoading = isConnected && routerTable === null;
  const childLoading = isConnected && childTable === null;
  const routerCount = routerTable?.rows?.length ?? 0;
  const childCount = childTable?.rows?.length ?? 0;

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

  return (
    <div className="dashboard-page">
      <div className="dashboard-header">
        <h1>Dashboard</h1>
      </div>
      <TableSection
        title={`Router Table (${routerCount})`}
        data={routerTable}
        onRefresh={getRouterTable}
        loading={routerLoading}
        isConnected={isConnected}
        hiddenColumns={ROUTER_TABLE_HIDDEN_COLUMNS}
        onRowClick={(ri) => setSelectedRow({ type: "router", rowIndex: ri })}
      />
      <TableSection
        title={`Child Table (${childCount})`}
        data={childTable}
        onRefresh={getChildTable}
        loading={childLoading}
        isConnected={isConnected}
        hiddenColumns={CHILD_TABLE_HIDDEN_COLUMNS}
        onRowClick={(ri) => setSelectedRow({ type: "child", rowIndex: ri })}
      />
      <Modal
        open={selectedRow != null}
        onClose={() => setSelectedRow(null)}
        title={modalTitle}
      >
        <ul className="modal-detail-list">
          {modalEntries.map(({ key, value }, i) => (
            <li key={i}>
              <span className="modal-detail-key">{key}</span>
              <span className="modal-detail-value">{value}</span>
            </li>
          ))}
        </ul>
      </Modal>
    </div>
  );
}
