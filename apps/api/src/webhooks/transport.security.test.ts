import assert from "node:assert/strict";
import { test } from "node:test";
import { createFetchTransport } from "./transport.js";
import { WEBHOOK_MAX_RESPONSE_BYTES } from "./transport.js";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { request as httpRequest } from "node:http";

test("transport rejects internal and alternate encoded loopback destinations", async () => {
  const send = createFetchTransport();
  for (const url of ["http://127.0.0.1", "http://2130706433", "http://[::1]", "http://[::ffff:127.0.0.1]", "http://169.254.169.254", "http://10.0.0.1"]) {
    const result = await send({ url, headers: {}, body: "{}", timeoutMs: 100 });
    assert.equal(result.statusCode, null);
    assert.match(result.errorMessage!, /destination/i);
  }
});

function simulatedReceiver(status: number, bytes: number) {
  let requestedHost: unknown;
  let sends = 0;
  const request = ((options: { hostname: string }, callback: (response: PassThrough & { statusCode: number }) => void) => {
    sends++;
    requestedHost = options.hostname;
    const outgoing = new EventEmitter() as EventEmitter & { end: () => void };
    outgoing.end = () => {
      const response = Object.assign(new PassThrough(), { statusCode: status });
      callback(response);
      if (!response.destroyed) response.end(Buffer.alloc(bytes));
    };
    return outgoing;
  }) as unknown as typeof httpRequest;
  return { request, get host() { return requestedHost; }, get sends() { return sends; } };
}

test("DNS is pinned, mixed private answers fail, redirects never initiate another request, and body bytes are capped", async () => {
  const req = { url: "https://merchant.example/hook", headers: {}, body: "{}", timeoutMs: 1000 };
  for (const status of [200, 302]) {
    const receiver = simulatedReceiver(status, 2);
    const send = createFetchTransport({ resolve: async () => [{ address: "8.8.8.8", family: 4 }], request: receiver.request });
    const result = await send(req);
    assert.equal(receiver.host, "8.8.8.8");
    assert.equal(receiver.sends, 1);
    assert.equal(result.statusCode, status === 200 ? 200 : null);
    if (status === 302) assert.match(result.errorMessage!, /redirects/);
  }
  const receiver = simulatedReceiver(200, WEBHOOK_MAX_RESPONSE_BYTES + 1);
  const bounded = createFetchTransport({ resolve: async () => [{ address: "8.8.8.8", family: 4 }], request: receiver.request });
  assert.match((await bounded(req)).errorMessage!, /byte limit/);
  const mixed = createFetchTransport({ resolve: async () => [{ address: "8.8.8.8", family: 4 }, { address: "10.0.0.1", family: 4 }], request: receiver.request });
  assert.match((await mixed(req)).errorMessage!, /public address/);
  assert.equal(receiver.sends, 1);
});
