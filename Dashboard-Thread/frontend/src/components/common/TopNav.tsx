import "./TopNav.scss";

export type NavPage = "dashboard" | "status" | "commissioner" | "console" | "settings";

interface TopNavProps {
  /** Chỉ hiện logo, ẩn Dashboard/Settings */
  logoOnly?: boolean;
  /** Trạng thái serial: false = xám; true = cam/tím/xanh lá/xanh dương theo state (xem threadState) */
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
  const useThreadColor = serialConnected && threadRunOnConnect;
  const stateLower = threadState?.toLowerCase();
  // child → xanh dương, router → tím, leader → xanh lá; detached/disabled/null → cam. Chưa bật tự chạy → cam.
  const statusClass = !serialConnected
    ? "status-disconnected"
    : useThreadColor && stateLower
      ? stateLower === "child"
        ? "status-thread-blue"
        : stateLower === "router"
          ? "status-thread-purple"
          : stateLower === "leader"
            ? "status-thread-green"
            : "status-serial"
      : "status-serial";
  const statusTitle = !serialConnected
    ? "Chưa kết nối serial"
    : useThreadColor && threadState
      ? `Serial đã kết nối, Thread: ${threadState}`
      : useThreadColor
        ? "Serial đã kết nối, đang chạy Thread"
        : "Serial đã kết nối";
  return (
    <nav className="top-nav">
      <div className="top-nav-inner">
        <span className="top-nav-brand">Thread Dashboard</span>
        {!logoOnly && (
          <div className="top-nav-links">
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
              title={dashboardCount !== undefined && dashboardCount !== null ? `Dashboard (${dashboardCount} thiết bị)` : "Dashboard"}
            >
              Dashboard{dashboardCount !== undefined && dashboardCount !== null ? ` (${dashboardCount})` : ""}
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
              Commissioner
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
          </div>
        )}
      </div>
    </nav>
  );
}
