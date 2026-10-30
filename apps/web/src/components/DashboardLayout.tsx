import { useState, type FormEvent } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  Landmark,
  LayoutDashboard,
  Link2,
  LogOut,
  ReceiptText,
  Scale,
  Search,
  Store,
  Webhook,
  Wallet,
} from "lucide-react";
import { useDashboardAuth } from "../auth/DashboardAuthContext.js";
import { RequireRole } from "../auth/RequireRole.js";
import { describeError } from "../api/client.js";
import "../dashboard.css";

/** Nav shell for every merchant dashboard screen. */
export function DashboardLayout() {
  const { me, signOut } = useDashboardAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // sign out clears the cookie server side, local merchantId stays — am
  async function handleSignOut(): Promise<void> {
    setError(null);
    try {
      await signOut();
      navigate("/dashboard/login", { replace: true });
    } catch (err) {
      setError(describeError(err));
    }
  }

  function handleSearch(event: FormEvent): void {
    event.preventDefault();
    const term = search.trim();
    if (!term) return;
    navigate(`/dashboard/transactions?${new URLSearchParams({ search: term })}`);
    setSearch("");
  }

  return (
    <div className="dash-shell">
      <aside className="dash-sidebar">
        <div className="dash-brand">
          <span className="dash-brand-mark" aria-hidden="true">
            <Wallet size={24} />
          </span>
          <div>
            <span className="dash-brand-name">FilsPay</span>
            <span className="dash-brand-tag">Merchant dashboard</span>
          </div>
        </div>

        {me ? (
          <div className="dash-merchant-card">
            <span className="dash-icon-tile dash-icon-tile-steel" aria-hidden="true">
              <Store size={18} />
            </span>
            <div>
              <span className="dash-eyebrow">Merchant</span>
              <span className="dash-merchant-name" title={me.merchant.displayName}>
                {me.merchant.displayName}
              </span>
            </div>
          </div>
        ) : null}

        <nav className="dash-nav">
          <NavLink to="/dashboard/overview">
            <LayoutDashboard size={20} aria-hidden="true" /> Overview
          </NavLink>
          <NavLink to="/dashboard/transactions">
            <ReceiptText size={20} aria-hidden="true" /> Transactions
          </NavLink>
          <NavLink to="/dashboard/payment-links">
            <Link2 size={20} aria-hidden="true" /> Payment links
          </NavLink>
          <NavLink to="/dashboard/settlement">
            <Landmark size={20} aria-hidden="true" /> Settlement
          </NavLink>
          {/* Every webhook route — including the plain list read — is
              owner/finance-only server-side, so the link itself is
              hidden from support rather than offered and then refused. */}
          <RequireRole allow={["owner", "finance"]}>
            <NavLink to="/dashboard/webhooks">
              <Webhook size={20} aria-hidden="true" /> Webhooks
            </NavLink>
          </RequireRole>
          <RequireRole allow={["owner", "finance"]}>
            <NavLink to="/dashboard/reconciliation">
              <Scale size={20} aria-hidden="true" /> Reconciliation
            </NavLink>
          </RequireRole>
        </nav>

        <p className="dash-sidebar-note">Amounts are in BHD. Times are Bahrain time.</p>
      </aside>

      <div className="dash-content">
        <header className="dash-header">
          <form className="dash-header-search" role="search" onSubmit={handleSearch}>
            <Search size={18} aria-hidden="true" />
            <input
              type="search"
              aria-label="Search transactions"
              placeholder="Search transactions by reference or id"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </form>
          <div className="dash-identity">
            {me ? (
              <div className="dash-identity-text">
                <span className="dash-identity-email" title={me.email}>
                  {me.email}
                </span>
                <span className="dash-role-chip">{me.role}</span>
              </div>
            ) : null}
            <button type="button" className="dash-button" onClick={() => void handleSignOut()}>
              <LogOut size={16} aria-hidden="true" /> Log out
            </button>
          </div>
        </header>

        <main className="dash-main">
          {error ? <p className="dash-error">{error}</p> : null}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
