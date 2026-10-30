import { deliverOtpEmail, type OtpDeliveryConfig } from "./otpEmail.js";

/**
 * Resend email delivery with an explicit dev/test fallback when unconfigured.
 */
/** Subset of the Fastify logger, so tests can pass a stub. */
export interface MinimalLogger {
  info: (obj: Record<string, unknown>, msg: string) => void;
}

export async function sendOtpCode(
  logger: MinimalLogger,
  config: OtpDeliveryConfig,
  recipient: { merchantUserId: string; email: string },
  code: string,
): Promise<void> {
  if (await deliverOtpEmail(config, recipient.email, code, false)) {
    logger.info({ merchantUserId: recipient.merchantUserId, channel: "otp" }, "otp email accepted");
  } else {
    logger.info(
      { merchantUserId: recipient.merchantUserId, channel: "otp", code },
      "otp code generated (dev)",
    );
  }
}
