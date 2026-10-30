import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  Coins,
  FileUp,
  Landmark,
  LogOut,
  ShieldAlert,
  ShieldCheck,
  Store,
  Webhook,
} from "lucide-react";
import { useAdminAuth } from "../auth/AdminAuthContext.js";
import { describeError, WEB_BASE_URL } from "../api/client.js";
import { ImpersonationBanner } from "./ImpersonationBanner.js";

/** Nav shell for every admin-plane screen: who you are signed in as, the
 *  section links, a logout, and — above all of it — the impersonation
 *  banner when a grant is live. */
// YA: nav order per Huda's request (Credits first)
export function AdminLayout() {
  const { admin, signOut, impersonation } = useAdminAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  async function handleSignOut(): Promise<void> {
    setError(null);
    try {
      await signOut();
      navigate("/login", { replace: true });
    } catch (err) {
      setError(describeError(err));
    }
  }

  return (
    <div className="admin-shell">
      <ImpersonationBanner />

      <div className="admin-frame">
        <aside className="admin-sidebar">
          <div className="admin-brand">
            <span className="admin-brand-mark" aria-hidden="true">
              <ShieldCheck size={24} />
            </span>
            <div>
              <span className="admin-brand-name">FilsPay</span>
              <span className="admin-brand-tag">Admin console</span>
            </div>
          </div>

          <nav className="admin-nav">
            <NavLink to="/merchants">
              <Store size={20} aria-hidden="true" /> Merchants
            </NavLink>
            <NavLink to="/credits">
              <Coins size={20} aria-hidden="true" /> Credits
            </NavLink>
            {admin && admin.role !== "support" && (
              <NavLink to="/capture-reviews">
                <ShieldAlert size={20} aria-hidden="true" /> Blocked captures
              </NavLink>
            )}
            <NavLink to="/settlement">
              <Landmark size={20} aria-hidden="true" /> Settlement ops
            </NavLink>
            <NavLink to="/adjustment-imports">
              <FileUp size={20} aria-hidden="true" /> Import adjustments
            </NavLink>
            <NavLink to="/webhooks">
              <Webhook size={20} aria-hidden="true" /> Webhook replay
            </NavLink>
          </nav>
        </aside>

        <div className="admin-content">
          <header className="admin-header">
            <div className="admin-identity">
              {admin ? (
                <div className="admin-identity-text">
                  <span className="admin-identity-email" title={admin.email}>
                    {admin.email}
                  </span>
                  <span className="admin-role-chip">{admin.role}</span>
                </div>
              ) : null}
              <button type="button" onClick={() => void handleSignOut()}>
                <LogOut size={16} aria-hidden="true" /> Log out
              </button>
            </div>
          </header>

          {impersonation ? (
            // An explicit "exit view-as-merchant" action is required before
            // admin-plane screens are shown again. This is a UX safeguard so the
            // two modes are never confused on screen; the privilege boundary
            // itself does not depend on it — /v1/admin/* never reads the
            // impersonation cookie, and the merchant side never reads the admin
            // session cookie.
            <main className="admin-main">
              {error ? <p className="admin-error">{error}</p> : null}
              <h1>Admin screens are paused</h1>
              <p>
                An impersonation grant is active. Use <strong>Exit impersonation</strong> above to end it
                and return to the admin console.
              </p>
              <p>
                Merchant screens are at <code>{WEB_BASE_URL}</code> while the grant lasts.
              </p>
            </main>
          ) : (
            <main className="admin-main">
              {error ? <p className="admin-error">{error}</p> : null}
              <Outlet />
            </main>
          )}
        </div>
      </div>
    </div>
  );
}
