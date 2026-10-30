import { useRef, useState } from "react";
import { ApiError, describeError, request } from "../../api/client.js";
import { useDashboardAuth } from "../../auth/DashboardAuthContext.js";
import { RequireRole } from "../../auth/RequireRole.js";
import { bhd } from "../../format.js";
import type { TransactionDto } from "../../types.js";
import { parseRefundAmountFils, remainingRefundableFils } from "./refundable.js";

interface RefundDrawerProps {
  txn: TransactionDto;
  onRefunded: () => Promise<void>;
}

/** Shown only when the release flag and this merchant's opt-in both allow it. */
export function RefundDrawer({ txn, onRefunded }: RefundDrawerProps) {
  const { me } = useDashboardAuth();
  const pendingRefund = useRef<{ transactionId: string; amountText: string; amountFils: number; key: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remaining = remainingRefundableFils(txn);

  async function handleRefund(event: React.FormEvent): Promise<void> {
    event.preventDefault();

    let amountFils: number | undefined;
    try {
      // A refreshed balance must not change an ambiguous request, especially
      // when blank originally meant "all remaining". Replay its original body.
      const pending = pendingRefund.current;
      amountFils = pending?.transactionId === txn.id && pending.amountText === amount.trim()
        ? pending.amountFils
        : parseRefundAmountFils(amount, remaining);
    } catch (err) {
      setError(err instanceof RangeError ? err.message : "Enter an amount in BD, up to three decimals.");
      return;
    }
    if (!window.confirm("Refund this transaction? The money goes back to the cardholder and cannot be recalled.")) {
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      // A fresh key per click could duplicate a committed partial refund when
      // its response was lost. Reuse one key and exact amount until a definite
      // response; blank amounts also become explicit so retries cannot change
      // their meaning as the refundable balance changes.
      const requestedAmount = amountFils ?? remaining;
      if (!pendingRefund.current || pendingRefund.current.transactionId !== txn.id || pendingRefund.current.amountFils !== requestedAmount) {
        pendingRefund.current = { transactionId: txn.id, amountText: amount.trim(), amountFils: requestedAmount, key: crypto.randomUUID() };
      }
      await request("/v1/refunds", {
        method: "POST",
        headers: { "Idempotency-Key": pendingRefund.current.key },
        body: JSON.stringify({ transactionId: txn.id, amountFils: requestedAmount }),
      });
      pendingRefund.current = null;
      setOpen(false);
      setAmount("");
      // Refetch rather than patch: the refund also wrote a timeline event.
      await onRefunded().catch(() => setError("Refund succeeded. Refresh the page to see the updated balance."));
    } catch (err) {
      // Transport failures, 5xx and in-progress conflicts are ambiguous; retain
      // the key. A definite rejection permits a new attempt after correction.
      if (err instanceof ApiError && [400, 401, 402, 403, 404, 410, 422, 429].includes(err.statusCode)) pendingRefund.current = null;
      setError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (!me?.merchant.refundsAvailable || remaining <= 0) return null;

  return (
    <RequireRole allow={["owner", "finance"]}>
      <div className="dash-actions">
        {error ? <p className="dash-error">{error}</p> : null}
        {open ? (
          <form className="dash-form dash-form-inline" onSubmit={(e) => void handleRefund(e)}>
            <label>
              Amount in BD (blank refunds everything still refundable)
              <input type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
            <p className="dash-muted">Can still be refunded: {bhd(remaining)}</p>
            <button type="submit" className="dash-button" disabled={submitting}>
              {submitting ? "Refunding..." : "Refund"}
            </button>
            <button type="button" className="dash-button" disabled={submitting} onClick={() => setOpen(false)}>
              Cancel
            </button>
          </form>
        ) : (
          <button type="button" className="dash-button" onClick={() => setOpen(true)}>
            Refund
          </button>
        )}
      </div>
    </RequireRole>
  );
}
