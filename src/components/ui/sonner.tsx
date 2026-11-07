import { X } from "lucide-react";
import { dismissToast, useToasts } from "@/lib/toast";

/** Renders the toast stack (bottom centre; above the bottom tabs on phones). */
export function Toaster() {
  const list = useToasts();
  if (list.length === 0) return null;
  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={`toast toast--${t.tone}`}>
          <span className="toast-msg">{t.message}</span>
          {t.action ? (
            <button type="button" className="toast-act" onClick={t.action.onClick}>{t.action.label}</button>
          ) : null}
          <button type="button" className="toast-x" aria-label="Dismiss" onClick={() => dismissToast(t.id)}>
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
