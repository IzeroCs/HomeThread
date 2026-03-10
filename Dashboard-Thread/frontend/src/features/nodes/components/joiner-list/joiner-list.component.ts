import { LitElement, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { OtTableData } from "@shared/types/websocket.type";

import "@nodes/components/joiner-list/joiner-list.style.scss";

function normCol(name: string): string {
  return String(name).trim().toLowerCase();
}

function colIndex(headers: string[] | undefined, name: string): number {
  if (!headers?.length) return -1;
  const n = normCol(name);
  return headers.findIndex((h) => normCol(h) === n);
}

function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function formatEui64(sharedId: string): string {
  if (!sharedId) return "—";
  if (sharedId === "ANY") return sharedId;
  if (sharedId.startsWith("Discerner")) return sharedId;
  return sharedId.replace(/:/g, "").toUpperCase();
}

@customElement("joiner-list")
export class JoinerListComponent extends LitElement {
  override createRenderRoot() {
    return this;
  }

  @property({ type: Object }) joinerTable: OtTableData | null = null;
  @property({ attribute: false }) getJoinerTable: () => void = () => {};
  @property({ type: Boolean }) isConnected = false;

  @state() private now = Date.now();
  @state() private snapshot: { receivedAt: number; initialSeconds: number[] } = { receivedAt: 0, initialSeconds: [] };

  private _intervalId: ReturnType<typeof setInterval> | null = null;

  override connectedCallback() {
    super.connectedCallback();
    if (this.isConnected) this.getJoinerTable();
  }

  override willUpdate(changed: Map<string, unknown>) {
    if (changed.has("isConnected") && this.isConnected) this.getJoinerTable();
    if (changed.has("joinerTable") && this.joinerTable?.rows?.length) {
      const rows = this.joinerTable.rows;
      const headers = this.joinerTable.headers ?? [];
      const iExpiration = colIndex(headers, "Expiration");
      const initialSeconds = rows.map((row) => {
        const expirationMs = iExpiration >= 0 ? parseInt(row[iExpiration] ?? "0", 10) : 0;
        return Math.max(0, expirationMs / 1000);
      });
      this.snapshot = { receivedAt: Date.now(), initialSeconds };
    }
  }

  override updated(changed: Map<string, unknown>) {
    if (changed.has("joinerTable")) {
      const rows = this.joinerTable?.rows ?? [];
      if (rows.length > 0 && !this._intervalId) {
        this._intervalId = setInterval(() => {
          this.now = Date.now();
        }, 1000);
      } else if (rows.length === 0 && this._intervalId) {
        clearInterval(this._intervalId);
        this._intervalId = null;
      }
    }
  }

  override disconnectedCallback() {
    if (this._intervalId) clearInterval(this._intervalId);
    super.disconnectedCallback();
  }

  private _getJoinerCards(): { key: string; eui64: string; countdown: string }[] {
    const rows = this.joinerTable?.rows ?? [];
    const headers = this.joinerTable?.headers ?? [];
    const iSharedId = colIndex(headers, "SharedId");
    const iExpiration = colIndex(headers, "Expiration");
    const elapsedSec = (this.now - this.snapshot.receivedAt) / 1000;
    return rows.map((row, index) => {
      const sharedId = iSharedId >= 0 ? row[iSharedId] ?? "" : "";
      const expirationMs = iExpiration >= 0 ? parseInt(row[iExpiration] ?? "0", 10) : 0;
      const initialSec = this.snapshot.initialSeconds[index] ?? Math.max(0, expirationMs / 1000);
      const remainingSec = Math.max(0, initialSec - elapsedSec);
      const key = sharedId ? `joiner-${sharedId}-${expirationMs}` : `joiner-unknown-${expirationMs}-${index}`;
      return { key, eui64: formatEui64(sharedId), countdown: formatCountdown(remainingSec) };
    });
  }

  render() {
    const showSection = this.isConnected;
    if (!showSection) return html``;
    const error = this.joinerTable?.error;
    const joinerCards = this._getJoinerCards();
    const showEmpty = !error && joinerCards.length === 0;
    const showCards = !error && joinerCards.length > 0;
    const pendingCount = joinerCards.length;

    return html`
      <section class="joiner-list-section">
        <div class="joiner-list-header">
          <h2 class="joiner-list-title">
            <span class="material-symbols-outlined joiner-list-icon">group_add</span>
            Joiner List / Pending Commissioning
          </h2>
          ${showCards ? html`<span class="joiner-list-badge">${pendingCount} PENDING</span>` : ""}
        </div>
        ${error ? html`<p class="joiner-list-error">${error}</p>` : ""}
        ${showEmpty ? html`<p class="joiner-list-empty">No devices pending join.</p>` : ""}
        ${showCards
          ? html`
              <div class="joiner-list-cards">
                ${joinerCards.map(
                  (card) => html`
                    <div class="joiner-card">
                      <div class="joiner-card-top">
                        <span class="joiner-card-icon material-symbols-outlined">wifi</span>
                        <div class="joiner-card-timeout">
                          <span class="joiner-card-timeout-label">TIMEOUT</span>
                          <span class="joiner-card-timeout-value">${card.countdown}</span>
                        </div>
                      </div>
                      <div class="joiner-card-eui">
                        <span class="joiner-card-eui-label">EUI64 IDENTIFIER</span>
                        <span class="joiner-card-eui-value">${card.eui64}</span>
                      </div>
                      <div class="joiner-card-status">
                        <span class="joiner-card-status-dot" aria-hidden></span>
                        <span class="joiner-card-status-text">Joining...</span>
                      </div>
                    </div>
                  `
                )}
              </div>
            `
          : ""}
      </section>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "joiner-list": JoinerListComponent;
  }
}
