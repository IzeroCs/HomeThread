import "./TopNav.scss";

export type NavPage = "dashboard" | "settings";

interface TopNavProps {
  /** Chỉ hiện logo, ẩn Dashboard/Settings */
  logoOnly?: boolean;
  currentPage?: NavPage;
  onNavigate?: (page: NavPage) => void;
}

export default function TopNav({
  logoOnly = false,
  currentPage = "dashboard",
  onNavigate = () => {},
}: TopNavProps) {
  return (
    <nav className="top-nav">
      <div className="top-nav-inner">
        <span className="top-nav-brand">Thread Dashboard</span>
        {!logoOnly && (
          <div className="top-nav-links">
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
