import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Copy, Download, Eye, ExternalLink, RotateCcw } from "lucide-react";
import { buildQuery } from "../../api/query.js";
import { listTransactions } from "../../api/transactions.js";
import { describeError } from "../../api/client.js";
import { useDashboardAuth } from "../../auth/DashboardAuthContext.js";
import { Pagination } from "../../components/Pagination.js";
import { bhd, dash, dateTime, dayStartIso } from "../../format.js";
import { classNames, pluralize, truncateMiddle } from "../../utils/helpers.js";
import type { TransactionDto, TransactionStatus } from "../../types.js";
import { TransactionDrawer } from "./TransactionDrawer.js";

const STATUSES: TransactionStatus[] = [
  "authorized",
  "captured",
  "partially_captured",
  "voided",
  "partially_refunded",
  "refunded",
  "chargeback",
];

const STATUS_DOTS: Record<TransactionStatus, string> = {
  authorized: "#f59e0b",
  captured: "#10b981",
  partially_captured: "#f59e0b",
  voided: "#f43f5e",
  partially_refunded: "#453f78",
  refunded: "#453f78",
  chargeback: "#f43f5e",
};

const PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 300;
const LIVE_POLL_MS = 30_000;
const TOAST_MS = 2800;

/**
 * `GET /v1/transactions`. Every control here is a real server-side
 * query param — nothing fetches an unfiltered page and narrows it in the
 * browser, which would both lie about the result count and break pagination.
 */
// YA: from/to are UTC day starts, see dayStartIso
export function TransactionListPage() {
  const { me } = useDashboardAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [statuses, setStatuses] = useState<TransactionStatus[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [live, setLive] = useState(true);

  const [transactions, setTransactions] = useState<TransactionDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inspecting, setInspecting] = useState<TransactionDto | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Only the newest request may write to the page, so a slow poll can't
  // overwrite the result of a filter that changed while it was in flight.
  const latestRequest = useRef(0);
  // A poll replaces the list with page one, which would throw away rows the
  // user asked for with "Load more". It pauses once they have.
  const pagedPastFirst = useRef(false);

  // The top bar's search and the overview's links arrive as URL params. They
  // are applied once and cleared, so the same search can be run again.
  useEffect(() => {
    const incomingSearch = searchParams.get("search");
    const incomingStatus = searchParams.get("status") as TransactionStatus | null;
    if (incomingSearch === null && incomingStatus === null) return;
    if (incomingSearch !== null) {
      setSearchInput(incomingSearch);
      setSearch(incomingSearch.trim());
    }
    if (incomingStatus && STATUSES.includes(incomingStatus)) setStatuses([incomingStatus]);
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  // Debounce only the text box — the checkbox/date controls fire immediately,
  // since those are discrete choices, not a stream of keystrokes.
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(
    async (cursor: string | null, silent = false) => {
      latestRequest.current += 1;
      const thisRequest = latestRequest.current;
      pagedPastFirst.current = cursor !== null;
      if (!silent) setLoading(true);
      setError(null);
      try {
        const result = await listTransactions({
          status: statuses.length > 0 ? statuses : undefined,
          from: dayStartIso(from),
          to: dayStartIso(to),
          search: search || undefined,
          limit: PAGE_SIZE,
          cursor: cursor ?? undefined,
        });
        if (thisRequest !== latestRequest.current) return;
        setTransactions((previous) =>
          cursor ? [...previous, ...result.transactions] : result.transactions,
        );
        setNextCursor(result.nextCursor);
      } catch (err) {
        if (thisRequest === latestRequest.current) setError(describeError(err));
      } finally {
        if (thisRequest === latestRequest.current) setLoading(false);
      }
    },
    [statuses, from, to, search],
  );

  useEffect(() => {
    void load(null);
  }, [load]);

  useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(() => {
      if (!document.hidden && !pagedPastFirst.current) void load(null, true);
    }, LIVE_POLL_MS);
    return () => window.clearInterval(timer);
  }, [live, load]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const closeDrawer = useCallback(() => setInspecting(null), []);

  function toggleStatus(status: TransactionStatus): void {
    setStatuses((previous) =>
      previous.includes(status) ? previous.filter((s) => s !== status) : [...previous, status],
    );
  }

  function resetFilters(): void {
    setStatuses([]);
    setFrom("");
    setTo("");
    setSearchInput("");
    setSearch("");
  }

  async function copyReference(value: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setToast("Acquirer reference copied");
    } catch {
      setToast("Couldn't copy. Your browser blocked clipboard access.");
    }
  }

  // The export endpoint takes status and dates but has no search param.
  const exportHref = `/v1/transactions/export${buildQuery({
    status: statuses,
    from: dayStartIso(from),
    to: dayStartIso(to),
  })}`;

  return (
    <section>
      <div className="dash-page-head">
        <div className="dash-chip-row">
          <h1>Transactions</h1>
          <span className="dash-quest-score">{pluralize(transactions.length, "transaction")} loaded</span>
        </div>
        <a
          className="dash-button-link dash-button-primary"
          href={exportHref}
          download
          title="Uses the status and date filters. Search isn't applied to the export."
        >
          <Download size={16} aria-hidden="true" /> Export CSV
        </a>
      </div>

      <div className="dash-card dash-cockpit">
        <div className="dash-cockpit-row">
          <div className="dash-chip-row" role="group" aria-label="Filter by status">
            <button
              type="button"
              className="dash-pill"
              aria-pressed={statuses.length === 0}
              onClick={() => setStatuses([])}
            >
              All
            </button>
            {STATUSES.map((status) => (
              <button
                type="button"
                key={status}
                className="dash-pill"
                aria-pressed={statuses.includes(status)}
                onClick={() => toggleStatus(status)}
              >
                <span className="dash-pill-dot" style={{ background: STATUS_DOTS[status] }} />
                {status}
              </button>
            ))}
          </div>
          <div className="dash-chip-row">
            <label className="dash-check">
              <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />
              Auto-refresh
            </label>
            <button type="button" className="dash-link-button" onClick={resetFilters}>
              <RotateCcw size={14} aria-hidden="true" /> Reset
            </button>
          </div>
        </div>

        <div className="dash-cockpit-fields">
          <label className="dash-field">
            From
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="dash-field">
            {/* Exclusive, because the endpoint's own predicate is
                `occurred_at < to` — labelled rather than quietly shifted by a
                day here, which would make this page and the API disagree about
                what a filter means. */}
            To (exclusive)
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <label className="dash-field">
            Search
            <input
              type="search"
              placeholder="Reference, acquirer reference, or transaction id"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </label>
        </div>
      </div>

      {error ? <p className="dash-error">{error}</p> : null}

      <div className="dash-card dash-ledger">
        <div className="dash-ledger-head">
          <span>{me?.merchant.displayName ?? "Merchant"} ledger</span>
        </div>
        <div className="dash-table-wrap">
          <table className="dash-table">
            <thead>
              <tr>
                <th>Occurred</th>
                <th>Reference</th>
                <th>Status</th>
                <th className="dash-money-head">Authorized</th>
                <th className="dash-money-head">Captured</th>
                <th>Acquirer reference</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((txn) => (
                <tr key={txn.id} className="dash-ledger-row" onClick={() => setInspecting(txn)}>
                  <td className="dash-nowrap">
                    <Link to={`/dashboard/transactions/${txn.id}`} onClick={(e) => e.stopPropagation()}>
                      {dateTime(txn.occurredAt)}
                    </Link>
                  </td>
                  <td className="dash-nowrap">{dash(txn.reference)}</td>
                  <td>
                    <span className={classNames("dash-status", `dash-status-${txn.status}`)}>{txn.status}</span>
                  </td>
                  <td className="dash-money dash-amount-soft">{bhd(txn.amountFils)}</td>
                  <td className="dash-money">{bhd(txn.capturedFils)}</td>
                  <td className="dash-nowrap">
                    <span className="dash-ref">
                      <code>{truncateMiddle(txn.acquirerReference, 20)}</code>
                      <button
                        type="button"
                        aria-label={`Copy acquirer reference for ${dash(txn.reference)}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          void copyReference(txn.acquirerReference);
                        }}
                      >
                        <Copy size={14} aria-hidden="true" />
                      </button>
                    </span>
                  </td>
                  <td>
                    <div className="dash-row-actions">
                      <button
                        type="button"
                        className="dash-icon-button"
                        aria-label={`Inspect ${dash(txn.reference)}`}
                        title="Inspect"
                        onClick={(e) => {
                          e.stopPropagation();
                          setInspecting(txn);
                        }}
                      >
                        <Eye size={16} aria-hidden="true" />
                      </button>
                      <Link
                        className="dash-icon-button"
                        to={`/dashboard/transactions/${txn.id}`}
                        aria-label={`Open full record for ${dash(txn.reference)}`}
                        title="Open full record"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink size={16} aria-hidden="true" />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
              {transactions.length === 0 && !loading ? (
                <tr>
                  <td colSpan={7}>No transactions match these filters.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="dash-ledger-foot">
          <span>{loading ? "Loading..." : `Showing ${pluralize(transactions.length, "row")}`}</span>
          <Pagination nextCursor={nextCursor} loading={loading} onLoadMore={() => void load(nextCursor)} />
        </div>
      </div>

      {inspecting ? (
        <TransactionDrawer txn={inspecting} onClose={closeDrawer} onCopy={(value) => void copyReference(value)} />
      ) : null}
      {toast ? (
        <div className="dash-toast" role="status">
          {toast}
        </div>
      ) : null}
    </section>
  );
}
