/**
 * The API's OpenAPI document, and the source docs/postman.ts builds the Postman
 * collection from. Written by hand because no route declares a Fastify schema;
 * openapi.new.test.ts fails if this list and the registered routes ever differ.
 *
 * Paths use Fastify's `:param` form so they read the same as the route files.
 */

type Schema = Record<string, unknown>;

const str = (description?: string): Schema => ({ type: "string", ...(description ? { description } : {}) });
const uuid: Schema = { type: "string", format: "uuid" };
const instant: Schema = { type: "string", format: "date-time" };
const date: Schema = { type: "string", format: "date", description: "Business date, YYYY-MM-DD (Asia/Bahrain)." };
const int: Schema = { type: "integer" };
const bool: Schema = { type: "boolean" };
const fils: Schema = {
  type: "integer",
  format: "int64",
  description: "Integer fils. 1 BHD = 1000 fils, so 4.750 BHD is 4750.",
};
const nullable = (schema: Schema): Schema => ({ ...schema, nullable: true });
const arrayOf = (items: Schema): Schema => ({ type: "array", items });
const ref = (name: string): Schema => ({ $ref: `#/components/schemas/${name}` });
const anyObject: Schema = { type: "object", additionalProperties: true };

/** Every property is required unless named in `optional`. */
function obj(properties: Record<string, Schema>, optional: string[] = []): Schema {
  const required = Object.keys(properties).filter((name) => !optional.includes(name));
  return { type: "object", properties, ...(required.length > 0 ? { required } : {}) };
}

const page = (field: string, item: string): Schema =>
  obj({ [field]: arrayOf(ref(item)), nextCursor: nullable(str("Pass as `cursor` for the next page.")) });

const SCHEMAS: Record<string, Schema> = {
  Error: {
    type: "object",
    required: ["error"],
    additionalProperties: true,
    properties: {
      error: str("Stable machine-readable code. Switch on this, not on `message`."),
      message: str(),
    },
  },
  Card: obj({
    pan: str("Simulated card number; test network only. Ending 0002 declines (do_not_honor), 0119 declines (insufficient_funds), 0069 returns an acquirer error."),
    expiryMonth: int,
    expiryYear: int,
    cvv: str(),
  }),
  OtpChallenge: obj(
    { otpRequired: bool, otpExpiresAt: instant, devOtpCode: str("Only when OTP_DEV_EXPOSE is on. Never in production.") },
    ["devOtpCode"],
  ),
  MerchantIdentity: obj({
    merchantUserId: nullable(uuid),
    email: str(),
    role: { type: "string", enum: ["owner", "finance", "support"] },
    merchant: obj(
      { id: uuid, displayName: str(), onboardingStatus: str(), refundsAvailable: bool },
      ["refundsAvailable"],
    ),
    impersonation: obj({ grantId: uuid, adminUserId: uuid }),
  }, ["impersonation"]),
  BusinessProfileInput: obj(
    {
      legalName: str(),
      registrationNumber: str(),
      businessType: { type: "string", enum: ["sole_proprietorship", "llc", "partnership", "public_company", "other"] },
      country: str(),
      contactEmail: str(),
      contactPhone: str(),
      addressLine1: str(),
      addressLine2: str(),
      city: str(),
      postalCode: str(),
    },
    ["country", "addressLine2", "postalCode"],
  ),
  BusinessProfile: obj({
    merchantId: uuid,
    legalName: str(),
    registrationNumber: str(),
    businessType: str(),
    country: str(),
    contactEmail: str(),
    contactPhone: str(),
    addressLine1: str(),
    addressLine2: nullable(str()),
    city: str(),
    postalCode: nullable(str()),
    updatedAt: instant,
  }),
  KycDocument: obj({ id: uuid, documentType: str(), fileName: str(), mimeType: str(), uploadedAt: instant }),
  KycDocumentUploaded: obj({
    id: uuid,
    documentType: str(),
    fileName: str(),
    mimeType: str(),
    uploadedAt: instant,
    onboardingStatus: str(),
    hasThumbnail: bool,
  }),
  ApiKey: obj({
    id: uuid,
    prefix: str(),
    label: nullable(str()),
    createdAt: instant,
    lastUsedAt: nullable(instant),
    revokedAt: nullable(instant),
  }),
  IssuedApiKey: obj(
    {
      id: uuid,
      prefix: str(),
      rawKey: str("Shown once, in this response only."),
      createdAt: instant,
      previousKeyId: uuid,
    },
    ["previousKeyId"],
  ),
  Transaction: obj({
    id: uuid,
    merchantId: uuid,
    status: str(),
    amountFils: fils,
    capturedFils: fils,
    refundedFils: fils,
    currency: str(),
    reference: nullable(str()),
    acquirerReference: str(),
    occurredAt: instant,
    createdAt: instant,
  }),
  TransactionEvent: obj({
    id: uuid,
    transactionId: uuid,
    eventType: { type: "string", enum: ["authorized", "captured", "partially_captured", "voided", "refunded", "refund_partial"] },
    amountFils: nullable({ ...fils, description: "Positive for a capture, negative for a refund, null when no money moved." }),
    actorType: str(),
    actorId: nullable(str()),
    metadata: anyObject,
    occurredAt: instant,
    createdAt: instant,
  }),
  Refund: obj({
    id: uuid,
    transactionId: uuid,
    merchantId: uuid,
    amountFils: fils,
    feeReversedFils: fils,
    status: { type: "string", enum: ["succeeded"] },
    transactionStatus: str(),
    refundedTotalFils: fils,
    acquirerReference: str(),
    occurredAt: instant,
  }),
  PaymentLink: obj({
    id: uuid,
    token: str(),
    url: str("Hosted checkout URL."),
    amountFils: fils,
    currency: str(),
    reference: nullable(str()),
    description: nullable(str()),
    status: str(),
    expiresAt: instant,
    transactionId: nullable(uuid),
    createdAt: instant,
    paidAt: nullable(instant),
    canceledAt: nullable(instant),
  }),
  PublicPaymentLink: obj({
    token: str(),
    amountFils: fils,
    currency: str(),
    merchantDisplayName: str(),
    reference: nullable(str()),
    description: nullable(str()),
    status: str(),
    expiresAt: instant,
    merchantPublicKey: nullable(str()),
    merchantIntegrationId: nullable(str()),
  }),
  PaymentLinkPaid: obj({
    status: { type: "string", enum: ["paid"] },
    transactionId: uuid,
    amountFils: fils,
    paidAt: instant,
  }),
  WebhookEndpoint: obj({
    id: uuid,
    url: str(),
    secretPrefix: str(),
    status: str(),
    createdAt: instant,
    updatedAt: instant,
  }),
  WebhookEndpointCreated: obj({
    id: uuid,
    url: str(),
    secretPrefix: str(),
    status: str(),
    createdAt: instant,
    secret: str("Signing secret. Shown once, in this response only."),
  }),
  WebhookDelivery: obj({
    id: uuid,
    outboxEventId: str(),
    eventType: str(),
    deliveryEventId: str("Stable across replays. Use it to deduplicate on your side."),
    status: str(),
    attemptCount: int,
    responseStatusCode: nullable(int),
    responseBodyExcerpt: nullable(str()),
    nextAttemptAt: instant,
    lastAttemptedAt: nullable(instant),
    replayOfDeliveryId: nullable(str()),
    createdAt: instant,
  }),
  WebhookDeliveryDetail: {
    allOf: [ref("WebhookDelivery"), obj({ payload: anyObject, signature: nullable(str()) })],
  },
  WebhookReplay: obj({ deliveryId: str(), status: str() }),
  WebhookTestResult: obj({
    statusCode: nullable(int),
    responseBodyExcerpt: nullable(str()),
    timedOutOrUnreachable: bool,
  }),
  SettlementBatch: obj({
    id: uuid,
    batchDate: date,
    status: str(),
    grossFils: fils,
    feeFils: fils,
    netPayoutFils: fils,
    closedAt: nullable(instant),
    paidAt: nullable(instant),
  }),
  SettlementBatchDetail: {
    allOf: [ref("SettlementBatch"), obj({ includedTransactionCount: int, includedEventCount: int })],
  },
  SettlementBatchTransaction: obj({
    transactionId: uuid,
    schemeAmountFils: fils,
    lineSequence: int,
    reference: nullable(str()),
    status: str(),
    authorizedFils: fils,
    capturedFils: fils,
  }),
  ReconciliationReport: obj({
    periodFrom: date,
    periodTo: date,
    ledgerMerchantPayableNetFils: fils,
    settlementNetPayoutFils: fils,
    pendingUnbatchedFils: fils,
    gapFils: fils,
    explained: bool,
  }),
  BatchIntegrityReport: obj({
    periodFrom: date,
    periodTo: date,
    batchesChecked: int,
    mismatches: arrayOf(
      obj({
        batchId: uuid,
        batchDate: date,
        actual: obj({ grossFils: fils, feeFils: fils, netPayoutFils: fils }),
        expected: obj({ grossFils: fils, feeFils: fils, netPayoutFils: fils }),
        accountingMismatch: bool,
      }),
    ),
  }),
  SettlementSummary: obj({
    periodFrom: date,
    periodTo: date,
    transactionCount: int,
    totalCapturedFils: fils,
    totalRefundedFils: fils,
  }),
  Volumes: obj({
    points: arrayOf(
      obj({
        date,
        capturedCount: int,
        capturedGrossFils: fils,
        voidedCount: int,
        refundCount: int,
        refundGrossFils: fils,
      }),
    ),
    readModelAsOf: nullable(instant),
    live: bool,
  }),
  PayoutTrends: obj({
    points: arrayOf(
      obj({
        settlementBatchId: uuid,
        batchDate: date,
        status: str(),
        grossFils: fils,
        feeFils: fils,
        netPayoutFils: fils,
        paidAt: nullable(instant),
      }),
    ),
    readModelAsOf: nullable(instant),
    live: bool,
  }),
  LedgerActivity: obj({
    points: arrayOf(
      obj({
        id: str(),
        accountId: str(),
        direction: { type: "string", enum: ["debit", "credit"] },
        amountFils: fils,
        occurredAt: instant,
        description: nullable(str()),
      }),
    ),
    readModelAsOf: instant,
    live: bool,
  }),
  TopLinks: obj({
    links: arrayOf(
      obj({
        id: uuid,
        reference: nullable(str()),
        description: nullable(str()),
        amountFils: fils,
        paidAt: instant,
      }),
    ),
    readModelAsOf: instant,
    live: bool,
  }),
  ReportRow: obj({
    id: uuid,
    merchantId: uuid,
    status: str(),
    amountBhd: str("Decimal BHD text."),
    capturedBhd: str("Decimal BHD text."),
    refundedBhd: str("Decimal BHD text."),
    reference: nullable(str()),
    occurredAt: instant,
  }),
  SavedFilter: obj({ id: uuid, name: str(), filter: anyObject, createdAt: instant }),
  AdminMerchant: obj({
    id: uuid,
    displayName: str(),
    status: str(),
    onboardingStatus: str(),
    kycPassed: bool,
    mdrBps: int,
    testMode: bool,
    refundsEnabled: nullable(bool),
    createdAt: instant,
  }),
  AdminMerchantDetail: obj({
    merchant: ref("AdminMerchant"),
    businessProfile: nullable(anyObject),
    kycReviews: arrayOf(anyObject),
    apiKeys: arrayOf(ref("ApiKey")),
    webhookEndpoints: arrayOf(ref("WebhookEndpoint")),
    balance: nullable(anyObject),
    currentFeeSchedule: nullable(anyObject),
    recentSettlementBatches: arrayOf(anyObject),
  }),
  CaptureReview: obj({
    id: uuid,
    merchantId: uuid,
    transactionId: nullable(uuid),
    amountFils: fils,
    captureAttemptAt: instant,
  }),
  CreditRequest: obj({
    id: uuid,
    merchantId: uuid,
    requestedByAdminUserId: uuid,
    requestedByDisplayName: str(),
    reasonCode: { type: "string", enum: ["goodwill", "dispute_resolution", "correction"] },
    memo: nullable(str()),
    baseAmountFils: fils,
    feeReversalFils: fils,
    postedAmountFils: fils,
    effectiveDate: date,
    requiresApproval: bool,
    status: str(),
    approvedByAdminUserId: nullable(uuid),
    approvedByDisplayName: nullable(str()),
    approvedAt: nullable(instant),
    rejectedAt: nullable(instant),
    postedAt: nullable(instant),
    ledgerEntryGroupId: nullable(str()),
    createdAt: instant,
  }),
  AdjustmentImport: obj({
    id: uuid,
    uploadedByAdminUserId: uuid,
    originalFilename: str(),
    rowCount: int,
    appliedAt: instant,
    createdAt: instant,
  }),
  AdjustmentImportRow: obj({
    rowNumber: int,
    merchantId: uuid,
    rawAmountText: str(),
    parsedAmountFils: fils,
    reason: nullable(str()),
    ledgerEntryGroupId: nullable(str()),
  }),
};

export type AuthKind = "public" | "session" | "merchant" | "apiKey" | "admin" | "acquirerSignature";

interface QueryParam {
  name: string;
  schema: Schema;
  required?: boolean;
  description?: string;
  /** Sent enabled, with this value, in the generated Postman request. */
  example?: string;
}

export interface ApiOperation {
  method: "get" | "post" | "patch" | "delete";
  /** Fastify form, e.g. /v1/transactions/:id */
  path: string;
  tag: string;
  summary: string;
  description?: string;
  auth: AuthKind;
  /** Roles the route restricts to. An API key passes merchant role checks. */
  roles?: string[];
  query?: QueryParam[];
  idempotencyKey?: boolean;
  body?: { schema: Schema; example?: unknown; required?: boolean };
  multipart?: boolean;
  /** The success response. `schema` omitted means an empty body. */
  ok: { status: number; schema?: Schema; contentType?: string };
  /** Non-success statuses worth documenting, beyond the auth ones `auth` implies. */
  errors?: Record<number, string>;
  /** Admin plane and acquirer callback: left out of the public docs page. */
  internal?: boolean;
  /** Postman: which collection variable fills each path parameter. */
  pathVars?: Record<string, string>;
  /** Postman: response field, dotted for a nested one (`items.0.id`) -> collection
   *  variable to store it in. */
  captures?: Record<string, string>;
}

const STATUS_FILTER: QueryParam = {
  name: "status",
  schema: arrayOf(str()),
  description: "Repeat to match several statuses.",
};
const LIMIT: QueryParam = { name: "limit", schema: int, description: "Page size." };
const CURSOR: QueryParam = { name: "cursor", schema: str(), description: "`nextCursor` from the previous page." };
const DATE_RANGE: QueryParam[] = [
  { name: "from", schema: date, description: "Defaults to 30 days ago." },
  { name: "to", schema: date, description: "Exclusive. Defaults to tomorrow." },
];
const REQUIRED_DATE_RANGE: QueryParam[] = [
  { name: "from", schema: date, required: true, example: "2026-10-01" },
  { name: "to", schema: date, required: true, description: "Exclusive.", example: "2026-11-01" },
];
const CARD_EXAMPLE = { pan: "4242424242424242", expiryMonth: 12, expiryYear: 2030, cvv: "123" };
const FINANCE = ["finance", "super_admin"];
const WRITERS = ["owner", "finance"];

const TXN_VAR = { id: "transactionId" };
const LINK_VAR = { id: "paymentLinkId" };
const API_KEY_VAR = { id: "apiKeyId" };
const ENDPOINT_VAR = { id: "webhookEndpointId" };
const BATCH_VAR = { id: "settlementBatchId" };
const ADMIN_MERCHANT_VAR = { id: "merchantId" };

const INTERNAL = { internal: true } as const;

/** Order is the order of the Postman folders and requests, so it reads as a flow. */
export const API_OPERATIONS: readonly ApiOperation[] = [
  {
    method: "get", path: "/healthz", tag: "Health", summary: "Liveness", auth: "public",
    ok: { status: 200, schema: obj({ status: str(), uptimeSeconds: { type: "number" } }) },
  },
  {
    method: "get", path: "/readyz", tag: "Health", summary: "Readiness", auth: "public",
    description: "Reports whether the process connected to the database at boot. It does not re-check on each call.",
    ok: { status: 200, schema: obj({ status: str() }) },
    errors: { 503: "Not ready." },
  },

  {
    method: "post", path: "/v1/auth/login", tag: "Merchant auth", summary: "Step 1: password", auth: "public",
    description: "Checks the password and sets a pending-session cookie. That cookie authenticates nothing until the OTP is verified.",
    body: {
      schema: obj({ merchantId: uuid, email: str(), password: str() }),
      example: { merchantId: "{{merchantId}}", email: "{{email}}", password: "{{password}}" },
    },
    ok: { status: 200, schema: ref("OtpChallenge") },
    errors: { 400: "Required fields missing.", 401: "invalid_credentials, in every failure case." },
    captures: { devOtpCode: "otpCode" },
  },
  {
    method: "post", path: "/v1/auth/otp/verify", tag: "Merchant auth", summary: "Step 2: OTP", auth: "public",
    description: "Needs the pending-session cookie from login. On success that session becomes fully authenticated.",
    body: { schema: obj({ code: str() }), example: { code: "{{otpCode}}" } },
    ok: { status: 200, schema: obj({ authenticated: bool, merchantId: uuid, role: str() }) },
    errors: {
      401: "no_pending_session or invalid_code.",
      410: "otp_expired.",
      429: "rate_limited, or too_many_attempts, which also revokes the pending session.",
    },
    captures: { merchantId: "merchantId" },
  },
  {
    method: "post", path: "/v1/auth/otp/resend", tag: "Merchant auth", summary: "Resend the OTP", auth: "public",
    description: "Needs the pending-session cookie. At most one resend every 30 seconds.",
    ok: { status: 200, schema: ref("OtpChallenge") },
    errors: { 401: "no_pending_session.", 429: "rate_limited or resend_too_soon." },
    captures: { devOtpCode: "otpCode" },
  },
  {
    method: "get", path: "/v1/auth/me", tag: "Merchant auth", summary: "Current user", auth: "merchant",
    ok: { status: 200, schema: ref("MerchantIdentity") },
  },
  {
    method: "post", path: "/v1/auth/logout", tag: "Merchant auth", summary: "Log out", auth: "session",
    description: "Also revokes a pending session, so abandoning the OTP screen can still sign out.",
    ok: { status: 204 },
  },

  {
    method: "post", path: "/v1/merchants", tag: "Merchant onboarding", summary: "Sign up a merchant and owner", auth: "public",
    body: {
      schema: obj({
        businessProfile: ref("BusinessProfileInput"),
        owner: obj({ email: str(), password: str() }),
      }),
      example: {
        businessProfile: {
          legalName: "Pearl Coffee W.L.L.",
          registrationNumber: "CR-123456",
          businessType: "llc",
          contactEmail: "owner@pearlcoffee.example",
          contactPhone: "+97317000000",
          addressLine1: "Building 1, Road 1, Block 1",
          city: "Manama",
        },
        owner: { email: "owner@pearlcoffee.example", password: "{{password}}" },
      },
    },
    ok: { status: 201, schema: obj({ merchantId: uuid, ownerUserId: uuid, onboardingStatus: str() }) },
    errors: { 400: "Required fields missing." },
    captures: { merchantId: "merchantId" },
  },

  {
    method: "get", path: "/v1/merchants/:merchantId/business-profile", tag: "Merchant onboarding", summary: "Get the business profile", auth: "session",
    ok: { status: 200, schema: ref("BusinessProfile") },
  },
  {
    method: "patch", path: "/v1/merchants/:merchantId/business-profile", tag: "Merchant onboarding", summary: "Update the business profile",
    auth: "session", roles: WRITERS,
    body: {
      schema: { type: "object", description: "Any BusinessProfileInput fields.", additionalProperties: true },
      example: { contactPhone: "+97317000001" },
    },
    ok: { status: 200, schema: ref("BusinessProfile") },
  },
  {
    method: "post", path: "/v1/merchants/:merchantId/kyc/documents", tag: "Merchant onboarding", summary: "Upload a KYC document",
    auth: "session", roles: WRITERS, multipart: true,
    description: "commercial_registration must be a PDF; the other types may be PDF, JPEG or PNG.",
    body: {
      schema: obj({
        documentType: { type: "string", enum: ["commercial_registration", "owner_id", "proof_of_address", "bank_letter"] },
        file: { type: "string", format: "binary" },
      }),
    },
    ok: { status: 201, schema: ref("KycDocumentUploaded") },
    errors: { 400: "invalid_request.", 413: "file_too_large." },
    captures: { id: "kycDocumentId" },
  },
  {
    method: "get", path: "/v1/merchants/:merchantId/kyc/documents", tag: "Merchant onboarding", summary: "List KYC documents", auth: "session",
    ok: { status: 200, schema: arrayOf(ref("KycDocument")) },
    captures: { "0.id": "kycDocumentId" },
  },
  {
    method: "get", path: "/v1/merchants/:merchantId/kyc/documents/:documentId/file", tag: "Merchant onboarding", summary: "Download a KYC document",
    auth: "session", roles: WRITERS, pathVars: { documentId: "kycDocumentId" },
    ok: { status: 200, schema: { type: "string", format: "binary" }, contentType: "application/octet-stream" },
  },
  {
    method: "get", path: "/v1/merchants/:merchantId/kyc/documents/:documentId/thumbnail", tag: "Merchant onboarding", summary: "Download a KYC thumbnail",
    auth: "session", roles: WRITERS, pathVars: { documentId: "kycDocumentId" },
    ok: { status: 200, schema: { type: "string", format: "binary" }, contentType: "application/octet-stream" },
  },

  {
    method: "post", path: "/v1/merchants/:merchantId/api-keys", tag: "API keys", summary: "Issue an API key",
    auth: "session", roles: ["owner"],
    body: { schema: obj({ label: str() }, ["label"]), example: { label: "Postman" } },
    ok: { status: 201, schema: ref("IssuedApiKey") },
    captures: { rawKey: "apiKey", id: "apiKeyId" },
  },
  {
    method: "get", path: "/v1/merchants/:merchantId/api-keys", tag: "API keys", summary: "List API keys",
    auth: "session", roles: ["owner"],
    ok: { status: 200, schema: arrayOf(ref("ApiKey")) },
  },
  {
    method: "delete", path: "/v1/merchants/:merchantId/api-keys/:id", tag: "API keys", summary: "Revoke an API key",
    auth: "session", roles: ["owner"], pathVars: API_KEY_VAR,
    ok: { status: 204 },
    errors: { 404: "api_key_not_found." },
  },

  {
    method: "post", path: "/v1/transactions", tag: "Transactions", summary: "Authorize a payment", auth: "apiKey",
    description: "Server-to-server; API key only. The merchant must be approved. A decline creates no transaction.",
    idempotencyKey: true,
    body: {
      schema: obj({ amountFils: fils, card: ref("Card"), reference: str() }, ["reference"]),
      example: { amountFils: 4750, card: CARD_EXAMPLE, reference: "order-1001" },
    },
    ok: { status: 201, schema: ref("Transaction") },
    errors: {
      400: "invalid_request or idempotency_key_required.",
      402: "card_declined, with declineReason and acquirerReference.",
      403: "merchant_not_approved.",
      409: "request_in_progress: the first request with this key hasn't finished.",
      422: "idempotency_key_reused: this key was used with a different request.",
      502: "acquirer_unavailable. The same key may be retried.",
    },
    captures: { id: "transactionId" },
  },
  {
    method: "post", path: "/v1/transactions/:id/capture", tag: "Transactions", summary: "Capture", auth: "merchant",
    description: "Omit amountFils to capture the remaining authorized amount.",
    idempotencyKey: true, pathVars: TXN_VAR,
    body: { schema: obj({ amountFils: fils }, ["amountFils"]), example: { amountFils: 4750 }, required: false },
    ok: { status: 200, schema: ref("Transaction") },
    errors: {
      402: "card_captured_declined.",
      404: "transaction_not_found.",
      409: "not_capturable, capture_exceeds_remaining (with remainingFils), or request_in_progress.",
      422: "idempotency_key_reused.",
      502: "acquirer_unavailable.",
    },
  },
  {
    method: "post", path: "/v1/transactions/:id/void", tag: "Transactions", summary: "Void", auth: "merchant",
    description: "Naturally idempotent, so no Idempotency-Key: voiding a voided transaction returns it again.",
    pathVars: TXN_VAR,
    ok: { status: 200, schema: ref("Transaction") },
    errors: { 404: "transaction_not_found.", 409: "not_voidable." },
  },
  {
    method: "get", path: "/v1/transactions", tag: "Transactions", summary: "List transactions", auth: "merchant",
    query: [
      STATUS_FILTER,
      { name: "from", schema: instant, description: "ISO-8601 instant." },
      { name: "to", schema: instant, description: "ISO-8601 instant." },
      { name: "search", schema: str() },
      { ...LIMIT, description: "1-100, default 25." },
      CURSOR,
    ],
    ok: { status: 200, schema: page("transactions", "Transaction") },
  },
  {
    method: "get", path: "/v1/transactions/export", tag: "Transactions", summary: "Export as CSV", auth: "merchant",
    query: [
      STATUS_FILTER,
      { name: "from", schema: instant, description: "ISO-8601 instant." },
      { name: "to", schema: instant, description: "ISO-8601 instant." },
    ],
    ok: { status: 200, schema: { type: "string" }, contentType: "text/csv" },
    errors: { 400: "invalid_date." },
  },
  {
    method: "get", path: "/v1/transactions/:id", tag: "Transactions", summary: "Get a transaction", auth: "merchant",
    pathVars: TXN_VAR,
    ok: { status: 200, schema: ref("Transaction") },
    errors: { 404: "transaction_not_found." },
  },
  {
    method: "get", path: "/v1/transactions/:id/events", tag: "Transactions", summary: "Transaction timeline", auth: "merchant",
    pathVars: TXN_VAR,
    ok: { status: 200, schema: arrayOf(ref("TransactionEvent")) },
    errors: { 404: "transaction_not_found." },
  },

  {
    method: "post", path: "/v1/refunds", tag: "Refunds", summary: "Refund a transaction",
    auth: "merchant", roles: WRITERS, idempotencyKey: true,
    description: "Returns 501 unless FEATURE_REFUNDS is on, and the merchant also needs the refund opt-in. Omit amountFils to refund the remainder.",
    body: {
      schema: obj({ transactionId: uuid, amountFils: fils, reason: str() }, ["amountFils", "reason"]),
      example: { transactionId: "{{transactionId}}", amountFils: 1000, reason: "Customer returned the item" },
    },
    ok: { status: 200, schema: ref("Refund") },
    errors: {
      400: "invalid_request, invalid_amount or idempotency_key_required.",
      402: "refund_declined.",
      403: "refunds_on_hold.",
      404: "transaction_not_found.",
      409: "transaction_not_refundable.",
      422: "The amount failed validation.",
      501: "not_implemented: the release gate is off.",
      502: "acquirer_unavailable.",
    },
  },

  {
    method: "post", path: "/v1/merchants/:merchantId/payment-links", tag: "Payment links", summary: "Create a payment link",
    auth: "merchant", roles: WRITERS,
    body: {
      schema: obj(
        { amountFils: fils, reference: str(), description: str(), expiresAt: instant },
        ["reference", "description"],
      ),
      example: { amountFils: 4750, reference: "invoice-77", description: "Catering deposit", expiresAt: "2030-01-01T00:00:00+03:00" },
    },
    ok: { status: 201, schema: ref("PaymentLink") },
    captures: { token: "paymentLinkToken", id: "paymentLinkId" },
  },
  {
    method: "get", path: "/v1/merchants/:merchantId/payment-links", tag: "Payment links", summary: "List payment links",
    auth: "merchant", query: [STATUS_FILTER, LIMIT, CURSOR],
    ok: { status: 200, schema: page("paymentLinks", "PaymentLink") },
  },
  {
    method: "delete", path: "/v1/merchants/:merchantId/payment-links/:id", tag: "Payment links", summary: "Cancel a payment link",
    auth: "merchant", roles: WRITERS, pathVars: LINK_VAR,
    ok: { status: 204 },
    errors: { 404: "payment_link_not_found.", 409: "not_cancelable." },
  },
  {
    method: "get", path: "/v1/payment-links/:token", tag: "Payment links", summary: "Read a link (hosted checkout)", auth: "public",
    pathVars: { token: "paymentLinkToken" },
    ok: { status: 200, schema: ref("PublicPaymentLink") },
    errors: { 404: "payment_link_not_found." },
  },
  {
    method: "post", path: "/v1/payment-links/:token/pay", tag: "Payment links", summary: "Pay a link (hosted checkout)", auth: "public",
    description: "Authorizes and captures in one call. Failures carry a `stage` field naming the step that failed.",
    idempotencyKey: true, pathVars: { token: "paymentLinkToken" },
    body: {
      schema: obj({ card: ref("Card"), submittedAt: instant }, ["submittedAt"]),
      example: { card: CARD_EXAMPLE },
    },
    ok: { status: 200, schema: ref("PaymentLinkPaid") },
    errors: {
      402: "Card declined.",
      404: "payment_link_not_found.",
      409: "payment_link_already_paid, payment_link_canceled, payment_link_processing or payment_link_not_payable.",
      410: "payment_link_expired.",
      502: "acquirer_unavailable.",
    },
  },

  {
    method: "post", path: "/v1/merchants/:merchantId/webhook-endpoints", tag: "Webhooks", summary: "Register an endpoint",
    auth: "merchant", roles: WRITERS,
    description: "The URL must be https in production.",
    body: { schema: obj({ url: str() }), example: { url: "https://example.com/filspay-webhook" } },
    ok: { status: 201, schema: ref("WebhookEndpointCreated") },
    captures: { id: "webhookEndpointId", secret: "webhookSecret" },
  },
  {
    method: "get", path: "/v1/merchants/:merchantId/webhook-endpoints", tag: "Webhooks", summary: "List endpoints",
    auth: "merchant", roles: WRITERS,
    ok: { status: 200, schema: arrayOf(ref("WebhookEndpoint")) },
  },
  {
    method: "patch", path: "/v1/merchants/:merchantId/webhook-endpoints/:id", tag: "Webhooks", summary: "Update an endpoint",
    auth: "merchant", roles: WRITERS, pathVars: ENDPOINT_VAR,
    body: {
      schema: obj({ url: str(), status: { type: "string", enum: ["active", "disabled"] } }, ["url", "status"]),
      example: { status: "disabled" },
    },
    ok: { status: 200, schema: ref("WebhookEndpoint") },
    errors: { 404: "webhook_endpoint_not_found." },
  },
  {
    method: "post", path: "/v1/merchants/:merchantId/webhook-endpoints/:id/test", tag: "Webhooks", summary: "Send a test event",
    auth: "merchant", roles: WRITERS, pathVars: ENDPOINT_VAR,
    description: "Sent and awaited inline, so the response shows what your receiver answered.",
    ok: { status: 200, schema: ref("WebhookTestResult") },
  },
  {
    method: "get", path: "/v1/merchants/:merchantId/webhook-endpoints/:id/deliveries", tag: "Webhooks", summary: "List deliveries",
    auth: "merchant", roles: ["owner", "finance", "support"], pathVars: ENDPOINT_VAR, query: [STATUS_FILTER, LIMIT, CURSOR],
    ok: { status: 200, schema: page("deliveries", "WebhookDelivery") },
    errors: { 404: "webhook_endpoint_not_found." },
    captures: { "deliveries.0.id": "deliveryId" },
  },
  {
    method: "get", path: "/v1/merchants/:merchantId/webhook-endpoints/:id/deliveries/:deliveryId", tag: "Webhooks", summary: "Get a delivery",
    auth: "merchant", roles: ["owner", "finance", "support"], pathVars: ENDPOINT_VAR,
    ok: { status: 200, schema: ref("WebhookDeliveryDetail") },
    errors: { 404: "webhook_endpoint_not_found or webhook_delivery_not_found." },
  },
  {
    method: "post", path: "/v1/merchants/:merchantId/webhook-endpoints/:id/deliveries/:deliveryId/replay", tag: "Webhooks", summary: "Replay a delivery",
    auth: "merchant", roles: WRITERS, pathVars: ENDPOINT_VAR,
    description: "Queued for the normal dispatch pipeline, not sent inline.",
    ok: { status: 202, schema: ref("WebhookReplay") },
  },
  {
    method: "delete", path: "/v1/merchants/:merchantId/webhook-endpoints/:id", tag: "Webhooks", summary: "Delete an endpoint",
    auth: "merchant", roles: WRITERS, pathVars: ENDPOINT_VAR,
    ok: { status: 204 },
    errors: { 404: "webhook_endpoint_not_found." },
  },

  {
    method: "get", path: "/v1/settlement/batches", tag: "Settlement", summary: "List batches", auth: "merchant",
    query: [{ name: "from", schema: str() }, { name: "to", schema: str() }, STATUS_FILTER, LIMIT, CURSOR],
    ok: { status: 200, schema: page("batches", "SettlementBatch") },
    captures: { "batches.0.id": "settlementBatchId" },
  },
  {
    method: "get", path: "/v1/settlement/reconciliation", tag: "Settlement", summary: "Reconciliation report",
    auth: "merchant", roles: WRITERS, query: REQUIRED_DATE_RANGE,
    ok: { status: 200, schema: ref("ReconciliationReport") },
    errors: { 400: "from and to are required." },
  },
  {
    method: "get", path: "/v1/settlement/batch-integrity", tag: "Settlement", summary: "Batch integrity report",
    auth: "merchant", roles: WRITERS, query: REQUIRED_DATE_RANGE,
    ok: { status: 200, schema: ref("BatchIntegrityReport") },
    errors: { 400: "from and to are required." },
  },
  {
    method: "get", path: "/v1/settlement/summary", tag: "Settlement", summary: "Period summary",
    auth: "merchant", roles: WRITERS, query: REQUIRED_DATE_RANGE,
    ok: { status: 200, schema: ref("SettlementSummary") },
    errors: { 400: "from and to are required." },
  },
  {
    method: "get", path: "/v1/settlement/batches/:id", tag: "Settlement", summary: "Get a batch", auth: "merchant",
    pathVars: BATCH_VAR,
    ok: { status: 200, schema: ref("SettlementBatchDetail") },
    errors: { 404: "settlement_batch_not_found." },
  },
  {
    method: "get", path: "/v1/settlement/batches/:id/transactions", tag: "Settlement", summary: "Transactions in a batch", auth: "merchant",
    pathVars: BATCH_VAR,
    ok: { status: 200, schema: obj({ transactions: arrayOf(ref("SettlementBatchTransaction")) }) },
    errors: { 404: "settlement_batch_not_found." },
  },

  {
    method: "get", path: "/v1/analytics/volumes", tag: "Analytics", summary: "Daily volumes", auth: "merchant",
    query: DATE_RANGE, ok: { status: 200, schema: ref("Volumes") }, errors: { 400: "invalid_date." },
  },
  {
    method: "get", path: "/v1/analytics/payout-trends", tag: "Analytics", summary: "Payout trends", auth: "merchant",
    query: DATE_RANGE, ok: { status: 200, schema: ref("PayoutTrends") }, errors: { 400: "invalid_date." },
  },
  {
    method: "get", path: "/v1/analytics/recent-ledger-activity", tag: "Analytics", summary: "Recent ledger activity", auth: "merchant",
    query: DATE_RANGE, ok: { status: 200, schema: ref("LedgerActivity") }, errors: { 400: "invalid_date." },
  },
  {
    method: "get", path: "/v1/analytics/top-links", tag: "Analytics", summary: "Top payment links", auth: "merchant",
    query: [...DATE_RANGE, LIMIT], ok: { status: 200, schema: ref("TopLinks") }, errors: { 400: "invalid_date." },
  },

  {
    method: "get", path: "/v1/reporting/transactions", tag: "Reporting", summary: "Transaction report", auth: "merchant",
    query: [{ name: "filter", schema: str(), description: 'JSON text, e.g. {"status":"captured","from":"2026-10-01","to":"2026-11-01"}.' }],
    ok: { status: 200, schema: arrayOf(ref("ReportRow")) },
    errors: { 400: "invalid_filter.", 403: "report_merchant_forbidden." },
  },
  {
    method: "post", path: "/v1/reporting/saved-filters", tag: "Reporting", summary: "Save a filter", auth: "merchant",
    body: {
      schema: obj({ name: str(), filter: anyObject }),
      example: { name: "Captured this month", filter: { status: "captured" } },
    },
    ok: { status: 201, schema: ref("SavedFilter") },
  },
  {
    method: "get", path: "/v1/reporting/saved-filters", tag: "Reporting", summary: "List saved filters", auth: "merchant",
    ok: { status: 200, schema: arrayOf(ref("SavedFilter")) },
  },
  {
    method: "get", path: "/v1/reporting/export-summary", tag: "Reporting", summary: "Export summary", auth: "merchant",
    ok: { status: 200, schema: obj({ totalDays: int, grossFils: fils }) },
  },

  {
    ...INTERNAL, method: "post", path: "/v1/acquirer/callbacks", tag: "Acquirer", summary: "Fraud-review callback", auth: "acquirerSignature",
    description: "Called by the acquirer. Not rate limited. The Acquirer-Callback-Signature header is the only authentication.",
    body: {
      schema: obj({
        callbackId: str(),
        type: { type: "string", enum: ["fraud_review.completed"] },
        transactionId: uuid,
        occurredAt: instant,
        outcome: { type: "string", enum: ["cleared", "confirmed_fraud"] },
        note: str(),
      }),
    },
    ok: { status: 200, schema: obj({ received: bool }) },
    errors: { 400: "invalid_request." },
  },

  {
    ...INTERNAL, method: "post", path: "/v1/admin/auth/login", tag: "Admin auth", summary: "Step 1: password", auth: "public",
    body: { schema: obj({ email: str(), password: str() }), example: { email: "{{adminEmail}}", password: "{{adminPassword}}" } },
    ok: { status: 200, schema: ref("OtpChallenge") },
    errors: { 400: "Required fields missing.", 401: "invalid_credentials." },
    captures: { devOtpCode: "adminOtpCode" },
  },
  {
    ...INTERNAL, method: "post", path: "/v1/admin/auth/otp/verify", tag: "Admin auth", summary: "Step 2: OTP", auth: "public",
    body: { schema: obj({ code: str() }), example: { code: "{{adminOtpCode}}" } },
    ok: { status: 200, schema: obj({ authenticated: bool, adminUserId: uuid, role: str() }) },
    errors: { 401: "no_pending_session or invalid_code.", 410: "otp_expired.", 429: "rate_limited or too_many_attempts." },
  },
  {
    ...INTERNAL, method: "get", path: "/v1/admin/auth/me", tag: "Admin auth", summary: "Current admin", auth: "admin",
    ok: { status: 200, schema: obj({ adminUserId: uuid, email: str(), role: str() }) },
  },
  {
    ...INTERNAL, method: "post", path: "/v1/admin/auth/logout", tag: "Admin auth", summary: "Log out", auth: "admin",
    ok: { status: 204 },
  },

  {
    ...INTERNAL, method: "get", path: "/v1/admin/merchants", tag: "Admin merchants", summary: "List merchants", auth: "admin",
    query: [{ name: "q", schema: str() }, { name: "onboardingStatus", schema: arrayOf(str()) }, LIMIT, CURSOR],
    ok: { status: 200, schema: page("merchants", "AdminMerchant") },
  },
  {
    ...INTERNAL, method: "get", path: "/v1/admin/merchants/:id", tag: "Admin merchants", summary: "Merchant detail", auth: "admin",
    pathVars: ADMIN_MERCHANT_VAR,
    ok: { status: 200, schema: ref("AdminMerchantDetail") },
    errors: { 404: "merchant_not_found." },
  },
  {
    ...INTERNAL, method: "post", path: "/v1/admin/merchants/:id/kyc-reviews", tag: "Admin merchants", summary: "Review KYC",
    auth: "admin", roles: FINANCE, pathVars: ADMIN_MERCHANT_VAR,
    body: {
      schema: obj({ outcome: { type: "string", enum: ["approved", "rejected"] }, notes: str() }, ["notes"]),
      example: { outcome: "approved", notes: "Documents verified" },
    },
    ok: { status: 200, schema: obj({ onboardingStatus: str(), kycPassed: bool }) },
    errors: { 400: "invalid_request.", 404: "merchant_not_found." },
  },
  {
    ...INTERNAL, method: "post", path: "/v1/admin/merchants/bulk-approve", tag: "Admin merchants", summary: "Bulk-approve KYC",
    auth: "admin", roles: FINANCE,
    description: "All or nothing: any invalid selection rejects the whole request.",
    body: {
      schema: obj({ merchantIds: { ...arrayOf(uuid), maxItems: 200 }, notes: str() }, ["notes"]),
      example: { merchantIds: ["{{merchantId}}"], notes: "Batch review" },
    },
    ok: { status: 200, schema: obj({ approvedCount: int, approvedMerchantIds: arrayOf(uuid) }) },
    errors: { 400: "invalid_request." },
  },
  {
    ...INTERNAL, method: "post", path: "/v1/admin/merchants/:id/refunds-enabled", tag: "Admin merchants", summary: "Set the refund opt-in",
    auth: "admin", roles: FINANCE, pathVars: ADMIN_MERCHANT_VAR,
    body: { schema: obj({ enabled: bool }), example: { enabled: true } },
    ok: { status: 200, schema: anyObject },
    errors: { 400: "invalid_request.", 404: "merchant_not_found." },
  },
  {
    ...INTERNAL, method: "post", path: "/v1/admin/merchants/:id/api-keys/:keyId/rotate", tag: "Admin merchants", summary: "Rotate an API key",
    auth: "admin", roles: FINANCE, pathVars: { ...ADMIN_MERCHANT_VAR, keyId: "apiKeyId" },
    body: { schema: obj({ label: str() }, ["label"]), example: { label: "Rotated" }, required: false },
    ok: { status: 201, schema: ref("IssuedApiKey") },
    errors: { 404: "merchant_not_found or api_key_not_found." },
  },
  {
    ...INTERNAL, method: "post", path: "/v1/admin/merchants/:id/impersonate", tag: "Admin merchants", summary: "Start read-only impersonation",
    auth: "admin", roles: ["support", "finance", "super_admin"], pathVars: ADMIN_MERCHANT_VAR,
    description: "Sets the impersonation cookie. Writes made under it are refused.",
    ok: { status: 201, schema: obj({ grantId: uuid, merchantId: uuid, expiresAt: instant }) },
    errors: { 404: "merchant_not_found." },
    captures: { grantId: "impersonationGrantId" },
  },
  {
    ...INTERNAL, method: "post", path: "/v1/admin/impersonation/:grantId/end", tag: "Admin merchants", summary: "End impersonation",
    auth: "admin", pathVars: { grantId: "impersonationGrantId" },
    ok: { status: 204 },
    errors: { 404: "impersonation_grant_not_found." },
  },
  {
    ...INTERNAL, method: "post", path: "/v1/admin/merchants/:id/transactions/recompute-statuses", tag: "Admin merchants", summary: "Recompute transaction statuses",
    auth: "admin", roles: FINANCE, pathVars: ADMIN_MERCHANT_VAR,
    ok: { status: 200, schema: obj({ merchantId: uuid, scanned: int, updated: int, openAuthorizations: int, flagsUpdated: anyObject }) },
    errors: { 404: "merchant_not_found." },
  },

  {
    ...INTERNAL, method: "post", path: "/v1/admin/settlement/run-batch", tag: "Admin finance", summary: "Run a settlement batch",
    auth: "admin", roles: FINANCE,
    body: {
      schema: obj({ date, merchantId: uuid }, ["merchantId"]),
      example: { date: "2026-10-29", merchantId: "{{merchantId}}" },
    },
    ok: {
      status: 200,
      schema: obj({
        businessDate: date,
        merchantResults: arrayOf(
          obj({
            merchantId: uuid,
            batchId: uuid,
            alreadyClosed: bool,
            alreadyPaid: bool,
            grossFils: fils,
            feeFils: fils,
            netPayoutFils: fils,
          }),
        ),
      }),
    },
    errors: { 400: "invalid_request.", 500: "The run failed; the body may include settlementRun." },
  },
  {
    ...INTERNAL, method: "get", path: "/v1/admin/settlement/batch-integrity", tag: "Admin finance", summary: "Batch integrity report",
    auth: "admin", roles: FINANCE,
    query: [{ name: "merchantId", schema: uuid, required: true, example: "{{merchantId}}" }, ...REQUIRED_DATE_RANGE],
    ok: { status: 200, schema: ref("BatchIntegrityReport") },
    errors: { 400: "invalid_request." },
  },
  {
    ...INTERNAL, method: "post", path: "/v1/admin/balances/rebuild", tag: "Admin finance", summary: "Rebuild cached balances",
    auth: "admin", roles: FINANCE,
    ok: {
      status: 200,
      schema: obj({ rebuiltCount: int, changed: arrayOf(obj({ merchantId: uuid, before: fils, after: fils })) }),
    },
  },
  {
    ...INTERNAL, method: "post", path: "/v1/admin/reporting/rebuild", tag: "Admin finance", summary: "Rebuild analytics rollups",
    auth: "admin", roles: FINANCE,
    ok: { status: 200, schema: obj({ volumeRows: int, trendRows: int }) },
  },
  {
    ...INTERNAL, method: "post", path: "/v1/admin/merchants/:id/mdr-recalculation", tag: "Admin finance", summary: "Recalculate MDR",
    auth: "admin", roles: FINANCE, pathVars: ADMIN_MERCHANT_VAR,
    description: "Moves money: posts adjustments for any fee difference. Do not run it as a routine check.",
    body: {
      schema: obj({ from: date, to: { ...date, description: "Exclusive." } }),
      example: { from: "2026-10-01", to: "2026-11-01" },
    },
    ok: {
      status: 200,
      schema: obj({
        batchesConsidered: int,
        adjusted: arrayOf(
          obj({ batchId: uuid, batchDate: date, status: str(), oldFeeFils: fils, newFeeFils: fils, diffFils: fils }),
        ),
      }),
    },
    errors: { 400: "invalid_request.", 404: "merchant_not_found." },
  },
  {
    ...INTERNAL, method: "post", path: "/v1/admin/merchants/:id/balance-adjustments", tag: "Admin finance", summary: "Adjust a balance",
    auth: "admin", roles: FINANCE, pathVars: ADMIN_MERCHANT_VAR,
    body: {
      schema: obj({ deltaFils: { ...fils, description: "Signed, non-zero integer fils." }, reason: str() }),
      example: { deltaFils: -250, reason: "Confirmed against the bank statement" },
    },
    ok: {
      status: 200,
      schema: obj({ merchantId: uuid, deltaFils: fils, cachedPayableFilsBefore: fils, cachedPayableFilsAfter: fils }),
    },
    errors: { 400: "invalid_request.", 404: "merchant_not_found." },
  },
  {
    ...INTERNAL, method: "post", path: "/v1/admin/merchants/:id/credits", tag: "Admin finance", summary: "Request a credit", auth: "admin",
    pathVars: ADMIN_MERCHANT_VAR,
    body: {
      schema: obj(
        {
          baseAmountFils: fils,
          reasonCode: { type: "string", enum: ["goodwill", "dispute_resolution", "correction"] },
          memo: str(),
          reverseFee: bool,
          effectiveDate: { ...date, description: "Today or earlier." },
        },
        ["memo", "reverseFee"],
      ),
      example: { baseAmountFils: 1000, reasonCode: "goodwill", memo: "Service outage", reverseFee: false, effectiveDate: "2026-10-29" },
    },
    ok: { status: 201, schema: ref("CreditRequest") },
    errors: { 400: "invalid_request or invalid_amount.", 404: "merchant_not_found." },
    captures: { id: "creditRequestId" },
  },
  {
    ...INTERNAL, method: "get", path: "/v1/admin/credits", tag: "Admin finance", summary: "List credit requests", auth: "admin",
    query: [{ name: "status", schema: str() }, { name: "merchantId", schema: uuid }, LIMIT, CURSOR],
    ok: { status: 200, schema: page("items", "CreditRequest") },
    captures: { "items.0.id": "creditRequestId" },
  },
  {
    ...INTERNAL, method: "post", path: "/v1/admin/credits/:creditRequestId/approve", tag: "Admin finance", summary: "Approve a credit",
    auth: "admin", roles: FINANCE, pathVars: { creditRequestId: "creditRequestId" },
    ok: { status: 200, schema: ref("CreditRequest") },
    errors: { 404: "credit_request_not_found." },
  },
  {
    ...INTERNAL, method: "post", path: "/v1/admin/credits/:creditRequestId/reject", tag: "Admin finance", summary: "Reject a credit",
    auth: "admin", roles: FINANCE, pathVars: { creditRequestId: "creditRequestId" },
    body: { schema: obj({ reason: str() }), example: { reason: "Duplicate request" } },
    ok: { status: 200, schema: ref("CreditRequest") },
    errors: { 404: "credit_request_not_found." },
  },
  {
    ...INTERNAL, method: "post", path: "/v1/admin/adjustment-imports", tag: "Admin finance", summary: "Upload and apply an adjustment CSV",
    auth: "admin", roles: FINANCE,
    description: "Moves money immediately, with no dry run and no idempotency key: uploading a file twice posts it twice.",
    body: {
      schema: obj({ csvContent: str("merchantId,amount,reason rows; amount in BHD, up to 3 decimals."), originalFilename: str() }, ["originalFilename"]),
      example: { csvContent: "merchantId,amount,reason\n{{merchantId}},4.750,Manual correction", originalFilename: "adjustments.csv" },
    },
    ok: { status: 201, schema: obj({ importId: uuid, rowCount: int, totalPostedFils: fils }) },
    errors: { 400: "invalid_request or invalid_csv_row." },
    captures: { importId: "adjustmentImportId" },
  },
  {
    ...INTERNAL, method: "get", path: "/v1/admin/adjustment-imports", tag: "Admin finance", summary: "List adjustment imports", auth: "admin",
    query: [LIMIT, CURSOR],
    ok: { status: 200, schema: page("items", "AdjustmentImport") },
    captures: { "items.0.id": "adjustmentImportId" },
  },
  {
    ...INTERNAL, method: "get", path: "/v1/admin/adjustment-imports/:id/rows", tag: "Admin finance", summary: "Rows of an import", auth: "admin",
    pathVars: { id: "adjustmentImportId" },
    ok: { status: 200, schema: obj({ rows: arrayOf(ref("AdjustmentImportRow")) }) },
    errors: { 404: "adjustment_import_not_found." },
  },
  {
    ...INTERNAL, method: "get", path: "/v1/admin/payment-links/capture-reviews", tag: "Admin finance", summary: "Capture reviews, all merchants",
    auth: "admin", roles: FINANCE,
    query: [{ ...LIMIT, description: "1-100, default 100." }, { name: "offset", schema: int, description: "0-1000000." }],
    ok: { status: 200, schema: obj({ reviews: arrayOf(ref("CaptureReview")) }) },
    errors: { 400: "invalid_request." },
  },
  {
    ...INTERNAL, method: "get", path: "/v1/admin/merchants/:id/payment-links/capture-reviews", tag: "Admin finance", summary: "Capture reviews, one merchant",
    auth: "admin", roles: FINANCE, pathVars: ADMIN_MERCHANT_VAR,
    ok: { status: 200, schema: obj({ reviews: arrayOf(ref("CaptureReview")) }) },
    errors: { 404: "merchant_not_found." },
  },
  {
    ...INTERNAL, method: "post", path: "/v1/admin/merchants/:id/payment-links/:linkId/capture-review", tag: "Admin finance", summary: "Resolve a capture review",
    auth: "admin", roles: FINANCE, pathVars: { ...ADMIN_MERCHANT_VAR, linkId: "paymentLinkId" },
    body: {
      schema: obj(
        {
          resolution: { type: "string", enum: ["retry_capture", "release"] },
          releaseEvidence: str("Acquirer confirmation, for a release."),
        },
        ["releaseEvidence"],
      ),
      example: { resolution: "retry_capture" },
    },
    ok: { status: 200, schema: obj({ status: { type: "string", enum: ["paid", "active"] }, outcome: str() }) },
    errors: { 400: "invalid_request.", 404: "merchant_not_found or capture_review_not_found." },
  },

  {
    ...INTERNAL, method: "post", path: "/v1/admin/merchants/:id/webhook-endpoints/:endpointId/replay-batch", tag: "Admin webhooks", summary: "Replay deliveries in a date range",
    auth: "admin", pathVars: { ...ADMIN_MERCHANT_VAR, endpointId: "webhookEndpointId" },
    body: {
      schema: obj({ from: instant, to: instant, statuses: arrayOf(str()) }, ["statuses"]),
      example: { from: "2026-10-01T00:00:00+03:00", to: "2026-10-02T00:00:00+03:00" },
    },
    ok: { status: 200, schema: obj({ matchedCount: int, replayedDeliveryIds: arrayOf(str()) }) },
    errors: { 400: "invalid_request.", 404: "merchant_not_found or webhook_endpoint_not_found." },
  },
  {
    ...INTERNAL, method: "post", path: "/v1/admin/merchants/:id/webhook-endpoints/:endpointId/archive", tag: "Admin webhooks", summary: "Archive delivery history",
    auth: "admin", pathVars: { ...ADMIN_MERCHANT_VAR, endpointId: "webhookEndpointId" },
    body: {
      schema: obj({ from: instant, to: instant }),
      example: { from: "2026-10-01T00:00:00+03:00", to: "2026-10-02T00:00:00+03:00" },
    },
    ok: { status: 201, schema: obj({ archiveId: uuid, deliveryCount: int }) },
    errors: { 400: "invalid_request.", 404: "merchant_not_found or webhook_endpoint_not_found." },
    captures: { archiveId: "webhookArchiveId" },
  },
  {
    ...INTERNAL, method: "post", path: "/v1/admin/merchants/:id/webhook-endpoints/:endpointId/archive/:archiveId/replay", tag: "Admin webhooks", summary: "Replay an archive",
    auth: "admin", pathVars: { ...ADMIN_MERCHANT_VAR, endpointId: "webhookEndpointId", archiveId: "webhookArchiveId" },
    description: "Defaults to the endpoint it was captured from. Pass targetEndpointId to move history to a new URL.",
    body: { schema: obj({ targetEndpointId: uuid }, ["targetEndpointId"]), required: false },
    ok: { status: 200, schema: anyObject },
    errors: { 404: "merchant_not_found, webhook_endpoint_not_found or webhook_delivery_archive_not_found." },
  },
];

const AUTH_SECURITY: Record<AuthKind, Array<Record<string, string[]>>> = {
  public: [],
  session: [{ merchantSession: [] }],
  merchant: [{ merchantSession: [] }, { apiKey: [] }],
  apiKey: [{ apiKey: [] }],
  admin: [{ adminSession: [] }],
  acquirerSignature: [{ acquirerSignature: [] }],
};

const AUTH_ERRORS: Record<AuthKind, Record<number, string>> = {
  public: {},
  session: { 401: "unauthenticated.", 403: "forbidden." },
  merchant: { 401: "unauthenticated.", 403: "forbidden." },
  apiKey: { 401: "unauthenticated.", 403: "forbidden." },
  admin: { 401: "unauthenticated.", 403: "forbidden." },
  acquirerSignature: { 401: "invalid_signature." },
};

const errorContent = { "application/json": { schema: ref("Error") } };

const RATE_LIMIT_HEADERS = {
  "RateLimit-Limit": { schema: int, description: "Budget of the rule closest to its limit." },
  "RateLimit-Remaining": { schema: int, description: "Requests left in the window." },
  "RateLimit-Reset": { schema: int, description: "Seconds until the window resets." },
};

const DESCRIPTION = `FilsPay payment API.

**Money** is always integer fils: 1 BHD = 1000 fils, so 4.750 BHD is \`4750\`. **Business dates** are Asia/Bahrain.

**Authentication**
- *Dashboard:* \`POST /v1/auth/login\`, then \`POST /v1/auth/otp/verify\`. The session is an httpOnly cookie, which this page's requests send automatically.
- *Server-to-server:* \`Authorization: Bearer <API key>\`. An owner issues keys from \`POST /v1/merchants/{merchantId}/api-keys\`.

**Idempotency:** requests marked with \`Idempotency-Key\` can be retried safely with the same key. The original response is replayed, including declines.

**Rate limits:** every response carries \`RateLimit-*\` headers. Over budget returns \`429\` with error code \`rate_limited\` and a \`Retry-After\` header. The default budget is per IP; login, OTP, signup, hosted checkout, CSV export and webhook test sends have stricter ones.

**Errors** are always \`{ "error": "code", "message": "optional" }\`. Clients should match on \`error\`.`;

/** `/v1/x/:id` -> `/v1/x/{id}` */
export function toOpenApiPath(path: string): string {
  return path.replace(/:([A-Za-z]+)/g, "{$1}");
}

function buildOperation(op: ApiOperation): Record<string, unknown> {
  const pathParams = [...op.path.matchAll(/:([A-Za-z]+)/g)].map((match) => ({
    name: match[1],
    in: "path",
    required: true,
    schema: { type: "string" },
  }));
  const queryParams = (op.query ?? []).map((param) => ({
    name: param.name,
    in: "query",
    required: param.required ?? false,
    schema: param.schema,
    ...(param.description ? { description: param.description } : {}),
  }));
  const idempotency = op.idempotencyKey
    ? [{
        name: "Idempotency-Key",
        in: "header",
        required: true,
        schema: { type: "string" },
        description: "A unique value per logical operation. Reuse it only to retry that same request.",
      }]
    : [];

  const roles = op.roles ? `**Roles:** ${op.roles.join(", ")}.` : "";
  const description = [op.description, roles].filter(Boolean).join("\n\n");

  const statuses: Record<number, string> = { ...AUTH_ERRORS[op.auth], ...op.errors };
  const limited = !["/healthz", "/readyz", "/v1/acquirer/callbacks"].includes(op.path);
  if (limited && !statuses[429]) statuses[429] = "rate_limited. See the Retry-After header.";

  const responses: Record<string, unknown> = {
    [op.ok.status]: {
      description: "Success.",
      ...(limited ? { headers: RATE_LIMIT_HEADERS } : {}),
      ...(op.ok.schema ? { content: { [op.ok.contentType ?? "application/json"]: { schema: op.ok.schema } } } : {}),
    },
  };
  for (const [status, text] of Object.entries(statuses)) {
    responses[status] = { description: text, content: errorContent };
  }

  return {
    tags: [op.tag],
    summary: op.summary,
    ...(description ? { description } : {}),
    operationId: `${op.method}${op.path.replace(/[/:-]+(.)?/g, (_, char: string | undefined) => (char ?? "").toUpperCase())}`,
    security: AUTH_SECURITY[op.auth],
    parameters: [...pathParams, ...queryParams, ...idempotency],
    ...(op.body
      ? {
          requestBody: {
            required: op.body.required ?? true,
            content: {
              [op.multipart ? "multipart/form-data" : "application/json"]: {
                schema: op.body.schema,
                ...(op.body.example !== undefined ? { example: op.body.example } : {}),
              },
            },
          },
        }
      : {}),
    responses,
  };
}

export function buildOpenApiDocument(options: { includeInternal: boolean }): Record<string, unknown> {
  const operations = API_OPERATIONS.filter((op) => options.includeInternal || !op.internal);

  const paths: Record<string, Record<string, unknown>> = {};
  for (const op of operations) {
    const path = toOpenApiPath(op.path);
    paths[path] = { ...paths[path], [op.method]: buildOperation(op) };
  }

  return {
    openapi: "3.0.3",
    info: { title: "FilsPay API", version: "1.0.0", description: DESCRIPTION },
    servers: [{ url: "/" }],
    tags: [...new Set(operations.map((op) => op.tag))].map((name) => ({ name })),
    paths,
    components: {
      schemas: SCHEMAS,
      securitySchemes: {
        merchantSession: {
          type: "apiKey",
          in: "cookie",
          name: "fp_sid",
          description: "Set by POST /v1/auth/login and promoted by POST /v1/auth/otp/verify.",
        },
        adminSession: {
          type: "apiKey",
          in: "cookie",
          name: "fp_admin_sid",
          description: "Set by POST /v1/admin/auth/login and promoted by POST /v1/admin/auth/otp/verify.",
        },
        apiKey: { type: "http", scheme: "bearer", description: "A merchant API key." },
        acquirerSignature: {
          type: "apiKey",
          in: "header",
          name: "Acquirer-Callback-Signature",
          description: "t=<unix seconds>,v1=<hex HMAC>.",
        },
      },
    },
  };
}
