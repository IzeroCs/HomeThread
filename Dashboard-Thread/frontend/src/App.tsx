import { useState } from "react";
import { useWebSocketContext } from "./hooks/useWebSocketContext";
import Settings, { type SettingsSection } from "./components/Settings";
import Status from "./components/Status";
import Nodes from "./components/Nodes/Nodes";
import Sidebar, { type NavPage } from "./components/common/Sidebar";
import ToastContainer from "./components/common/ToastContainer";
import WaitingForBackend from "./components/common/WaitingForBackend";
import "./App.scss";

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
