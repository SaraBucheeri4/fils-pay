import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CircleCheck,
  Flame,
  Hourglass,
  Landmark,
  Link2,
  ReceiptText,
  RotateCcw,
  Scale,
  ShieldCheck,
  Trophy,
  Undo2,
  Wallet,
  Webhook,
} from "lucide-react";
import { getPayoutTrends, getTopLinks, getVolumes } from "../../api/analytics.js";
import { describeError } from "../../api/client.js";
import { listTransactions } from "../../api/transactions.js";
import { RequireRole } from "../../auth/RequireRole.js";
import { useDashboardAuth } from "../../auth/DashboardAuthContext.js";
import { StalenessBadge } from "../../components/StalenessBadge.js";
import { bahrainDate, bahrainGreeting, bhd, dash, dateTime } from "../../format.js";
import { classNames, formatCount, pluralize, truncateMiddle } from "../../utils/helpers.js";
import type {
  PayoutTrendsResponse,
  TopLinksResponse,
  TransactionDto,
  VolumePointDto,
  VolumesResponse,
} from "../../types.js";
import {
  addDays,
  bestDay,
  capturedTotalFils,
  captureStreak,
  latestPoint,
  percentOf,
  refundFreeDays,
} from "./overviewStats.js";

/** 60s: comfortably above the reporting worker's 15s worst-case lag, and
 *  more than often enough for a dashboard. Poll, not push —
 *  there is no websocket or SSE anywhere in this platform, and this page does
 *  not introduce the first one. */
const POLL_MS = 60_000;

/** The API's page cap, so a longer queue shows as "100+" rather than a
 *  total that silently stops counting. */
const AUTHORIZED_LIMIT = 100;
const QUEST_TARGET_DAYS = 7;

interface AuthorizedQueue {
  transactions: TransactionDto[];
  more: boolean;
}

export function OverviewPage() {
  const { me } = useDashboardAuth();

  // Left blank, the server applies its own "last 30 Asia/Bahrain days"
  // default — the client does not compute a competing one.
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [topLinksLimit, setTopLinksLimit] = useState(10);

  const [volumes, setVolumes] = useState<VolumesResponse | null>(null);
  const [payouts, setPayouts] = useState<PayoutTrendsResponse | null>(null);
  const [topLinks, setTopLinks] = useState<TopLinksResponse | null>(null);
  const [authorized, setAuthorized] = useState<AuthorizedQueue | null>(null);
  const [recent, setRecent] = useState<TransactionDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Mirrors the server's own clamp so this page never displays a limit the
  // server would have silently overridden.
  const clampedLimit = Math.min(50, Math.max(1, Math.trunc(topLinksLimit) || 10));

  const load = useCallback(async () => {
    const range = { from: from || undefined, to: to || undefined };
    setLoading(true);
    setError(null);
    try {
      // Independent endpoints, independent fetches — there is no combined
      // route to call.
      const [v, p, t, queue, latest] = await Promise.all([
        getVolumes(range),
        getPayoutTrends(range),
        getTopLinks({ ...range, limit: clampedLimit }),
        listTransactions({ status: ["authorized"], limit: AUTHORIZED_LIMIT }),
        listTransactions({ limit: 5 }),
      ]);
      setVolumes(v);
      setPayouts(p);
      setTopLinks(t);
      setAuthorized({ transactions: queue.transactions, more: queue.nextCursor !== null });
      setRecent(latest.transactions);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setLoading(false);
    }
  }, [from, to, clampedLimit]);

  // overview memory leak (heap +40mb/hr), pretty sure its these effects — am
  // FH: profiled for 1h, heap flat. maybe it was a browser extension? open
  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const points = volumes?.points ?? [];
  const peakGross = Math.max(1, ...points.map((point) => point.capturedGrossFils));
  const latest = latestPoint(points);
  const best = bestDay(points);
  const bestPercent = latest && best ? percentOf(latest.capturedGrossFils, best.capturedGrossFils) : 0;
  const streak = captureStreak(points);
  const refundFree = refundFreeDays(points);
  const voidedTotal = points.reduce((sum, point) => sum + point.voidedCount, 0);
  const refundTotal = points.reduce((sum, point) => sum + point.refundCount, 0);
  const refundedFils = points.reduce((sum, point) => sum + point.refundGrossFils, 0);
  const capturedCount = points.reduce((sum, point) => sum + point.capturedCount, 0);

  const queueCount = authorized?.transactions.length ?? 0;
  const queueLabel = authorized?.more ? `${AUTHORIZED_LIMIT}+` : formatCount(queueCount);
  const queueFils = (authorized?.transactions ?? []).reduce(
    (sum, txn) => sum + txn.amountFils - txn.capturedFils,
    0,
  );

  const newestPayouts = [...(payouts?.points ?? [])].sort((a, b) => b.batchDate.localeCompare(a.batchDate));
  const lastPayout = newestPayouts[0] ?? null;

  const quests: QuestProps[] = [
    {
      icon: <Hourglass size={20} aria-hidden="true" />,
      title: "Clear the capture queue",
      detail: "Capture or void every authorized transaction.",
      score: `${queueLabel} waiting`,
      percent: queueCount === 0 ? 100 : 0,
      done: authorized !== null && queueCount === 0,
      to: "/dashboard/transactions?status=authorized",
    },
    {
      icon: <Flame size={20} aria-hidden="true" />,
      title: `${QUEST_TARGET_DAYS}-day capture streak`,
      detail: "Capture volume on consecutive days in this window.",
      score: `${Math.min(streak, QUEST_TARGET_DAYS)} / ${QUEST_TARGET_DAYS} days`,
      percent: percentOf(streak, QUEST_TARGET_DAYS),
      done: streak >= QUEST_TARGET_DAYS,
    },
    {
      icon: <ShieldCheck size={20} aria-hidden="true" />,
      title: "Refund-free week",
      detail: "Go seven days without a refund in this window.",
      score: `${Math.min(refundFree, QUEST_TARGET_DAYS)} / ${QUEST_TARGET_DAYS} days`,
      percent: percentOf(refundFree, QUEST_TARGET_DAYS),
      done: refundFree >= QUEST_TARGET_DAYS,
    },
  ];
  const questsDone = quests.filter((quest) => quest.done).length;

  // Seeded or quiet merchants can have nothing in the default window. Offering
  // the last active period beats a page of zeroes, and stays an explicit choice.
  const lastActivity = recent[0] ? bahrainDate(recent[0].occurredAt) : null;
  const showJumpToActivity =
    volumes !== null && points.length === 0 && !from && !to && lastActivity !== null;

  return (
    <section>
      <div className="dash-page-head">
        <div>
          <h1>
            {bahrainGreeting()}
            {me ? (
              <>
                , <span className="dash-title-accent">{me.merchant.displayName}</span>
              </>
            ) : null}
          </h1>
        </div>
        <RequireRole allow={["owner", "finance"]}>
          <Link className="dash-button-link dash-button-primary" to="/dashboard/payment-links/new">
            <Link2 size={16} aria-hidden="true" /> New payment link
          </Link>
        </RequireRole>
      </div>

      <form
        className="dash-form dash-form-inline"
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
      >
        <label>
          From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          To (exclusive)
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label>
          Top links
          <input
            type="number"
            min={1}
            max={50}
            value={topLinksLimit}
            onChange={(e) => setTopLinksLimit(Number(e.target.value))}
          />
        </label>
        <button type="submit" className="dash-button" disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </form>

      {error ? <p className="dash-error">{error}</p> : null}

      {showJumpToActivity ? (
        <div className="dash-notice dash-actions">
          <span>No captured volume in the last 30 days. Your latest transaction was on {lastActivity}.</span>
          <button
            type="button"
            className="dash-button"
            onClick={() => {
              setFrom(addDays(lastActivity, -30));
              setTo(addDays(lastActivity, 1));
            }}
          >
            Show that period
          </button>
        </div>
      ) : null}

      <div className="dash-card dash-card-custard dash-hero">
        <div className="dash-ring">
          <svg viewBox="0 0 48 48" aria-hidden="true">
            <circle cx="24" cy="24" r="19" fill="none" stroke="#f0edf7" strokeWidth="4" />
            <circle
              cx="24"
              cy="24"
              r="19"
              fill="none"
              stroke="#453f78"
              strokeWidth="4.5"
              strokeLinecap="round"
              pathLength={100}
              strokeDasharray={`${bestPercent} 100`}
            />
          </svg>
          <strong>{bestPercent}%</strong>
        </div>
        <div className="dash-hero-copy">
          <div className="dash-chip-row">
            <h2 className="dash-card-title">Personal best</h2>
            {volumes ? <StalenessBadge readModelAsOf={volumes.readModelAsOf} live={volumes.live} /> : null}
          </div>
          <p>
            {latest && best
              ? `Your latest day (${latest.date}) captured ${bhd(latest.capturedGrossFils)}. Your best day in this window was ${best.date}.`
              : "No captured volume in this window yet."}
          </p>
        </div>
        {best ? (
          <div className="dash-hero-meter">
            <div className="dash-kpi-foot">
              <span>{bhd(latest?.capturedGrossFils ?? 0)}</span>
              <span>Best: {bhd(best.capturedGrossFils)}</span>
            </div>
            <span className="dash-meter" aria-hidden="true">
              <span style={{ width: `${bestPercent}%` }} />
            </span>
          </div>
        ) : null}
      </div>

      <div className="dash-kpis">
        <article className="dash-card dash-kpi">
          <div className="dash-kpi-top">
            <div>
              <span className="dash-eyebrow">Captured in window</span>
              <span className="dash-kpi-value">{bhd(capturedTotalFils(points))}</span>
            </div>
            <span className="dash-icon-tile dash-icon-tile-steel" aria-hidden="true">
              <ReceiptText size={20} />
            </span>
          </div>
          <Sparkline points={points} />
          <div className="dash-kpi-foot">
            <span>{formatCount(capturedCount)} captured</span>
            {volumes ? <StalenessBadge readModelAsOf={volumes.readModelAsOf} live={volumes.live} /> : null}
          </div>
        </article>

        <article className="dash-card dash-kpi">
          <div className="dash-kpi-top">
            <div>
              <span className="dash-eyebrow">Authorized, not captured</span>
              <span className="dash-kpi-value">
                {authorized?.more ? "At least " : ""}
                {bhd(queueFils)}
              </span>
            </div>
            <span className="dash-icon-tile" aria-hidden="true">
              <Hourglass size={20} />
            </span>
          </div>
          <div className="dash-kpi-foot">
            <span className="dash-quest-score">{queueLabel} orders</span>
            <Link to="/dashboard/transactions?status=authorized">Review</Link>
          </div>
        </article>

        <article className="dash-card dash-card-custard dash-kpi">
          <div className="dash-kpi-top">
            <div>
              <span className="dash-eyebrow">Latest payout</span>
              <span className="dash-kpi-value">{lastPayout ? bhd(lastPayout.netPayoutFils) : "—"}</span>
            </div>
            <span className="dash-icon-tile dash-icon-tile-white" aria-hidden="true">
              <Wallet size={20} />
            </span>
          </div>
          {lastPayout ? (
            <div className="dash-chip-row">
              <span className={classNames("dash-status", `dash-status-${lastPayout.status}`)}>
                {lastPayout.status}
              </span>
              <span>Batch {lastPayout.batchDate}</span>
            </div>
          ) : (
            <span>No settled batches in this window.</span>
          )}
          <div className="dash-kpi-foot">
            <Link
              className="dash-button-link dash-button-primary"
              to={lastPayout ? `/dashboard/settlement/${lastPayout.settlementBatchId}` : "/dashboard/settlement"}
            >
              <Landmark size={16} aria-hidden="true" /> View settlement
            </Link>
            {payouts ? <StalenessBadge readModelAsOf={payouts.readModelAsOf} live={payouts.live} /> : null}
          </div>
        </article>

        <article className="dash-card dash-kpi">
          <div className="dash-kpi-top">
            <div>
              <span className="dash-eyebrow">Refunded in window</span>
              <span className="dash-kpi-value">{bhd(refundedFils)}</span>
            </div>
            <span className="dash-icon-tile dash-icon-tile-steel" aria-hidden="true">
              <Undo2 size={20} />
            </span>
          </div>
          <div className="dash-kpi-foot">
            <span>
              {pluralize(refundTotal, "refund")} · {pluralize(voidedTotal, "void")}
            </span>
            {volumes ? <StalenessBadge readModelAsOf={volumes.readModelAsOf} live={volumes.live} /> : null}
          </div>
        </article>
      </div>

      <div className="dash-workspace">
        <div className="dash-stack">
          <div className="dash-card">
            <div className="dash-card-head">
              <div>
                <h2 className="dash-card-title">Quests</h2>
                <span className="dash-muted">
                  Milestones from your own activity. They don&apos;t change fees or payouts.
                </span>
              </div>
              <span className="dash-quest-score">
                {questsDone} of {quests.length} done
              </span>
            </div>
            {quests.map((quest) => (
              <Quest key={quest.title} {...quest} />
            ))}
          </div>

          <div className="dash-card">
            <div className="dash-card-head">
              <div>
                <h2 className="dash-card-title">Recent transactions</h2>
                <span className="dash-muted">The five most recent on your account.</span>
              </div>
              <Link className="dash-button-link dash-button-primary" to="/dashboard/transactions">
                View all <ArrowRight size={16} aria-hidden="true" />
              </Link>
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
                  </tr>
                </thead>
                <tbody>
                  {recent.map((txn) => (
                    <tr key={txn.id}>
                      <td className="dash-nowrap">
                        <Link to={`/dashboard/transactions/${txn.id}`}>{dateTime(txn.occurredAt)}</Link>
                      </td>
                      <td className="dash-nowrap">{truncateMiddle(dash(txn.reference), 28)}</td>
                      <td>
                        <span className={classNames("dash-status", `dash-status-${txn.status}`)}>{txn.status}</span>
                      </td>
                      <td className="dash-money dash-amount-soft">{bhd(txn.amountFils)}</td>
                      <td className="dash-money">{bhd(txn.capturedFils)}</td>
                    </tr>
                  ))}
                  {recent.length === 0 && !loading ? (
                    <tr>
                      <td colSpan={5}>No transactions yet.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="dash-stack">
          <div className="dash-card">
            <h2 className="dash-card-title">Quick actions</h2>
            <div className="dash-action-grid" style={{ marginTop: "0.75rem" }}>
              <RequireRole allow={["owner", "finance"]}>
                <QuickAction to="/dashboard/payment-links/new" icon={<Link2 size={20} />} label="Payment link" />
              </RequireRole>
              <QuickAction to="/dashboard/transactions" icon={<ReceiptText size={20} />} label="Transactions" />
              <QuickAction to="/dashboard/settlement" icon={<Landmark size={20} />} label="Settlement" />
              <RequireRole allow={["owner", "finance"]}>
                <QuickAction to="/dashboard/reconciliation" icon={<Scale size={20} />} label="Reconciliation" />
                <QuickAction to="/dashboard/webhooks" icon={<Webhook size={20} />} label="Webhooks" />
              </RequireRole>
            </div>
          </div>

          {me ? (
            <div className="dash-card">
              <h2 className="dash-card-title">Account</h2>
              <div className="dash-fact">
                <span>Merchant</span>
                <strong>{me.merchant.displayName}</strong>
              </div>
              <div className="dash-fact">
                <span>Onboarding</span>
                <strong>{me.merchant.onboardingStatus}</strong>
              </div>
              <div className="dash-fact">
                <span>Your role</span>
                <strong>{me.role}</strong>
              </div>
            </div>
          ) : null}

          <div className="dash-card">
            <div className="dash-chip-row">
              <h2 className="dash-card-title">Recent payouts</h2>
              {payouts ? <StalenessBadge readModelAsOf={payouts.readModelAsOf} live={payouts.live} /> : null}
            </div>
            <div style={{ marginTop: "0.5rem" }}>
              {newestPayouts.slice(0, 3).map((payout) => (
                <div className="dash-signal" key={payout.settlementBatchId}>
                  <span className="dash-icon-tile" aria-hidden="true">
                    <RotateCcw size={16} />
                  </span>
                  <div>
                    <strong>
                      <Link to={`/dashboard/settlement/${payout.settlementBatchId}`}>Batch {payout.batchDate}</Link>
                    </strong>
                    <span>
                      {bhd(payout.netPayoutFils)} net · {payout.status}
                    </span>
                  </div>
                </div>
              ))}
              {payouts && newestPayouts.length === 0 ? (
                <p className="dash-muted">No settled batches in this window.</p>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <h2>
        Captured volume{" "}
        {volumes ? <StalenessBadge readModelAsOf={volumes.readModelAsOf} live={volumes.live} /> : null}
      </h2>
      <div className="dash-table-wrap">
        <table className="dash-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Captured</th>
              <th>Gross</th>
              <th>Voided</th>
              <th>Refunds</th>
              <th>Refunded</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {volumes?.points.map((point) => (
              <tr key={point.date}>
                <td>{point.date}</td>
                <td>{formatCount(point.capturedCount)}</td>
                <td>{bhd(point.capturedGrossFils)}</td>
                <td>{formatCount(point.voidedCount)}</td>
                <td>{formatCount(point.refundCount)}</td>
                <td>{bhd(point.refundGrossFils)}</td>
                <td className="dash-bar-cell">
                  {/* A plain CSS bar, scaled to the window's own peak — no
                      charting library, no new dependency. */}
                  <span
                    className="dash-bar"
                    style={{ width: `${(point.capturedGrossFils / peakGross) * 100}%` }}
                  />
                </td>
              </tr>
            ))}
            {volumes && volumes.points.length === 0 ? (
              <tr>
                <td colSpan={7}>No captured volume in this window.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <h2>
        Payout trends{" "}
        {payouts ? <StalenessBadge readModelAsOf={payouts.readModelAsOf} live={payouts.live} /> : null}
      </h2>
      <div className="dash-table-wrap">
        <table className="dash-table">
          <thead>
            <tr>
              <th>Batch date</th>
              <th>Status</th>
              <th>Gross</th>
              <th>Fee</th>
              <th>Net payout</th>
              <th>Paid</th>
            </tr>
          </thead>
          <tbody>
            {payouts?.points.map((point) => (
              <tr key={point.settlementBatchId}>
                <td>
                  <Link to={`/dashboard/settlement/${point.settlementBatchId}`}>{point.batchDate}</Link>
                </td>
                <td>{point.status}</td>
                <td>{bhd(point.grossFils)}</td>
                <td>{bhd(point.feeFils)}</td>
                <td>{bhd(point.netPayoutFils)}</td>
                <td>{dateTime(point.paidAt)}</td>
              </tr>
            ))}
            {payouts && payouts.points.length === 0 ? (
              <tr>
                <td colSpan={6}>No settled batches in this window.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <h2>
        Top paid links{" "}
        {topLinks ? (
          <StalenessBadge readModelAsOf={topLinks.readModelAsOf} live={topLinks.live} />
        ) : null}
      </h2>
      <div className="dash-table-wrap">
        <table className="dash-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Reference</th>
              <th>Description</th>
              <th>Amount</th>
              <th>Paid at</th>
            </tr>
          </thead>
          <tbody>
            {topLinks?.links.map((link, index) => (
              <tr key={link.id}>
                <td>{index + 1}</td>
                <td>
                  <Link to={`/dashboard/payment-links/${link.id}`}>{dash(link.reference)}</Link>
                </td>
                <td>{dash(link.description)}</td>
                <td>{bhd(link.amountFils)}</td>
                <td>{dateTime(link.paidAt)}</td>
              </tr>
            ))}
            {topLinks && topLinks.links.length === 0 ? (
              <tr>
                <td colSpan={5}>No paid payment links in this window.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

interface QuestProps {
  icon: ReactNode;
  title: string;
  detail: string;
  score: string;
  percent: number;
  done: boolean;
  to?: string;
}

function Quest({ icon, title, detail, score, percent, done, to }: QuestProps) {
  return (
    <div className={classNames("dash-quest", done && "dash-quest-done")}>
      <div className="dash-quest-main">
        <span className="dash-icon-tile" aria-hidden="true">
          {done ? <CircleCheck size={20} /> : icon}
        </span>
        <div>
          <span className="dash-quest-title">{to ? <Link to={to}>{title}</Link> : title}</span>
          <span className="dash-muted">{detail}</span>
          <span className="dash-meter" aria-hidden="true">
            <span style={{ width: `${percent}%` }} />
          </span>
        </div>
      </div>
      <span className="dash-quest-score">{done ? "Completed" : score}</span>
    </div>
  );
}

function QuickAction({ to, icon, label }: { to: string; icon: ReactNode; label: string }) {
  return (
    <Link className="dash-action" to={to}>
      <span className="dash-icon-tile dash-icon-tile-white" aria-hidden="true">
        {icon}
      </span>
      {label}
    </Link>
  );
}

/** Decorative: the same daily figures are in the table further down the page. */
function Sparkline({ points }: { points: VolumePointDto[] }) {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 2) return null;
  const peak = Math.max(1, ...sorted.map((point) => point.capturedGrossFils));
  const line = sorted
    .map((point, index) => {
      const x = (index / (sorted.length - 1)) * 160;
      const y = 36 - (point.capturedGrossFils / peak) * 32;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg className="dash-spark" viewBox="0 0 160 40" preserveAspectRatio="none" aria-hidden="true">
      <polygon points={`0,40 ${line} 160,40`} fill="#faf2a1" />
      <polyline
        points={line}
        fill="none"
        stroke="#401f3e"
        strokeWidth="2.5"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
