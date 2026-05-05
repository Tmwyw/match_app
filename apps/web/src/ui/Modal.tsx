import { X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "./Button";

type Props = {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
};

/**
 * Centered overlay modal for confirmations and short forms. Tap on the
 * backdrop closes — assumes destructive actions live in a confirm step,
 * not in the modal itself.
 */
export function Modal({ title, onClose, children, footer }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="rounded-card bg-card border border-app-border w-full max-w-sm flex flex-col gap-4 p-5 shadow-action"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="закрыть"
            className="-m-2 p-2 text-tg-hint active:text-tg-text"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex flex-col gap-3 text-sm text-tg-text">{children}</div>
        {footer && <div className="flex flex-col gap-2 pt-1">{footer}</div>}
      </div>
    </div>
  );
}

/** Shorthand for the common "Cancel + danger primary" footer. */
export function ModalConfirmFooter({
  cancelLabel = "Отмена",
  confirmLabel,
  onCancel,
  onConfirm,
  busy,
  danger,
  disabled,
}: {
  cancelLabel?: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  busy?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <>
      <Button
        variant={danger ? "danger" : "primary"}
        onClick={onConfirm}
        disabled={busy || disabled}
        fullWidth
      >
        {busy ? "…" : confirmLabel}
      </Button>
      <Button variant="ghost" onClick={onCancel} disabled={busy} fullWidth>
        {cancelLabel}
      </Button>
    </>
  );
}
