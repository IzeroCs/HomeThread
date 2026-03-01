import "./TopNav.scss";

export type NavPage = "dashboard" | "status" | "commissioner" | "console" | "settings";

interface TopNavProps {
  /** Chỉ hiện logo, ẩn Dashboard/Settings */
  logoOnly?: boolean;
  /** Trạng thái BR: false = xám; true = cam/tím/xanh lá/xanh dương theo state (xem threadState) */
  serialConnected?: boolean;
  /** State Thread: leader → xanh lá, router → tím, child → xanh dương; detached/disabled → cam */
  threadState?: string | null;
  /** Đã bật "tự chạy Thread" → màu theo state; chưa bật thì cam */
  threadRunOnConnect?: boolean;
  /** Tổng router + child (hiển thị bên cạnh "Dashboard" khi có) */
  dashboardCount?: number | null;
  currentPage?: NavPage;
  onNavigate?: (page: NavPage) => void;
}

export default function TopNav({
  logoOnly = false,
  serialConnected = false,
  threadState = null,
  threadRunOnConnect = false,
  dashboardCount = null,
  currentPage = "dashboard",
  onNavigate = () => {},
}: TopNavProps) {
  const isCommissionerEnabled = threadState?.toLowerCase() === "leader";
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
                className={`top-nav-link ${currentPage === "dashboard" ? "active" : ""}`}
                onClick={() => onNavigate("dashboard")}
                title={dashboardCount !== undefined && dashboardCount !== null ? `Devices (${dashboardCount})` : "Devices"}
              >
                Devices{dashboardCount !== undefined && dashboardCount !== null ? ` (${dashboardCount})` : ""}
              </button>
              <button
                type="button"
                className={`top-nav-link ${currentPage === "commissioner" ? "active" : ""}`}
                onClick={() => onNavigate("commissioner")}
                disabled={currentPage !== "commissioner" && !isCommissionerEnabled}
                title={
                  isCommissionerEnabled
                    ? "Commissioner"
                    : currentPage === "commissioner"
                      ? "Đang ở Commissioner (cần state leader để dùng)"
                      : "Chỉ khả dụng khi state là leader"
                }
              >
                Topology
              </button>
              <button
                type="button"
                className={`top-nav-link ${currentPage === "console" ? "active" : ""}`}
                onClick={() => onNavigate("console")}
              >
                Console
              </button>
              <button
                type="button"
                className={`top-nav-link ${currentPage === "settings" ? "active" : ""}`}
                onClick={() => onNavigate("settings")}
              >
                Settings
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
