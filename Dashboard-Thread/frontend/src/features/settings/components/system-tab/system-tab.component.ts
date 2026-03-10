import { LitElement, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import "@shared/components/confirm-modal/confirm-modal.component";

import "@settings/components/system-tab/system-tab.style.scss";

type ConfirmAction = "reset" | "factory" | null;

@customElement("system-tab")
export class SystemTabComponent extends LitElement {
  override createRenderRoot() {
    return this;
  }

  @property({ type: Boolean }) isConnected = false;
  @property({ attribute: false }) reset: () => Promise<{ success: boolean; error?: string }> = async () => ({ success: false });
  @property({ attribute: false }) factoryReset: () => Promise<{ success: boolean; error?: string }> = async () => ({ success: false });
  @property({ attribute: false }) showToast: (type: "success" | "error", message: string) => void = () => {};

  @state() private confirmAction: ConfirmAction = null;
  @state() private loading = false;

  private async _handleConfirm() {
    if (!this.confirmAction) return;
    const action = this.confirmAction;
    this.confirmAction = null;
    this.loading = true;
    try {
      const result = action === "reset" ? await this.reset() : await this.factoryReset();
      if (result.success) {
        this.showToast("success", action === "reset" ? "Đã gửi lệnh reset thiết bị." : "Đã gửi lệnh factory reset.");
      } else {
        this.showToast("error", result.error ?? "Thất bại.");
      }
    } finally {
      this.loading = false;
    }
  }

  render() {
    return html`
      <div class="form-page system-page">
        <div class="system-page-header">
          <h2 class="system-page-title">Hệ thống</h2>
          <p class="system-page-description">
            Quản lý trạng thái vận hành và thiết lập gốc của thiết bị Border Router.
          </p>
          ${!this.isConnected ? html`<p class="system-page-hint">Chưa kết nối BR. Vào tab BR Connection để thiết lập kết nối.</p>` : ""}
        </div>
        <div class="system-action-card system-card-restart">
          <div class="system-card-image">
            <div class="bg-img"></div>
            <div class="icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
            </div>
            <div class="dot-indicator">
              <div class="dot active"></div>
              <div class="dot"></div>
              <div class="dot"></div>
            </div>
          </div>
          <div class="system-card-content">
            <div class="system-card-info">
              <h3>Khởi động lại</h3>
              <p>Thực hiện khởi động lại phần mềm của thiết bị. Kết nối của tất cả các node sẽ bị gián đoạn tạm thời.</p>
            </div>
            <div class="system-card-action">
              <button type="button" class="system-btn system-btn-orange" ?disabled=${!this.isConnected || this.loading} @click=${() => (this.confirmAction = "reset")}>
                Reset
              </button>
            </div>
          </div>
        </div>
        <div class="system-danger-divider"><span>Vùng nguy hiểm</span></div>
        <div class="system-action-card system-card-factory">
          <div class="system-card-image">
            <div class="bg-img"></div>
            <div class="icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 3H5c-1.1 0-2 .9-2 2v4c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm4 0c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zM5 13h14c1.1 0 2 .9 2 2v4c0 1.1-.9 2-2 2H5c-1.1 0-2-.9-2-2v-4c0-1.1.9-2 2-2zm7 5c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm4 0c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z" />
              </svg>
            </div>
          </div>
          <div class="system-card-content">
            <div class="system-card-info">
              <h3>Factory Reset</h3>
              <p>
                Xóa toàn bộ cấu hình, dữ liệu mạng, thông tin định danh và đưa thiết bị về trạng thái xuất xưởng.
                <span class="warning-inline">Hành động này không thể hoàn tác.</span>
              </p>
            </div>
            <div class="system-card-action">
              <button type="button" class="system-btn system-btn-red" ?disabled=${!this.isConnected || this.loading} @click=${() => (this.confirmAction = "factory")}>
                Factory Reset
              </button>
            </div>
          </div>
        </div>
        <confirm-modal
          .open=${this.confirmAction === "reset"}
          .onClose=${() => !this.loading && (this.confirmAction = null)}
          title="Khởi động lại thiết bị"
          message="Thiết bị sẽ khởi động lại. Cấu hình Thread được giữ nguyên. Tiếp tục?"
          confirmLabel="Reset"
          variant="warning"
          .loading=${this.loading}
          .onConfirm=${this._handleConfirm}
        ></confirm-modal>
        <confirm-modal
          .open=${this.confirmAction === "factory"}
          .onClose=${() => !this.loading && (this.confirmAction = null)}
          title="Factory Reset"
          message="Toàn bộ cấu hình Thread sẽ bị xoá và thiết bị khởi động lại. Hành động này không thể hoàn tác. Tiếp tục?"
          confirmLabel="Factory Reset"
          variant="danger"
          .loading=${this.loading}
          .onConfirm=${this._handleConfirm}
        ></confirm-modal>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "system-tab": SystemTabComponent;
  }
}
