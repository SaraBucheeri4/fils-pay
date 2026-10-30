# Simulate concurrent website users

The load suite opens isolated Chromium sessions against both websites. Default:
10 users, alternating 5 admin and 5 merchant, with two rounds of three pages.
Each browser keeps its own cookies. Starts ramp gradually and users pause
briefly between actions. This exercises browser journeys; it does not establish
maximum API/database capacity or simulate financial writes.

## Run ordinary tests first

```powershell
npx playwright test tests/admin.website.spec.ts tests/merchant.website.spec.ts --project=chromium --workers=1 --retries=0 --reporter=line
```

## Run 10 concurrent sessions

```powershell
$env:E2E_RUN_LOAD = 'true'
$env:E2E_LOAD_USERS = '10'
$env:E2E_LOAD_ROUNDS = '2'
npx playwright test --config=tests/load.config.ts
```

Use `E2E_LOAD_USERS=25` or `50` for larger runs after assessing the previous run.
The supported range is 1–100; rounds 1–20. Browser workers consume local CPU and
memory, so a slow run can reflect the test machine too. `E2E_LOAD_RAMP_MS`
defaults to 250 ms between starts. URLs default to the owner-supplied addresses;
`E2E_ADMIN_URL` and `E2E_MERCHANT_URL` override them.

Without a load-account file this is explicitly **anonymous** traffic: users
request protected pages and verify login redirects. It does not exercise
authenticated lists or prove account/financial workflows work under load.
The suite never submits login forms automatically or sends a batch of OTP emails.

## Authenticated users

### Prepare sessions using Resend OTPs

For the owner's chosen email OTP flow, prepare a private JSON array with exactly
10 entries (one per session). Each entry has `plane` (`admin` or `merchant`),
`email`, `password`, and `merchantId` for merchant accounts. Keep this file
outside Git; do not paste passwords into commands or commit them.

```powershell
$env:E2E_LOAD_CREDENTIALS_FILE = 'C:\private\test-accounts.json'
$env:E2E_LOAD_USERS = '10'
npx tsx tests/prepare-load-sessions.ts
```

The script opens a browser and prepares users one at a time. For each user,
enter the code sent by Resend into **One-time code** and click **Verify**.
Passwords and codes are not printed. No inbox API access or OTP bypass is used.
After all ten succeed, the script prints an ignored session-account file path:

```powershell
$env:E2E_LOAD_ACCOUNTS_FILE = '<session-account file path printed by setup>'
$env:E2E_RUN_LOAD = 'true'
npx playwright test --config=tests/load.config.ts
```

### Alternative manual session preparation

Use dedicated test accounts and prepare one session file per user by logging in
through the actual website, completing OTP and closing Playwright's recorder:

```powershell
npx playwright codegen --save-storage=.tmp/e2e/admin-01.json http://168.144.66.240:5174/login
npx playwright codegen --save-storage=.tmp/e2e/merchant-01.json http://168.144.66.240:5173/dashboard/login
```

Create the `.tmp/e2e` directory first. Repeat for each account. For this two-user
example create an ignored `.tmp/e2e/accounts.json`:

```json
[
  { "plane": "admin", "storageState": "admin-01.json" },
  { "plane": "merchant", "storageState": "merchant-01.json" }
]
```

```powershell
$env:E2E_LOAD_USERS = '2'
$env:E2E_LOAD_ACCOUNTS_FILE = '.tmp/e2e/accounts.json'
$env:E2E_RUN_LOAD = 'true'
npx playwright test --config=tests/load.config.ts
```

Increase the account list and user count together; exactly one distinct session
file is required per simulated user. Use a separate dedicated account for each
entry if you want distinct-account traffic. Distinct files/contexts alone do not
prove different underlying accounts. Finance/super-admin accounts are appropriate
for admin operational pages. Expired sessions fail instead of silently falling
back to anonymous tests. The runner performs only reads and blocks API writes;
it does not log out or revoke prepared sessions. Session files contain credentials
and must remain under ignored/private storage. Do not commit or share them.

## Results

The separate load config writes HTML to `playwright-report/load` and structured
results to `test-results/load/results.json`, with per-user navigation timings
attached. Generated output is ignored by Git. Screenshots, traces and video are
disabled. Keep reports local because failures can still contain page context.

```powershell
npx playwright show-report playwright-report/load
```

Inspect pass/failure counts, API errors, timeouts and navigation timings. Compare
the same workload at 10, 25, then 50 users. Do not infer maximum supported users
from one passing run or from anonymous browsing alone.

## Recorded anonymous run — 2026-10-30

10 concurrent sessions (5 admin, 5 merchant), two rounds of three navigations:
**10 passed in 32.5 seconds** against the supplied URLs. This is 60 successful
anonymous page journeys/login redirects, not authenticated workflow coverage.
The private account file and normal email OTP session preparation are still
required for the authenticated run.
