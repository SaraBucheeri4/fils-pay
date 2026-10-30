import assert from "node:assert/strict";
import { test } from "node:test";
import type { Pool } from "pg";
import type { Config } from "../config.js";
import { recordKycDocument } from "./kyc.js";

test("JPEG renamed to PDF is rejected before any file or database write", async () => {
  await assert.rejects(recordKycDocument({} as Pool, {} as Config, {
    merchantId: "unused", documentType: "commercial_registration", fileName: "registration.pdf",
    buffer: Buffer.from([255, 216, 255]), uploadedBy: "unused",
  }), (error: unknown) => error instanceof Error && error.message === "commercial_registration and bank_letter documents must be a PDF");
});
