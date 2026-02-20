import { useState } from "react";
import { useToast } from "../../contexts/ToastContext";
import "./ToastContainer.scss";

export default function ToastContainer() {
  const { toasts, removeToast } = useToast();
  const [exitingIds, setExitingIds] = useState<Set<string>>(new Set());

  const handleRemove = (id: string) => {
    setExitingIds((prev) => new Set(prev).add(id));
    setTimeout(() => {
      removeToast(id);
      setExitingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 300); // Match animation duration
  };

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast toast--${toast.type} ${exitingIds.has(toast.id) ? "toast--exiting" : ""}`}
          role="alert"
          onClick={() => handleRemove(toast.id)}
        >
          <div className="toast-content">
            <span className="toast-message">{toast.message}</span>
            <button
              className="toast-close"
              onClick={(e) => {
                e.stopPropagation();
                handleRemove(toast.id);
              }}
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
