import sharp from "sharp";
import type { DetectedFileType } from "./fileSignature.js";
import { TooManyRequestsError, UnprocessableEntityError } from "../lib/errors.js";

/**
 * Longest side, in pixels.
 */
const THUMBNAIL_MAX_DIMENSION_PX = 320;
// At most 16 MB of RGBA source pixels per decode, before decoder overhead.
export const KYC_MAX_INPUT_PIXELS = 4_000_000;
let activeDecodes = 0;

export interface GeneratedThumbnail {
  buffer: Buffer;
  mimeType: string;
}

/**
 * Generates a review-UI-sized thumbnail from an already-validated upload
 * buffer. Only `jpeg`/`png` documents get one — a `pdf` (commercial
 * registration, bank letter) has no image to thumbnail, and this returns
 * `null` rather than attempting a PDF-to-image conversion. Always
 * re-encodes to JPEG regardless of the source format, so the admin
 * console's `<img>` tag never needs to branch on thumbnail mime type the
 * way the original-file endpoint does.
 */
export async function generateKycThumbnail(
  buffer: Buffer,
  detectedType: DetectedFileType,
): Promise<GeneratedThumbnail | null> {
  if (detectedType !== "jpeg" && detectedType !== "png") {
    return null;
  }
  if (activeDecodes >= 2) throw new TooManyRequestsError("kyc_decoder_busy");
  activeDecodes++;
  try {
    const resized = await sharp(buffer, { limitInputPixels: KYC_MAX_INPUT_PIXELS, sequentialRead: true })
      .resize(THUMBNAIL_MAX_DIMENSION_PX, THUMBNAIL_MAX_DIMENSION_PX, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 70 })
      .toBuffer();
    return { buffer: resized, mimeType: "image/jpeg" };
  } catch {
    throw new UnprocessableEntityError("invalid_image", "Image is invalid or exceeds the 4 megapixel budget");
  } finally {
    activeDecodes--;
  }
}
