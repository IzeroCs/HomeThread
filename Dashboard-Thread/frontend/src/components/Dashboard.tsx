import { useCallback, useEffect, useRef } from "react";
import { useWebSocketContext } from "../hooks/useWebSocketContext";
import "./Dashboard.scss";

function TableSection({
  title,
  data,
  onRefresh,
  loading,
  isConnected,
}: {
  title: string;
  data: { headers?: string[]; rows?: string[][]; error?: string } | null;
  onRefresh: () => void;
  loading: boolean;
  isConnected: boolean;
}) {
  const hasData =
    data &&
    !data.error &&
    ((data.headers?.length ?? 0) > 0 || (data.rows?.length ?? 0) > 0);

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
                {(data!.headers ?? []).map((h, i) => (
                  <th key={i}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data!.rows ?? []).map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td key={ci}>{cell}</td>
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

export default function Dashboard() {
  const {
    serialStatus,
    routerTable,
    childTable,
    getRouterTable,
    getChildTable,
  } = useWebSocketContext();
  const isConnected = serialStatus?.isConnected ?? false;
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Gọi tuần tự để tránh hai lệnh CLI cùng lúc trên serial → output lẫn, parse rỗng
  const refreshTables = useCallback(() => {
    if (!mountedRef.current) return;
    getRouterTable();
    const t = setTimeout(() => {
      if (mountedRef.current) getChildTable();
    }, 1500);
    return () => clearTimeout(t);
  }, [getRouterTable, getChildTable]);

  // Lấy dữ liệu khi kết nối serial (router trước, child sau 1.5s)
  useEffect(() => {
    if (isConnected) {
      return refreshTables();
    }
  }, [isConnected, refreshTables]);

  // Tự động làm mới mỗi 4 giây khi đang ở Dashboard và đã kết nối serial; dừng hẳn khi unmount (rời tab)
  useEffect(() => {
    if (!isConnected) return;
    let refreshCleanup: (() => void) | undefined;
    const interval = setInterval(() => {
      refreshCleanup = refreshTables();
    }, 4000);
    return () => {
      clearInterval(interval);
      refreshCleanup?.();
    };
  }, [isConnected, refreshTables]);

  const routerLoading = isConnected && routerTable === null;
  const childLoading = isConnected && childTable === null;

  return (
    <div className="dashboard-page">
      <h1>Dashboard</h1>
      <TableSection
        title="Router Table"
        data={routerTable}
        onRefresh={getRouterTable}
        loading={routerLoading}
        isConnected={isConnected}
      />
      <TableSection
        title="Child Table"
        data={childTable}
        onRefresh={getChildTable}
        loading={childLoading}
        isConnected={isConnected}
      />
    </div>
  );
}
