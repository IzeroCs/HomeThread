import { LitElement, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { store } from "@/core/store/store";
import { createLocaleController } from "@/core/store/locale-controller";
import { LitStoreController, shallowEqual } from "@namorix/core/store";
import { selectBrStatus, selectJoinerTable, selectThreadState } from "@/core/store/selectors";
import { wsCommissionerConnect } from "@/core/store/thunks/ws.thunks";
import { wsEmitGetJoinerTable } from "@/core/store/thunks/ws.emit";
import { showToast } from "@/core/store/toast";
import { t } from "@/core/i18n/i18n";

import "@/core/components/appbar/appbar";
import "@/core/components/modal/modal.component";
import "@monitor/joiner/joiner.style.scss";

const DEFAULT_EUI64 = "f0f5bdfffe104b24";
const DEFAULT_PSK = "H01THREAD";
const TIMEOUT_OPTIONS = [60, 120, 300] as const;
const DEFAULT_TIMEOUT = 60;

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

type JoinerStatus = "joining" | "pending" | "expired";

interface JoinerRowWithMeta {
  key: string;
  joinerId: string;
  eui64: string;
  passphrase: string;
  countdown: string;
  countdownSeconds: number;
  status: JoinerStatus;
}

@customElement("joiner-view")
export class JoinerViewComponent extends LitElement {
  override createRenderRoot() {
    return this;
  }

  @property({ attribute: false }) showToast: (type: "success" | "error", message: string) => void = () => {};

  private readonly locale = createLocaleController(this);

  private readonly appState = new LitStoreController(
    this,
    store,
    (s) => ({
      isConnected: selectBrStatus(s)?.isConnected ?? false,
      joinerTable: selectJoinerTable(s),
      threadState: selectThreadState(s),
    }),
    shallowEqual
  );

  @state() private now = Date.now();
  @state() private snapshot: { receivedAt: number; initialSeconds: number[] } = { receivedAt: 0, initialSeconds: [] };
  @state() private isCommissionModalOpen = false;
  @state() private commissionEui64 = DEFAULT_EUI64;
  @state() private commissionPsk = DEFAULT_PSK;
  @state() private commissionTimeoutSeconds: (typeof TIMEOUT_OPTIONS)[number] = DEFAULT_TIMEOUT;
  @state() private commissionConnecting = false;
  private _intervalId: ReturnType<typeof setInterval> | null = null;
  private _prevConnected = false;
  private _joinerRowsRef: string[][] | null = null;

  /** Commissioner allowed when attached as leader, router, or child. */
  private get _canCommission(): boolean {
    const s = this.appState.value.threadState?.toLowerCase();
    return s === "leader" || s === "router" || s === "child";
  }

  private _openCommissionModal() {
    this.isCommissionModalOpen = true;
  }

  private _onHeaderAction(e: CustomEvent<{ id: string }>) {
    if (e.detail.id === "commission") this._openCommissionModal();
  }

  private _resetCommissionForm() {
    this.commissionEui64 = DEFAULT_EUI64;
    this.commissionPsk = DEFAULT_PSK;
    this.commissionTimeoutSeconds = DEFAULT_TIMEOUT;
  }

  private _closeCommissionModal() {
    this.commissionConnecting = false;
    this._resetCommissionForm();
    this.isCommissionModalOpen = false;
  }

  private async _handleCommissionConnect() {
    const eui64 = this.commissionEui64.trim();
    const psk = this.commissionPsk.trim();
    if (!eui64 || !psk) {
      showToast("error", t("joiner.errors.emptyEui64OrPsk"));
      return;
    }
    this.commissionConnecting = true;
    const result = await store
      .dispatch(
        wsCommissionerConnect({
          eui64,
          psk,
          timeoutSeconds: this.commissionTimeoutSeconds,
        })
      )
      .unwrap();
    if (!this.commissionConnecting) return;
    this.commissionConnecting = false;
    if (result.success) {
      showToast("success", t("joiner.toast.addedJoiner"));
      this._closeCommissionModal();
    } else {
      showToast("error", result.error ?? t("joiner.errors.connectFailedFallback"));
    }
  }

  override connectedCallback() {
    super.connectedCallback();
    if (this.appState.value.isConnected) wsEmitGetJoinerTable();
    this._prevConnected = this.appState.value.isConnected;
  }

  override willUpdate(_changed: Map<string, unknown>) {
    const { joinerTable, isConnected } = this.appState.value;
    if (isConnected && !this._prevConnected) wsEmitGetJoinerTable();
    this._prevConnected = isConnected;

    const rowsRef = joinerTable?.rows ?? null;
    if (rowsRef && rowsRef !== this._joinerRowsRef && joinerTable) {
      this._joinerRowsRef = rowsRef;
      const rows = joinerTable.rows ?? [];
      const headers = joinerTable.headers ?? [];
      const iExpiration = colIndex(headers, "Expiration");
      const initialSeconds = rows.map((row) => {
        const expirationMs = iExpiration >= 0 ? parseInt(row[iExpiration] ?? "0", 10) : 0;
        return Math.max(0, expirationMs / 1000);
      });
      this.snapshot = { receivedAt: Date.now(), initialSeconds };
    }
  }

  override updated(_changed: Map<string, unknown>) {
    const rows = this.appState.value.joinerTable?.rows ?? [];
    if (rows.length > 0 && !this._intervalId) {
      this._intervalId = setInterval(() => {
        this.now = Date.now();
      }, 1000);
    } else if (rows.length === 0 && this._intervalId) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }
  }

  override disconnectedCallback() {
    if (this._intervalId) clearInterval(this._intervalId);
    super.disconnectedCallback();
  }

  private _getRowsWithMeta(): JoinerRowWithMeta[] {
    const rows = this.appState.value.joinerTable?.rows ?? [];
    const headers = this.appState.value.joinerTable?.headers ?? [];
    const iSharedId = colIndex(headers, "SharedId");
    const iExpiration = colIndex(headers, "Expiration");
    const iPskd = colIndex(headers, "PSKD");
    const elapsedSec = (this.now - this.snapshot.receivedAt) / 1000;
    return rows.map((row, index) => {
      const sharedId = iSharedId >= 0 ? row[iSharedId] ?? "" : "";
      const expirationMs = iExpiration >= 0 ? parseInt(row[iExpiration] ?? "0", 10) : 0;
      const passphrase = iPskd >= 0 ? (row[iPskd] ?? "").trim() || "—" : "—";
      const initialSec = this.snapshot.initialSeconds[index] ?? Math.max(0, expirationMs / 1000);
      const remainingSec = Math.max(0, initialSec - elapsedSec);
      const key = sharedId ? `joiner-${sharedId}-${expirationMs}` : `joiner-unknown-${expirationMs}-${index}`;
      const eui64 = formatEui64(sharedId);
      const status: JoinerStatus = remainingSec === 0 ? "expired" : remainingSec <= 60 ? "joining" : "pending";
      return {
        key,
        joinerId: `J-${100 + index + 1}`,
        eui64,
        passphrase,
        countdown: formatCountdown(remainingSec),
        countdownSeconds: remainingSec,
        status,
      };
    });
  }

  private async _copyToClipboard(text: string, label: string) {
    if (!text || text === "—") return;
    try {
      await navigator.clipboard.writeText(text);
      showToast("success", t("joiner.toast.copied", { label }));
    } catch {
      showToast("error", t("joiner.errors.copyFailed"));
    }
  }

  private _onCancelJoiner(_row: JoinerRowWithMeta) {
    // TODO: call API to remove joiner when available
    wsEmitGetJoinerTable();
  }

  private _renderCommissionBody() {
    return html`
      <div>
        ${!this._canCommission
          ? html`
              <div class="modal-alert modal-alert--warn">
                ${t("joiner.commission.notAvailable")}
                ${this.appState.value.threadState
                  ? ` ${t("joiner.commission.currentState", { state: this.appState.value.threadState })}`
                  : ` ${t("joiner.commission.fetchingState")}`}
              </div>
            `
          : ""}
        <div class="form-page-form">
          <div class="form-field">
            <label class="form-label" for="commission-modal-eui64">
              Joiner EUI64 <span class="form-required">*</span>
            </label>
            <div class="form-control-wrap">
              <span class="material-symbols-outlined form-control-icon" aria-hidden>qr_code_2</span>
              <input
                id="commission-modal-eui64"
                type="text"
                class="form-control form-control--mono form-control--with-icon"
                .value=${this.commissionEui64}
                @input=${(e: Event) => (this.commissionEui64 = (e.target as HTMLInputElement).value)}
                placeholder=${t("joiner.commissionModal.placeholders.eui64")}
                autocomplete="off"
                spellcheck="false"
                ?disabled=${this.commissionConnecting || !this._canCommission}
              />
            </div>
            <p class="form-helper">The unique identifier for the device.</p>
          </div>
          <div class="form-field">
            <label class="form-label" for="commission-modal-psk">
              Joiner PIN <span class="form-required">*</span>
            </label>
            <div class="form-control-wrap">
              <span class="material-symbols-outlined form-control-icon" aria-hidden>pin</span>
              <input
                id="commission-modal-psk"
                type="text"
                class="form-control form-control--with-icon"
                .value=${this.commissionPsk}
                @input=${(e: Event) => (this.commissionPsk = (e.target as HTMLInputElement).value)}
                placeholder=${t("joiner.commissionModal.placeholders.pin")}
                autocomplete="off"
                ?disabled=${this.commissionConnecting || !this._canCommission}
              />
            </div>
            <p class="form-helper">The commissioning credential provided with the device.</p>
          </div>
          <div class="form-field">
            <label class="form-label">${t("joiner.commissionModal.timeoutLabel")}</label>
            <div class="form-radio-row" role="radiogroup" aria-label=${t("joiner.commissionModal.timeoutAriaLabel")}>
              ${TIMEOUT_OPTIONS.map((sec) => html`
                <label class="form-radio">
                  <input
                    class="form-radio-input"
                    type="radio"
                    name="commission-timeout"
                    .value=${String(sec)}
                    .checked=${this.commissionTimeoutSeconds === sec}
                    @change=${() => (this.commissionTimeoutSeconds = sec)}
                    ?disabled=${this.commissionConnecting || !this._canCommission}
                  />
                  <span class="form-radio-pill">${sec}s</span>
                </label>
              `)}
            </div>
          </div>
          <div class="modal-info-box">
            <span class="material-symbols-outlined modal-info-box__icon" aria-hidden>info</span>
            <p class="modal-info-box__text">
              ${t("joiner.commissionModal.ensurePoweredOn")}
            </p>
          </div>
        </div>
      </div>
    `;
  }

  render() {
    void this.locale.value;
    const allRows = this._getRowsWithMeta();
    const hasRows = allRows.length > 0;
    const { isConnected, joinerTable, threadState } = this.appState.value;
    const isNetworkStable =
      threadState != null &&
      ["leader", "router", "child"].includes(threadState.toLowerCase());

    return html`
      <page-header
        heading=${t("joiner.header.title")}
        subtitle=${t("joiner.header.subtitle")}
        .actions=${[{
          id: "commission",
          icon: "add_circle",
          disabled: !this._canCommission,
          label: t("joiner.actions.addJoiner"),
          style: "filled",
          tone: "info",
        }]}
        @action-click=${this._onHeaderAction}
      ></page-header>
      <div class="page-container">
        <div class="joiner-page">
          ${isConnected ? html`
            <div class="joiner-status-cards">
              <div class="joiner-status-card">
                <p class="joiner-status-card-label">${t("joiner.dashboard.activeJoiners")}</p>
                <div class="joiner-status-card-value">${allRows.length}</div>
                ${allRows.length > 0 ? html`<p class="joiner-status-card-sub">${t("joiner.dashboard.inQueue", { count: allRows.length })}</p>` : ""}
              </div>
              <div class="joiner-status-card">
                <p class="joiner-status-card-label">${t("joiner.dashboard.pendingAuth")}</p>
                <div class="joiner-status-card-value">0</div>
                <p class="joiner-status-card-sub">—</p>
              </div>
              <div class="joiner-status-card">
                <p class="joiner-status-card-label">${t("joiner.dashboard.failedAttempts")}</p>
                <div class="joiner-status-card-value">0</div>
                <p class="joiner-status-card-sub">—</p>
              </div>
              <div class="joiner-status-card">
                <p class="joiner-status-card-label">${t("joiner.dashboard.networkStatus")}</p>
                <div class="joiner-status-card-row">
                  <span class="joiner-status-dot ${isNetworkStable ? "joiner-status-dot--connected" : "joiner-status-dot--disconnected"}"></span>
                  <span class="joiner-status-card-value" style="font-size: 0.875rem; margin: 0;">
                    ${isNetworkStable ? t("joiner.dashboard.networkStable") : t("joiner.dashboard.networkDisconnected")}
                  </span>
                </div>
              </div>
            </div>
          ` : ""}

          <section class="joiner-section">
            <div class="joiner-queue-card">
              <div class="joiner-table-wrap">
                <table class="joiner-table">
                  <thead>
                    <tr>
                      <th>${t("joiner.table.columns.joinerId")}</th>
                      <th>${t("joiner.table.columns.eui64")}</th>
                      <th>${t("joiner.table.columns.passphrase")}</th>
                      <th>${t("joiner.table.columns.timeoutRemaining")}</th>
                      <th>${t("joiner.table.columns.status")}</th>
                      <th class="joiner-th-actions">${t("joiner.table.columns.actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${!isConnected ? html`
                      <tr class="joiner-row-empty">
                        <td class="joiner-cell-empty joiner-muted" colspan="6">
                          ${t("joiner.table.empty.connectToBr")}
                        </td>
                      </tr>
                    ` : joinerTable?.error ? html`
                      <tr class="joiner-row-empty">
                        <td class="joiner-cell-empty joiner-error" colspan="6">
                          ${joinerTable?.error}
                        </td>
                      </tr>
                    ` : !hasRows ? html`
                      <tr class="joiner-row-empty">
                        <td class="joiner-cell-empty joiner-muted" colspan="6">
                          ${t("joiner.table.empty.none")}
                        </td>
                      </tr>
                    ` : allRows.map((row) => html`
                      <tr>
                        <td class="joiner-cell-id">${row.joinerId}</td>
                        <td class="joiner-cell-mono">${row.eui64}</td>
                        <td>
                          <div class="joiner-cell-passphrase">
                            <span class="joiner-passphrase-pill">${row.passphrase}</span>
                            <button
                              type="button"
                              class="joiner-btn-copy"
                              aria-label=${row.passphrase !== "—" ? t("joiner.table.actions.copyPassphrase") : t("joiner.table.actions.copyEui64")}
                              @click=${() => this._copyToClipboard(row.passphrase !== "—" ? row.passphrase : row.eui64, row.passphrase !== "—" ? "Passphrase" : "EUI64")}
                            >
                              <span class="material-symbols-outlined" aria-hidden>content_copy</span>
                            </button>
                          </div>
                        </td>
                        <td>
                          <div class="joiner-cell-timeout ${row.status === "expired" ? "joiner-timeout--expired" : ""}">
                            <span class="material-symbols-outlined" style="font-size: 16px;" aria-hidden>timer</span>
                            <span class="joiner-cell-mono">${row.countdown}</span>
                          </div>
                        </td>
                        <td>
                          <span class="joiner-status-badge joiner-status-badge--${row.status}">
                            <span class="joiner-status-dot-badge"></span>
                            ${row.status === "joining"
                              ? t("joiner.table.status.joining")
                              : row.status === "pending"
                                ? t("joiner.table.status.pending")
                                : t("joiner.table.status.expired")}
                          </span>
                        </td>
                        <td class="joiner-cell-actions">
                          <button
                            type="button"
                            class="joiner-btn-cancel"
                            aria-label=${t("joiner.table.actions.cancelJoiner")}
                            @click=${() => this._onCancelJoiner(row)}
                          >
                            <span class="material-symbols-outlined" style="font-size: 20px;" aria-hidden>cancel</span>
                          </button>
                        </td>
                      </tr>
                    `)}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <modal-dialog
            .open=${this.isCommissionModalOpen}
            .shouldRender=${() => isConnected}
            .title=${t("joiner.commissionModal.title")}
            .subtitle=${t("joiner.commissionModal.subtitle")}
            .body=${this._renderCommissionBody()}
            .cancelAction=${{
              onClick: () => this._closeCommissionModal(),
            }}
            .confirmAction=${{
              label: t("joiner.commissionModal.start"),
              style: "filled",
              tone: "warning",
              onClick: () => this._handleCommissionConnect(),
              disabled: !this._canCommission,
              loading: this.commissionConnecting,
              icon: "play_arrow",
            }}
            .onClose=${() => this._closeCommissionModal()}
          ></modal-dialog>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "joiner-view": JoinerViewComponent;
  }
}
