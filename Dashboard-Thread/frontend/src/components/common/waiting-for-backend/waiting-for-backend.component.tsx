import "./waiting-for-backend.style.scss";

export default function WaitingForBackend() {
  return (
    <div className="waiting-for-backend">
      <div className="waiting-for-backend__spinner-wrap">
        <div className="waiting-for-backend__spinner" aria-hidden />
        <span className="material-symbols-outlined waiting-for-backend__spinner-icon" aria-hidden>
          router
        </span>
      </div>

      <div className="waiting-for-backend__copy">
        <h1 className="waiting-for-backend__title">Waiting for backend...</h1>
        <p className="waiting-for-backend__subtitle">Start the backend or reconnecting.</p>
      </div>

      <div className="waiting-for-backend__card">
        <div className="waiting-for-backend__card-inner">
          <div className="waiting-for-backend__card-header">
            <div>
              <span className="waiting-for-backend__card-label">Connection Pipeline</span>
              <p className="waiting-for-backend__card-status">SYSTEM STATUS: RETRYING</p>
            </div>
          </div>
          <div className="waiting-for-backend__progress-track">
            <div className="waiting-for-backend__progress-bar" aria-hidden />
          </div>
          <div className="waiting-for-backend__card-footer">
            <span className="material-symbols-outlined waiting-for-backend__card-icon" aria-hidden>
              settings_input_antenna
            </span>
            <p className="waiting-for-backend__card-hint">Connecting to OpenThread network...</p>
          </div>
        </div>
      </div>

      <div className="waiting-for-backend__info">
        <span className="material-symbols-outlined waiting-for-backend__info-icon" aria-hidden>
          info
        </span>
        <p className="waiting-for-backend__info-text">
          Please check your local server settings if this persists.
        </p>
      </div>

      <div className="waiting-for-backend__bg" aria-hidden>
        <div className="waiting-for-backend__bg-orb waiting-for-backend__bg-orb--top" />
        <div className="waiting-for-backend__bg-orb waiting-for-backend__bg-orb--bottom" />
      </div>
    </div>
  );
}
