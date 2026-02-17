import { useState, useEffect, useRef, FormEvent } from "react";
import { useWebSocketContext } from "../hooks/useWebSocketContext";
import type { CliResponse } from "../types/websocket";
import "./Console.scss";

interface LogEntry {
  type: "command" | "output" | "error";
  text: string;
  id?: string;
}

export default function Console() {
  const { serialStatus, sendCliCommand, onCliResponse } = useWebSocketContext();
  const [command, setCommand] = useState("");
  const [log, setLog] = useState<LogEntry[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);

  const isConnected = serialStatus?.isConnected ?? false;

  useEffect(() => {
    const unsubscribe = onCliResponse((data: CliResponse) => {
      if (data.command != null) {
        setLog((prev) => [...prev, { type: "command", text: `> ${data.command}`, id: data.id }]);
      }
      if (data.output?.length) {
        data.output.forEach((line) => {
          setLog((prev) => [...prev, { type: "output", text: line }]);
        });
      }
      if (data.error) {
        setLog((prev) => [...prev, { type: "error", text: data.error }]);
      }
    });
    return unsubscribe;
  }, [onCliResponse]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const cmd = command.trim();
    if (!cmd || !isConnected) return;
    sendCliCommand(cmd);
    setCommand("");
  };

  return (
    <div className="form-page">
      <div className="form-card console-card">
        <h1 className="form-page-title">Console</h1>
        <p className="form-page-description">
          Gửi lệnh OpenThread CLI tới thiết bị. Cần kết nối serial trước.
        </p>

        {!isConnected && (
          <div className="form-page-alert form-page-alert-warn">
            Chưa kết nối serial. Vào Dashboard → Connect Serial rồi quay lại đây.
          </div>
        )}

        <div className="console-log" role="log" aria-live="polite">
          {log.length === 0 && (
            <div className="console-log-placeholder">
              Output sẽ hiển thị ở đây. Nhập lệnh (vd: state, scan) rồi nhấn Gửi.
            </div>
          )}
          {log.map((entry, i) => (
            <div key={i} className={`console-log-line console-log-line--${entry.type}`}>
              {entry.text}
            </div>
          ))}
          <div ref={logEndRef} />
        </div>

        <form onSubmit={handleSubmit} className="console-form">
          <div className="form-group">
            <label htmlFor="console-command">Lệnh CLI</label>
            <input
              id="console-command"
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="vd: state, scan, panid"
              autoComplete="off"
              spellCheck={false}
              disabled={!isConnected}
            />
          </div>
          <div className="form-actions">
            <button type="submit" className="btn-primary" disabled={!isConnected || !command.trim()}>
              Gửi
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
