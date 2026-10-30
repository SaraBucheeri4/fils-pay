import { request } from "./client.js";

export interface CaptureReview {
  id: string;
  merchantId: string;
  transactionId: string | null;
  amountFils: number;
  captureAttemptAt: string;
}

export function listCaptureReviews(offset: number) {
  return request<{ reviews: CaptureReview[] }>(`/v1/admin/payment-links/capture-reviews?limit=50&offset=${offset}`);
}

export function resolveCaptureReview(review: CaptureReview, resolution: "retry_capture" | "release", releaseEvidence?: string) {
  return request<{ status: string; outcome: string }>(
    `/v1/admin/merchants/${encodeURIComponent(review.merchantId)}/payment-links/${encodeURIComponent(review.id)}/capture-review`,
    { method: "POST", body: JSON.stringify({ resolution, releaseEvidence }) },
  );
}
