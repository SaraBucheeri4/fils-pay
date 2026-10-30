import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

const blockedV4 = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24],
  ["192.88.99.0", 24],
  ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) blockedV4.addSubnet(address, prefix);
const publicV6 = new BlockList();
publicV6.addSubnet("2000::", 3, "ipv6");
const blockedV6 = new BlockList();
blockedV6.addSubnet("2001::", 23, "ipv6");
blockedV6.addSubnet("2001:db8::", 32, "ipv6");
blockedV6.addSubnet("2002::", 16, "ipv6");
blockedV6.addSubnet("3fff::", 20, "ipv6");

export function isPublicWebhookAddress(address: string): boolean {
  if (isIP(address) === 4) return !blockedV4.check(address);
  return isIP(address) === 6 && publicV6.check(address, "ipv6") && !blockedV6.check(address, "ipv6");
}

export const WEBHOOK_MAX_RESPONSE_BYTES = 64 * 1024;

/**
 * The injectable HTTP send — `runDispatchPass` and everything it calls take
 * a `WebhookTransport` as an explicit parameter, never calling `fetch`
 * directly deep inside dispatch logic. Same "pass the effectful dependency
 * in" shape as `AcquirerSimulator`.
 */

/**
 * @property timeoutMs Covers the whole exchange including reading the body (the abort
 * signal stays armed until the body has been read).
 */
export interface WebhookTransportRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
  timeoutMs: number;
}

export interface WebhookTransportResponse {
  /** null when no completed transport response is available; a timeout
   *  does not prove the receiver never processed the request. */
  statusCode: number | null;
  /** "" on a transport-level failure */
  body: string;
  /** present iff statusCode is null */
  errorMessage?: string;
}

export type WebhookTransport = (req: WebhookTransportRequest) => Promise<WebhookTransportResponse>;

/** Public-address-only HTTP transport, with an exchange-wide abort deadline.
 * The legacy factory name is retained for callers. */
export function createFetchTransport(dependencies: {
  resolve?: (hostname: string) => Promise<Array<{ address: string; family: number }>>;
  request?: typeof httpRequest;
} = {}): WebhookTransport {
  return async (req: WebhookTransportRequest): Promise<WebhookTransportResponse> => {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), req.timeoutMs);
    try {
      const url = new URL(req.url);
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
        throw new Error("invalid webhook destination");
      }
      const hostname = url.hostname.replace(/^\[|\]$/g, "");
      const addresses = isIP(hostname)
        ? [{ address: hostname, family: isIP(hostname) }]
        : await Promise.race([
          dependencies.resolve ? dependencies.resolve(hostname) : lookup(hostname, { all: true }),
          new Promise<never>((_, reject) => controller.signal.addEventListener("abort", () => reject(new Error("webhook destination lookup timed out")), { once: true })),
        ]);
      if (controller.signal.aborted) throw new Error("webhook timeout");
      if (!addresses.length || addresses.some(({ address }) => !isPublicWebhookAddress(address))) {
        throw new Error("webhook destination must be a public address");
      }
      const address = addresses[0]!;
      // Connect to the validated address directly: DNS cannot change between
      // validation and connect. Keep the original Host/SNI for TLS validation.
      return await new Promise<WebhookTransportResponse>((resolve, reject) => {
        const send = dependencies.request ?? (url.protocol === "https:" ? httpsRequest : httpRequest);
        const request = send({
          protocol: url.protocol, hostname: address.address, family: address.family,
          port: url.port || undefined, path: url.pathname + url.search,
          servername: isIP(hostname) ? undefined : hostname,
          method: "POST", agent: false, signal: controller.signal,
          headers: { ...req.headers, Host: url.host, "Content-Length": Buffer.byteLength(req.body) },
        }, (response) => {
          // Native http does not follow redirects. Treat them as failures so
          // neither signatures nor network access can escape this validation.
          if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400) {
            response.destroy();
            reject(new Error("webhook destination redirects are forbidden"));
            return;
          }
          const chunks: Buffer[] = [];
          let size = 0;
          response.on("data", (chunk: Buffer) => {
            const remaining = WEBHOOK_MAX_RESPONSE_BYTES - size;
            if (chunk.length > remaining) {
              response.destroy();
              reject(new Error("webhook response exceeds byte limit"));
              return;
            }
            size += chunk.length;
            chunks.push(chunk);
          });
          response.on("error", reject);
          response.on("end", () => resolve({ statusCode: response.statusCode ?? null, body: Buffer.concat(chunks, size).toString("utf8") }));
        });
        request.on("error", reject);
        request.end(req.body);
      });
    } catch (err) {
      return {
        statusCode: null,
        body: "",
        errorMessage: err instanceof Error ? err.message : String(err),
      };
    } finally {
      clearTimeout(timeoutHandle);
    }
  };
}
