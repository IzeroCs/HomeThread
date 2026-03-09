import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { WebSocketProvider } from "@shared/contexts/websocket.context";
import { ToastProvider } from "@shared/contexts/toast.context";
import App from "@/app.component";
import "@/index.scss";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WebSocketProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </WebSocketProvider>
  </StrictMode>
);
