import { useState, useMemo } from "react";
import "./Sidebar.scss";

export type NavPage =
  | "nodes"
  | "status"
  | "settings"
  | "settings-br"
  | "settings-openthread"
  | "settings-system";

interface SidebarProps {
  /** Chỉ hiện logo, ẩn nav và footer */
  logoOnly?: boolean;
  /** Trạng thái BR: false = xám; true = cam/tím/xanh lá/xanh dương theo state */
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

const PRIMARY_ITEMS: { page: NavPage; label: string; icon: string }[] = [
  { page: "status", label: "Status", icon: "speed" },
  { page: "nodes", label: "Nodes", icon: "account_tree" },
  { page: "settings", label: "Settings", icon: "settings" },
];

const SETTINGS_ITEMS: { page: NavPage; label: string; icon: string }[] = [
  // BR Connection: đường mạng / LAN
  { page: "settings-br", label: "BR Connection", icon: "lan" },
  // OpenThread config: lưới / topology Thread
  { page: "settings-openthread", label: "OpenThread", icon: "device_hub" },
  // System: cảnh báo / vùng nguy hiểm
  { page: "settings-system", label: "System", icon: "warning" },
];

export default function Sidebar({
  logoOnly = false,
  serialConnected = false,
  threadState = null,
  threadRunOnConnect = false,
  nodesCount = null,
  currentPage = "nodes",
  onNavigate = () => {},
}: SidebarProps) {
  const stateLower = threadState?.toLowerCase();
  const statusClass = !serialConnected
    ? "status-disconnected"
    : stateLower === "child"
      ? "status-thread-blue"
      : stateLower === "router"
        ? "status-thread-purple"
        : stateLower === "leader"
          ? "status-thread-green"
          : "status-serial";
  const statusTitle = !serialConnected
    ? "Chưa kết nối BR"
    : threadState
      ? `BR đã kết nối, Thread: ${threadState}`
        : threadRunOnConnect
          ? "BR đã kết nối, đang chạy Thread"
          : "BR đã kết nối";

  const isSettingsPage = useMemo(
    () =>
      currentPage === "settings" ||
      currentPage === "settings-br" ||
      currentPage === "settings-openthread" ||
      currentPage === "settings-system",
    [currentPage],
  );
  const [settingsOpen, setSettingsOpen] = useState<boolean>(isSettingsPage);

  const handlePrimaryClick = (page: NavPage) => {
    if (page === "settings") {
      // Toggle dropdown; nếu đang ở trang settings thì chỉ gập/mở, không đổi section
      setSettingsOpen((open) => !open);
      if (!isSettingsPage) {
        onNavigate("settings-br");
      }
      return;
    }
    onNavigate(page);
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <span className="material-symbols-outlined">hub</span>
        </div>
        <div className="sidebar-brand-row">
          <span className="sidebar-brand-text">OpenThread</span>
          {!logoOnly && (
            <span
              className={`sidebar-status-dot ${statusClass}`}
              title={statusTitle}
              aria-label={statusTitle}
            />
          )}
        </div>
      </div>
      {!logoOnly && (
        <>
          <nav className="sidebar-nav">
            {PRIMARY_ITEMS.map(({ page, label, icon }) => (
              <button
                key={page}
                type="button"
                className={`sidebar-nav-item ${
                  page === "settings" ? (isSettingsPage ? "active" : "") : currentPage === page ? "active" : ""
                }`}
                onClick={() => handlePrimaryClick(page)}
                title={
                  page === "nodes" && nodesCount !== undefined && nodesCount !== null
                    ? `${label} (${nodesCount})`
                    : label
                }
              >
                <span className="material-symbols-outlined">{icon}</span>
                <span className="sidebar-nav-label">
                  {label}
                  {page === "nodes" && nodesCount !== undefined && nodesCount !== null
                    ? ` (${nodesCount})`
                    : ""}
                </span>
                {page === "settings" && (
                  <span
                    className={`material-symbols-outlined sidebar-expand-icon ${
                      settingsOpen ? "sidebar-expand-icon--open" : ""
                    }`}
                  >
                    expand_more
                  </span>
                )}
              </button>
            ))}

            <div className={`sidebar-section ${settingsOpen ? "sidebar-section--open" : "sidebar-section--closed"}`}>
              <div className="sidebar-section-items">
                {SETTINGS_ITEMS.map(({ page, label, icon }) => (
                  <button
                    key={page}
                    type="button"
                    className={`sidebar-nav-item sidebar-nav-item--nested ${
                      currentPage === page ? "active" : ""
                    }`}
                    onClick={() => onNavigate(page)}
                    title={label}
                  >
                    <span className="material-symbols-outlined sidebar-nav-nested-icon">{icon}</span>
                    <span className="sidebar-nav-label">{label}</span>
                  </button>
                ))}
              </div>
            </div>
          </nav>
          <div className="sidebar-footer">
            {/* Optional: Account or empty */}
          </div>
        </>
      )}
    </aside>
  );
}
