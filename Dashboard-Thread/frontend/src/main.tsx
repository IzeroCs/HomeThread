import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { WebSocketProvider } from "./contexts/websocket.context";
import { ToastProvider } from "./contexts/toast.context";
import App from "./app.component";
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
