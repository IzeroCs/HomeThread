import { useState, useEffect, useRef } from "react";
import { useWebSocketContext } from "../hooks/useWebSocketContext";
import "./Console.scss";

interface LogEntry {
  type: "data";
  text: string;
}

export default function Console() {
  const { serialStatus, onSerialData } = useWebSocketContext();
  const [log, setLog] = useState<LogEntry[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);

  const isConnected = serialStatus?.isConnected ?? false;

  useEffect(() => {
    const unsubscribe = onSerialData((data: string) => {
      if (data != null && String(data).trim()) {
        setLog((prev) => [...prev, { type: "data", text: String(data) }]);
      }
    });
    return unsubscribe;
  }, [onSerialData]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log]);

  return (
    <div className="form-page">
      <div className="form-card console-card">
        <h1 className="form-page-title">Console</h1>
        <p className="form-page-description">
          Giao tiếp qua frame protocol (USB CDC). Dữ liệu serial từ thiết bị hiển thị bên dưới. Cần kết nối serial trước.
        </p>

        {!isConnected && (
          <div className="form-page-alert form-page-alert-warn">
            Chưa kết nối serial. Vào Dashboard → Connect Serial rồi quay lại đây.
          </div>
        )}

        <div className="console-log" role="log" aria-live="polite">
          {log.length === 0 && (
            <div className="console-log-placeholder">
              Dữ liệu serial (frame) sẽ hiển thị ở đây khi đã kết nối và triển khai frame protocol.
            </div>
          )}
          {log.map((entry, i) => (
            <div key={i} className={`console-log-line console-log-line--${entry.type}`}>
              {entry.text}
            </div>
          ))}
          <div ref={logEndRef} />
        </div>
      </div>
    </div>
  );
}
