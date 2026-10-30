import { API_OPERATIONS, type ApiOperation } from "./openapi.js";

const SCHEMA_URL = "https://schema.getpostman.com/json/collection/v2.1.0/collection.json";

/** Collection variables with a useful default. Everything else a request
 *  references is added empty, and login or create requests fill it in. */
const VARIABLE_DEFAULTS: Record<string, string> = {
  baseUrl: "http://localhost:3000",
  email: "",
  password: "",
  adminEmail: "",
  adminPassword: "",
  merchantId: "",
  apiKey: "",
};

const DESCRIPTION = `FilsPay API, generated from the OpenAPI spec (apps/api/src/docs/openapi.ts). Do not edit by hand: run \`npm run postman\`.

## Quickstart
1. Set \`baseUrl\`, \`merchantId\`, \`email\` and \`password\` in the collection variables. Use a local stack, not production.
2. Run **Merchant auth > Step 1: password**, then **Step 2: OTP**. Outside production the OTP is captured for you; otherwise paste the emailed code into \`otpCode\`.
3. Run **API keys > Issue an API key**. The key is stored in \`apiKey\`.
4. Run **Transactions > Authorize a payment**, then **Capture**. Each request stores the ids the next one needs.

List requests store the first row's id, so run a list before a request that needs that id. **Log out** ends the session the later folders use, so skip it when running a whole folder. Sessions use Postman's cookie jar, so allow cookies for your \`baseUrl\`. Admin requests need \`adminEmail\` and \`adminPassword\`, then **Admin auth**.

Requests under **Admin finance** can move money. Read each description before sending.`;

interface PostmanItem {
  name: string;
  request: Record<string, unknown>;
  event: Array<Record<string, unknown>>;
  response: unknown[];
}

const toVariable = (name: string): string => `{{${name}}}`;

function pathVariable(op: ApiOperation, param: string): string {
  return op.pathVars?.[param] ?? param;
}

function buildUrl(op: ApiOperation): Record<string, unknown> {
  const path = op.path
    .split("/")
    .filter(Boolean)
    .map((segment) => (segment.startsWith(":") ? toVariable(pathVariable(op, segment.slice(1))) : segment));
  const query = (op.query ?? []).map((param) => ({
    key: param.name,
    value: param.example ?? "",
    ...(param.description ? { description: param.description } : {}),
    disabled: !param.required,
  }));
  const enabled = query.filter((param) => !param.disabled);
  const raw = `{{baseUrl}}/${path.join("/")}${
    enabled.length > 0 ? `?${enabled.map((param) => `${param.key}=${param.value}`).join("&")}` : ""
  }`;
  return { raw, host: ["{{baseUrl}}"], path, ...(query.length > 0 ? { query } : {}) };
}

function buildBody(op: ApiOperation): Record<string, unknown> | undefined {
  if (!op.body) return undefined;
  if (op.multipart) {
    return {
      mode: "formdata",
      formdata: [
        { key: "documentType", value: "commercial_registration", type: "text" },
        { key: "file", type: "file", src: [] },
      ],
    };
  }
  return {
    mode: "raw",
    raw: JSON.stringify(op.body.example ?? {}, null, 2),
    options: { raw: { language: "json" } },
  };
}

/** Bearer {{apiKey}} on routes that accept a key. A session cookie, when there
 *  is one, wins over it on the server, so it is safe to leave set. */
function buildAuth(op: ApiOperation): Record<string, unknown> {
  if (op.auth !== "apiKey" && op.auth !== "merchant") return { type: "noauth" };
  return { type: "bearer", bearer: [{ key: "token", value: "{{apiKey}}", type: "string" }] };
}

function buildTestScript(op: ApiOperation): string[] {
  const lines = [
    `pm.test("responds ${op.ok.status}", () => pm.response.to.have.status(${op.ok.status}));`,
  ];
  const captures = Object.entries(op.captures ?? {});
  if (captures.length > 0) {
    lines.push(
      "if (pm.response.code >= 200 && pm.response.code < 300) {",
      "  const body = pm.response.json();",
      '  const read = (path) => path.split(".").reduce((value, key) => (value == null ? value : value[key]), body);',
      ...captures.map(
        ([field, variable]) =>
          `  if (read(${JSON.stringify(field)}) !== undefined) pm.collectionVariables.set(${JSON.stringify(variable)}, read(${JSON.stringify(field)}));`,
      ),
      "}",
    );
  }
  return lines;
}

function buildItem(op: ApiOperation): PostmanItem {
  const headers = [
    ...(op.idempotencyKey ? [{ key: "Idempotency-Key", value: "{{$guid}}", description: "New on each send. Fix the value to test a retry." }] : []),
    ...(op.body && !op.multipart ? [{ key: "Content-Type", value: "application/json" }] : []),
  ];
  const body = buildBody(op);
  const roles = op.roles ? `Roles: ${op.roles.join(", ")}.` : "";

  return {
    name: op.summary,
    request: {
      method: op.method.toUpperCase(),
      auth: buildAuth(op),
      header: headers,
      url: buildUrl(op),
      ...(body ? { body } : {}),
      description: [op.description, roles].filter(Boolean).join("\n\n"),
    },
    event: [{ listen: "test", script: { type: "text/javascript", exec: buildTestScript(op) } }],
    response: [],
  };
}

/** Finds every {{variable}} a request uses, so none is left undeclared. */
function collectVariables(ops: readonly ApiOperation[]): string[] {
  const found = new Set<string>(Object.keys(VARIABLE_DEFAULTS));
  for (const op of ops) {
    for (const param of op.path.matchAll(/:([A-Za-z]+)/g)) found.add(pathVariable(op, param[1]!));
    for (const variable of Object.values(op.captures ?? {})) found.add(variable);
    const text = JSON.stringify(op.body?.example ?? null) + JSON.stringify(op.query ?? null);
    for (const match of text.matchAll(/\{\{([A-Za-z]+)\}\}/g)) found.add(match[1]!);
  }
  return [...found];
}

/** A Postman v2.1 collection covering every route, with admin routes included. */
export function buildPostmanCollection(): Record<string, unknown> {
  const folders = new Map<string, PostmanItem[]>();
  for (const op of API_OPERATIONS) {
    folders.set(op.tag, [...(folders.get(op.tag) ?? []), buildItem(op)]);
  }

  return {
    info: {
      // Fixed so re-importing updates the collection instead of duplicating it.
      _postman_id: "6f0c5a52-3f0e-4c0d-9a39-0f1a5d7b2e11",
      name: "FilsPay API",
      description: DESCRIPTION,
      schema: SCHEMA_URL,
    },
    auth: { type: "noauth" },
    variable: collectVariables(API_OPERATIONS).map((key) => ({
      key,
      value: VARIABLE_DEFAULTS[key] ?? "",
      type: "string",
    })),
    item: [...folders].map(([name, item]) => ({ name, item })),
  };
}
