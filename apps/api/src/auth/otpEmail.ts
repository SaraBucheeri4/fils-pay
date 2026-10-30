import type { Config } from "../config.js";
import { AppError } from "../lib/errors.js";

export type OtpDeliveryConfig = Pick<Config, "nodeEnv"> &
  Partial<Pick<Config, "resendApiKey" | "otpEmailFrom" | "otpEmailToOverride">>;

/** Resend REST contract: https://resend.com/docs/api-reference/emails/send-email */
export async function deliverOtpEmail(config: OtpDeliveryConfig, email: string, code: string, admin: boolean): Promise<boolean> {
  if (!config.resendApiKey) {
    if (config.nodeEnv === "production") throw new AppError(503, "otp_delivery_unavailable", "OTP email delivery is not configured");
    return false; // Explicit dev/test fallback; production never exposes a code.
  }
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: config.otpEmailFrom || "FilsPay <onboarding@resend.dev>",
        to: [config.otpEmailToOverride || email],
        subject: admin ? "FilsPay admin sign-in code" : "FilsPay merchant sign-in code",
        text: `Your FilsPay ${admin ? "admin" : "merchant"} sign-in code is: ${code}\n\nUse it before the expiry shown on the sign-in screen. If you did not request this code, ignore this email.`,
      }),
      signal: AbortSignal.timeout(10_000),
      redirect: "error",
    });
    await response.body?.cancel();
    if (!response.ok) throw new Error("Email provider rejected delivery");
    return true;
  } catch {
    // Never surface provider responses, authorization headers or OTP text.
    throw new AppError(503, "otp_delivery_failed", "Unable to send the sign-in code. Please try again.");
  }
}
