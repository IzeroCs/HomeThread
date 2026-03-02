import "./TopNav.scss";

export type NavPage = "nodes" | "status" | "settings";

interface TopNavProps {
  /** Chỉ hiện logo, ẩn Nodes/Settings */
  logoOnly?: boolean;
  /** Trạng thái BR: false = xám; true = cam/tím/xanh lá/xanh dương theo state (xem threadState) */
  serialConnected?: boolean;
  /** State Thread: leader → xanh lá, router → tím, child → xanh dương; detached/disabled → cam */
  threadState?: string | null;
  /** Đã bật "tự chạy Thread" → màu theo state; chưa bật thì cam */
  threadRunOnConnect?: boolean;
  /** Tổng router + child (hiển thị bên cạnh "Nodes" khi có) */
  nodesCount?: number | null;
  currentPage?: NavPage;
  onNavigate?: (page: NavPage) => void;
}

export default function TopNav({
  logoOnly = false,
  serialConnected = false,
  threadState = null,
  threadRunOnConnect = false,
  nodesCount = null,
  currentPage = "nodes",
  onNavigate = () => {},
}: TopNavProps) {
  const stateLower = threadState?.toLowerCase();
  // child → xanh dương, router → tím, leader → xanh lá; detached/disabled/null → cam. Chưa kết nối serial → xám.
  const statusClass = !serialConnected
    ? "status-disconnected"
    : stateLower === "child"
      ? "status-thread-blue"
      : stateLower === "router"
        ? "status-thread-purple"
        : stateLower === "leader"
          ? "status-thread-green"
          : "status-serial"; // Cam cho detached/disabled/null hoặc chưa bật tự chạy
  const statusTitle = !serialConnected
    ? "Chưa kết nối BR"
    : threadState
      ? `BR đã kết nối, Thread: ${threadState}`
      : threadRunOnConnect
        ? "BR đã kết nối, đang chạy Thread"
        : "BR đã kết nối";
  return (
    <header className="top-nav">
      <div className="top-nav-inner">
        <div className="top-nav-brand">
          <div className="top-nav-logo">
            <span className="material-symbols-outlined">hub</span>
          </div>
          <span className="top-nav-brand-text">OpenThread</span>
        </div>
        {!logoOnly && (
          <>
            <nav className="top-nav-links">
              <span
                className={`top-nav-status-dot ${statusClass}`}
                title={statusTitle}
                aria-label={statusTitle}
              />
              <button
                type="button"
                className={`top-nav-link ${currentPage === "status" ? "active" : ""}`}
                onClick={() => onNavigate("status")}
              >
                Status
              </button>
              <button
                type="button"
                className={`top-nav-link ${currentPage === "nodes" ? "active" : ""}`}
                onClick={() => onNavigate("nodes")}
                title={nodesCount !== undefined && nodesCount !== null ? `Nodes (${nodesCount})` : "Nodes"}
              >
                Nodes{nodesCount !== undefined && nodesCount !== null ? ` (${nodesCount})` : ""}
              </button>
            </nav>
            <div className="top-nav-actions">
              <button
                type="button"
                className="top-nav-icon-btn"
                aria-label="Notifications"
              >
                <span className="material-symbols-outlined">notifications</span>
              </button>
              <button
                type="button"
                className="top-nav-icon-btn"
                aria-label="Settings"
                onClick={() => onNavigate("settings")}
              >
                <span className="material-symbols-outlined">settings</span>
              </button>
              <button
                type="button"
                className="top-nav-icon-btn"
                aria-label="Account"
              >
                <span className="material-symbols-outlined">account_circle</span>
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
