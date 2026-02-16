import "./TopNav.scss";

export type NavPage = "dashboard" | "status" | "settings";

interface TopNavProps {
  /** Chỉ hiện logo, ẩn Dashboard/Settings */
  logoOnly?: boolean;
  /** Trạng thái serial: false = xám; true = cam (chưa bật tự chạy) hoặc tím/xanh lá (đã bật tự chạy) */
  serialConnected?: boolean;
  /** State Thread: leader/router/child → xanh lá; còn lại (detached/disabled/null/lỗi) → tím khi đã bật tự chạy */
  threadState?: string | null;
  /** Đã bật "tự chạy Thread" → tím mặc định, xanh lá chỉ khi state leader/router/child; chưa bật thì cam */
  threadRunOnConnect?: boolean;
  currentPage?: NavPage;
  onNavigate?: (page: NavPage) => void;
}

export default function TopNav({
  logoOnly = false,
  serialConnected = false,
  threadState = null,
  threadRunOnConnect = false,
  currentPage = "dashboard",
  onNavigate = () => {},
}: TopNavProps) {
  const isLeader = threadState && ["leader", "router", "child"].includes(threadState.toLowerCase());
  const useThreadColor = serialConnected && threadRunOnConnect;
  // Khi đã bật tự chạy: xanh lá chỉ khi leader/router/child; còn lại (detached/disabled/null/lỗi) → tím. Cam chỉ khi chưa bật tự chạy.
  const statusClass = !serialConnected
    ? "status-disconnected"
    : useThreadColor
      ? isLeader
        ? "status-thread-green"
        : "status-thread-purple"
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
            >
              Dashboard
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
