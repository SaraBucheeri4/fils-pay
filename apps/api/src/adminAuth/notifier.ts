import { deliverOtpEmail, type OtpDeliveryConfig } from "../auth/otpEmail.js";
import type { MinimalLogger } from "../auth/notifier.js";

/**
 * Admin Resend email delivery, sharing the merchant delivery safeguards.
 */
export async function sendAdminOtpCode(
  logger: MinimalLogger,
  config: OtpDeliveryConfig,
  recipient: { adminUserId: string; email: string },
  code: string,
): Promise<void> {
  if (await deliverOtpEmail(config, recipient.email, code, true)) {
    logger.info({ adminUserId: recipient.adminUserId, channel: "admin_otp" }, "admin otp email accepted");
  } else {
    logger.info(
      { adminUserId: recipient.adminUserId, channel: "admin_otp", code },
      "admin otp code generated (dev)",
    );
  }
}
