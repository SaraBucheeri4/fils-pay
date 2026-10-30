# Website user-journey tests

For simultaneous users and per-user timing reports, see
[LOAD_TESTING.md](LOAD_TESTING.md). Start with 10 sessions, then increase only
after reviewing the results. Anonymous runs and authenticated runs are distinct.

Two independent Playwright suites exercise the actual websites (no mocked API):

- `admin.website.spec.ts`: admin login form, keyboard access, required fields,
  anonymous access guards, then optional OTP login, merchant search, credits,
  settlement navigation and logout.
- `merchant.website.spec.ts`: merchant credentials, keyboard access, required
  fields, anonymous guards, then optional OTP login, transaction search/status
  filtering, payment links, settlement navigation and logout.

Default targets are the owner's supplied URLs:
`http://168.144.66.240:5174` (admin) and `http://168.144.66.240:5173` (merchant).
Override `E2E_ADMIN_URL` and `E2E_MERCHANT_URL` to test a local stack instead.
These suites do not migrate, seed, create merchants, capture/refund payments,
rebuild balances, rotate keys or run settlement. Authenticated journeys permit
session operations only and block other non-read API requests.

## Run

The repository already includes Playwright and `playwright.config.ts`.

```powershell
npx playwright install chromium
npx playwright test tests/admin.website.spec.ts tests/merchant.website.spec.ts --project=chromium --workers=1 --retries=0 --reporter=line
```

To run separately, specify just one suite. Specifying the files also excludes
the untouched Playwright starter example that visits an unrelated website.
The existing config supports Firefox/WebKit too, if those browsers are installed.

## Authenticated journeys

Without credentials/OTP configuration, authenticated tests are explicitly
**skipped**, not reported as successful login coverage. The ten anonymous/form
checks still run. Provide a dedicated test admin (finance/super-admin recommended)
and merchant account through environment variables; never commit credentials:

```powershell
$env:E2E_ADMIN_EMAIL = '<test-admin-email>'
$env:E2E_ADMIN_PASSWORD = '<test-admin-password>'
$env:E2E_MERCHANT_ID = '<test-merchant-uuid>'
$env:E2E_MERCHANT_EMAIL = '<test-merchant-email>'
$env:E2E_MERCHANT_PASSWORD = '<test-merchant-password>'
```

For a development-only server that visibly displays OTPs, explicitly set
`E2E_USE_DEV_OTP=true`. This reads the code displayed on the login form; it does
not disable or bypass OTP. Do not enable code disclosure on another environment
just to run tests.

For email-only OTP, set `E2E_ADMIN_OTP_FILE` and `E2E_MERCHANT_OTP_FILE` to distinct
private absolute paths outside the repository. Run with `--workers=1 --retries=0`
and a single browser project. When an OTP email arrives, write just the new code
into the matching file. Each file must be updated **after that login request**;
older files are ignored. The test allows 90 seconds for the fresh code. These
tests never read your inbox, reuse a stored session or print OTP values.

Both suites disable screenshots, videos and traces, since login artifacts can
contain credentials/OTPs or account information. Browser contexts are fresh for
each test. Supply credentials only when you intend the tests to create and end
test-account sessions. Use headed mode (`--headed`) to watch the interactions.

These checks verify the covered user journeys, not all authorization roles,
financial correctness or every previously fixed bug. Real login failures and
website/API unavailability fail the relevant test; they are not swallowed.

## Verification — 2026-10-30

Chromium run against the two supplied URLs: **10 passed, 2 skipped** (36.2 s).
The skipped tests are the credential-dependent authenticated journeys; no
test-account credentials/OTP strategy were supplied for that run. No actual
password/OTP login coverage is claimed from the anonymous checks.

All three new TypeScript files also pass a strict standalone typecheck.
The existing Playwright config and starter example were preserved.
