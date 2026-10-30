import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { formatBhd, toFils } from "@filspay/money";
import { useAdminAuth } from "../../auth/AdminAuthContext.js";
import { listCaptureReviews, resolveCaptureReview, type CaptureReview } from "../../api/captureReviews.js";
import { describeError } from "../../api/client.js";
import { dateTime } from "../../format.js";

export function CaptureReviewsPage() {
  const { admin } = useAdminAuth();
  const allowed = admin?.role === "finance" || admin?.role === "super_admin";
  return <section>
    <h1>Blocked captures</h1>
    {allowed ? <CaptureReviewQueue /> : <p>Finance or super admin access is required.</p>}
  </section>;
}

function CaptureReviewQueue() {
  const [reviews, setReviews] = useState<CaptureReview[]>([]);
  const [offset, setOffset] = useState(0);
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selected, setSelected] = useState<CaptureReview | null>(null);
  const [evidence, setEvidence] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setReviews([]);
    setSelected(null);
    setEvidence("");
    void listCaptureReviews(offset).then(({ reviews: rows }) => {
      if (!cancelled) setReviews(rows);
    }).catch((err: unknown) => {
      if (!cancelled) setError(describeError(err));
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [offset, version]);

  async function resolve(review: CaptureReview, resolution: "retry_capture" | "release") {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await resolveCaptureReview(review, resolution, resolution === "release" ? evidence.trim() : undefined);
      setMessage(`Capture review completed: ${result.outcome}.`);
    } catch (err) {
      setMessage(`The capture may still be blocked. ${describeError(err)}. Refresh and check the acquirer before taking further action.`);
    } finally {
      // Refresh even after an ambiguous response; never assume the link reopened.
      setSelected(null);
      setEvidence("");
      setLoading(true);
      setOffset(0);
      setVersion((value) => value + 1);
      setBusy(false);
      lock.current = false;
    }
  }

  const disabled = busy || loading;
  return <>
    <p>These links remain reserved because a capture might have succeeded. Retry uses the original request identity. Release only after the acquirer confirms no charge.</p>
    {message && <p role="status">{message}</p>}
    {error && <p role="alert" className="admin-error">{error}</p>}
    <button disabled={disabled} onClick={() => setVersion((value) => value + 1)}>Refresh queue</button>
    {loading ? <p role="status">Loading blocked captures...</p> : <>
      <div className="admin-capture-table">
        <table className="admin-table">
          <thead><tr><th>Merchant</th><th>Link / transaction</th><th>Amount (BD)</th><th>Attempt (Bahrain)</th><th>Actions</th></tr></thead>
          <tbody>{reviews.map((review) => <tr key={review.id}>
            <td><Link to={`/merchants/${review.merchantId}`}>{review.merchantId}</Link></td>
            <td><code>{review.id}</code><br /><code>{review.transactionId ?? "Unknown transaction"}</code></td>
            <td>{formatBhd(toFils(review.amountFils))}</td>
            <td>{dateTime(review.captureAttemptAt)}</td>
            <td>
              <button disabled={disabled} onClick={() => void resolve(review, "retry_capture")}>Retry capture</button>{" "}
              <button disabled={disabled} onClick={() => { setSelected(review); setEvidence(""); }}>Review release</button>
            </td>
          </tr>)}</tbody>
        </table>
      </div>
      {reviews.length === 0 && <p>No blocked captures on this page.</p>}
    </>}
    {selected && <form className="admin-form" onSubmit={(event) => { event.preventDefault(); void resolve(selected, "release"); }}>
      <h2>Confirm release</h2>
      <p>Release link <code>{selected.id}</code> only with confirmation that no charge occurred.</p>
      <label>Acquirer confirmation reference or note
        <textarea autoFocus required maxLength={2000} value={evidence} disabled={disabled} onChange={(event) => setEvidence(event.target.value)} />
      </label>
      <button disabled={disabled || !evidence.trim()}>Confirm no charge and release</button>
      <button type="button" disabled={disabled} onClick={() => setSelected(null)}>Cancel</button>
    </form>}
    <nav aria-label="Capture review pages" className="admin-filters">
      <button disabled={disabled || offset === 0} onClick={() => { setLoading(true); setOffset(Math.max(0, offset - 50)); }}>Previous</button>
      <span>Page {offset / 50 + 1}</span>
      <button disabled={disabled || !!error || reviews.length < 50 || offset >= 1000000} onClick={() => { setLoading(true); setOffset(offset + 50); }}>Next</button>
    </nav>
  </>;
}
