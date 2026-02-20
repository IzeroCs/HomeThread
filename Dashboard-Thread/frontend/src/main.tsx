import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { WebSocketProvider } from "./contexts/WebSocketContext";
import { ToastProvider } from "./contexts/ToastContext";
import App from "./App";
import "./index.scss";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WebSocketProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </WebSocketProvider>
  </StrictMode>
);
