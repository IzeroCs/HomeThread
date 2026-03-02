import { useEffect, useMemo, useState } from "react";
import type { OtTableData } from "../../types/websocket";
import "./JoinerList.scss";

function normCol(name: string): string {
  return String(name).trim().toLowerCase();
}

function colIndex(headers: string[] | undefined, name: string): number {
  if (!headers?.length) return -1;
  const n = normCol(name);
  return headers.findIndex((h) => normCol(h) === n);
}

/** Format seconds as MM:SS */
function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/** Display SharedId (EUI64 with colons or ANY/Discerner) - compact for card */
function formatEui64(sharedId: string): string {
  if (!sharedId) return "—";
  if (sharedId === "ANY") return sharedId;
  if (sharedId.startsWith("Discerner")) return sharedId;
  return sharedId.replace(/:/g, "").toUpperCase();
}

interface JoinerListProps {
  joinerTable: OtTableData | null;
  getJoinerTable: () => void;
  isConnected: boolean;
}

export default function JoinerList({
  joinerTable,
  getJoinerTable,
  isConnected,
}: JoinerListProps) {
  const [now, setNow] = useState(() => Date.now());
  const [snapshot, setSnapshot] = useState<{ receivedAt: number; initialSeconds: number[] }>({
    receivedAt: 0,
    initialSeconds: [],
  });

  const rows = joinerTable?.rows ?? [];
  const headers = joinerTable?.headers ?? [];
  const error = joinerTable?.error;

  const iSharedId = colIndex(headers, "SharedId");
  const iExpiration = colIndex(headers, "Expiration");

  // Có dữ liệu mới → tính lại seconds (expirationMs/1000) và lưu thời điểm nhận
  useEffect(() => {
    if (rows.length === 0) return;
    const initialSeconds = rows.map((row) => {
      const expirationMs = iExpiration >= 0 ? parseInt(row[iExpiration] ?? "0", 10) : 0;
      return Math.max(0, expirationMs / 1000);
    });
    setSnapshot({ receivedAt: Date.now(), initialSeconds });
  }, [joinerTable, iExpiration]); // joinerTable đổi = dữ liệu mới từ backend

  // Đếm ngược mỗi giây (mượt, không cần chờ poll)
  useEffect(() => {
    if (rows.length === 0) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [rows.length]);

  const pendingCount = rows.length;

  /** Đếm ngược từ initialSeconds - (now - receivedAt), có data mới thì snapshot đã được reset */
  const joinerCards = useMemo(() => {
    const elapsedSec = (now - snapshot.receivedAt) / 1000;
    return rows.map((row, index) => {
      const sharedId = iSharedId >= 0 ? row[iSharedId] ?? "" : "";
      const expirationMs = iExpiration >= 0 ? parseInt(row[iExpiration] ?? "0", 10) : 0;
      const initialSec = snapshot.initialSeconds[index] ?? Math.max(0, expirationMs / 1000);
      const remainingSec = Math.max(0, initialSec - elapsedSec);
      const key = sharedId
        ? `joiner-${sharedId}-${expirationMs}`
        : `joiner-unknown-${expirationMs}-${index}`;
      return {
        key,
        eui64: formatEui64(sharedId),
        countdown: formatCountdown(remainingSec),
      };
    });
  }, [rows, iSharedId, iExpiration, snapshot, now]);

  useEffect(() => {
    if (isConnected) getJoinerTable();
  }, [isConnected, getJoinerTable]);

  const showSection = isConnected;
  const showEmpty = showSection && !error && joinerCards.length === 0;
  const showCards = showSection && !error && joinerCards.length > 0;

  if (!showSection) return null;

  return (
    <section className="joiner-list-section">
      <div className="joiner-list-header">
        <h2 className="joiner-list-title">
          <span className="material-symbols-outlined joiner-list-icon">group_add</span>
          Joiner List / Pending Commissioning
        </h2>
        {showCards && (
          <span className="joiner-list-badge">{pendingCount} PENDING</span>
        )}
      </div>

      {error && (
        <p className="joiner-list-error">{error}</p>
      )}

      {showEmpty && (
        <p className="joiner-list-empty">No devices pending join.</p>
      )}

      {showCards && (
        <div className="joiner-list-cards">
          {joinerCards.map((card) => (
            <div key={card.key} className="joiner-card">
              <div className="joiner-card-top">
                <span className="joiner-card-icon material-symbols-outlined">wifi</span>
                <div className="joiner-card-timeout">
                  <span className="joiner-card-timeout-label">TIMEOUT</span>
                  <span className="joiner-card-timeout-value">{card.countdown}</span>
                </div>
              </div>
              <div className="joiner-card-eui">
                <span className="joiner-card-eui-label">EUI64 IDENTIFIER</span>
                <span className="joiner-card-eui-value">{card.eui64}</span>
              </div>
              <div className="joiner-card-status">
                <span className="joiner-card-status-dot" aria-hidden />
                <span className="joiner-card-status-text">Joining...</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
