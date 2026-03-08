import { useState } from "react";
import { useWebSocketContext } from "./hooks/use-websocket-context.hook";
import Settings, { type SettingsSection } from "./components/settings";
import Status from "./components/status/status.component";
import Nodes from "./components/nodes/nodes.component";
import Sidebar, { type NavPage } from "./components/common/sidebar/sidebar.component";
import ToastContainer from "./components/common/toast-container/toast-container.component";
import WaitingForBackend from "./components/common/waiting-for-backend/waiting-for-backend.component";
import "./app.style.scss";

function App() {
  const [page, setPage] = useState<NavPage>("status");

  const {
    connected: wsConnected,
    serialStatus,
    testBrConnect,
    threadState,
    threadRunOnConnect,
    routerTable,
    childTable,
  } = useWebSocketContext();

  const nodesCount = (routerTable?.rows?.length ?? 0) + (childTable?.rows?.length ?? 0);

  if (!wsConnected) {
    return (
      <div className="app-layout app-layout--waiting">
        <div className="app-container">
          <WaitingForBackend />
        </div>
      </div>
    );
  }

  const isSettingsPage =
    page === "settings" ||
    page === "settings-br" ||
    page === "settings-openthread" ||
    page === "settings-system";

  const settingsSection: SettingsSection =
    page === "settings-openthread" ? "openthread" : page === "settings-system" ? "system" : "br";

  return (
    <div className="app-layout">
      <Sidebar
        currentPage={page}
        onNavigate={setPage}
        serialConnected={serialStatus?.isConnected ?? false}
        threadState={threadState}
        threadRunOnConnect={threadRunOnConnect}
        nodesCount={nodesCount}
      />
      <ToastContainer />
      <main className="app-main">
        {page === "status" && (
          <div className="app-container">
            <Status />
          </div>
        )}
        {isSettingsPage && (
          <div className="app-container">
            <Settings
              isConnected={serialStatus?.isConnected ?? false}
              onTestBrConnect={testBrConnect}
              activeSection={settingsSection}
            />
          </div>
        )}
        {page === "nodes" && (
          <div className="app-container">
            <Nodes />
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
