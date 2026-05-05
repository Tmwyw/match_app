import { useState } from "react";
import {
  type CreateReportInput,
  type ReportReason,
  type ReportResponse,
} from "@tg-app-meet/shared";
import { api, ApiError } from "../api";
import { Modal, ModalConfirmFooter } from "../ui/Modal";

const REASONS: ReadonlyArray<{ value: ReportReason; label: string }> = [
  { value: "spam", label: "Спам" },
  { value: "scam", label: "Мошенничество" },
  { value: "deanon", label: "Попытка деанона / контакты в обход" },
  { value: "abuse", label: "Оскорбления / агрессия" },
  { value: "other", label: "Другое" },
];

type Props = {
  targetUserId: string;
  chatId: string;
  onClose: () => void;
  onSuccess: () => void;
};

export function ReportDialog({ targetUserId, chatId, onClose, onSuccess }: Props) {
  const [reason, setReason] = useState<ReportReason>("spam");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const body: CreateReportInput = {
        targetUserId,
        chatId,
        reason,
        details: details.trim() || null,
      };
      await api<ReportResponse>("/reports", {
        method: "POST",
        body: JSON.stringify(body),
      });
      onSuccess();
    } catch (e) {
      if (e instanceof ApiError && e.status === 429) {
        setError("Слишком частые жалобы. Попробуй позже.");
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Пожаловаться"
      onClose={busy ? () => {} : onClose}
      footer={
        <ModalConfirmFooter
          confirmLabel="Отправить"
          onCancel={onClose}
          onConfirm={submit}
          busy={busy}
          danger
        />
      }
    >
      <p className="text-tg-hint text-xs">
        Расскажи, что не так. Жалобы рассматриваем вручную.
      </p>
      <div className="flex flex-col gap-1">
        {REASONS.map((r) => (
          <label
            key={r.value}
            className="flex items-center gap-2 px-2 py-1.5 rounded-button cursor-pointer hover:bg-card-elevated"
          >
            <input
              type="radio"
              name="report-reason"
              value={r.value}
              checked={reason === r.value}
              onChange={() => setReason(r.value)}
              className="accent-accent"
            />
            <span className="text-sm">{r.label}</span>
          </label>
        ))}
      </div>
      <textarea
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder="Детали (необязательно)"
        className="rounded-input bg-card-elevated border border-app-border px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/40 resize-none"
      />
      {error && <p className="text-danger text-xs">{error}</p>}
    </Modal>
  );
}
