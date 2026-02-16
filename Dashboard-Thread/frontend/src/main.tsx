import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { WebSocketProvider } from "./contexts/WebSocketContext";
import App from "./App";
import "./index.scss";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WebSocketProvider>
      <App />
    </WebSocketProvider>
  </StrictMode>
);
