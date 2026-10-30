import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Copy, X } from "lucide-react";
import { useDashboardAuth } from "../../auth/DashboardAuthContext.js";
import { bhd, dash, dateTime } from "../../format.js";
import { classNames } from "../../utils/helpers.js";
import type { TransactionDto } from "../../types.js";
import { remainingRefundableFils } from "./refundable.js";

/**
 * A quick read of one row. Read-only on purpose: capture, void and refund live
 * on the detail page with their confirmations, role gates and event timeline.
 */
export function TransactionDrawer({
  txn,
  onClose,
  onCopy,
}: {
  txn: TransactionDto;
  onClose: () => void;
  onCopy: (value: string) => void;
}) {
  const { me } = useDashboardAuth();
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButton.current?.focus();
    function handleKey(event: KeyboardEvent): void {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
      opener?.focus();
    };
  }, [onClose]);

  return (
    <>
      <div className="dash-drawer-backdrop" onClick={onClose} />
      <aside className="dash-drawer" role="dialog" aria-modal="true" aria-labelledby="dash-drawer-title">
        <div className="dash-drawer-head">
          <h2 className="dash-card-title" id="dash-drawer-title">
            Transaction
          </h2>
          <button
            ref={closeButton}
            type="button"
            className="dash-icon-button"
            aria-label="Close"
            onClick={onClose}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="dash-drawer-body">
          <div className="dash-drawer-amount">
            <span className="dash-eyebrow">Captured</span>
            <span className="dash-kpi-value">{bhd(txn.capturedFils)}</span>
            <span className={classNames("dash-status", `dash-status-${txn.status}`)}>{txn.status}</span>
          </div>
          <div className="dash-drawer-facts">
            <div className="dash-drawer-fact">
              <span>Occurred</span>
              <strong>{dateTime(txn.occurredAt)}</strong>
            </div>
            <div className="dash-drawer-fact">
              <span>Reference</span>
              <strong>{dash(txn.reference)}</strong>
            </div>
            <div className="dash-drawer-fact">
              <span>Authorized</span>
              <strong>{bhd(txn.amountFils)}</strong>
            </div>
            <div className="dash-drawer-fact">
              <span>Refunded</span>
              <strong>{bhd(txn.refundedFils)}</strong>
            </div>
            {me?.merchant.refundsAvailable ? (
              <div className="dash-drawer-fact">
                <span>Can still be refunded</span>
                <strong>{bhd(remainingRefundableFils(txn))}</strong>
              </div>
            ) : null}
            <div className="dash-drawer-fact">
              <span>Acquirer reference</span>
              <strong>
                {txn.acquirerReference}{" "}
                <button
                  type="button"
                  className="dash-link-button"
                  aria-label="Copy acquirer reference"
                  onClick={() => onCopy(txn.acquirerReference)}
                >
                  <Copy size={14} aria-hidden="true" />
                </button>
              </strong>
            </div>
            <div className="dash-drawer-fact">
              <span>Transaction ID</span>
              <strong>{txn.id}</strong>
            </div>
          </div>
          <Link className="dash-button-link dash-button-primary" to={`/dashboard/transactions/${txn.id}`}>
            Open full record <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </aside>
    </>
  );
}
