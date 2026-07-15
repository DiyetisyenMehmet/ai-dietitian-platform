/**
 * Allowed blood-test upload file types and content sniffing.
 *
 * A declared `Content-Type` from the client is untrustworthy, so acceptance is
 * decided by inspecting the actual leading bytes (magic numbers) of the buffer.
 * Only lab-report PDFs and common high-quality image formats are permitted.
 */

export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

/** Maps a detected mime type to a canonical file extension. */
export const MIME_EXTENSION: Record<AllowedMimeType, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Human-readable list for error messages. */
export const ALLOWED_TYPES_LABEL = "PDF, JPEG, PNG, WebP";

function startsWith(buffer: Buffer, bytes: number[], offset = 0): boolean {
  if (buffer.length < offset + bytes.length) return false;
  for (let i = 0; i < bytes.length; i += 1) {
    if (buffer[offset + i] !== bytes[i]) return false;
  }
  return true;
}

/**
 * Detects the true content type from a buffer's magic bytes, restricted to the
 * allowed set. Returns `null` when the content is not a recognized allowed
 * type (which callers treat as a rejected upload).
 */
export function detectAllowedMimeType(buffer: Buffer): AllowedMimeType | null {
  // PDF: "%PDF"
  if (startsWith(buffer, [0x25, 0x50, 0x44, 0x46])) return "application/pdf";
  // JPEG: FF D8 FF
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return "image/jpeg";
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  // WebP: "RIFF" .... "WEBP"
  if (startsWith(buffer, [0x52, 0x49, 0x46, 0x46]) && startsWith(buffer, [0x57, 0x45, 0x42, 0x50], 8)) {
    return "image/webp";
  }
  return null;
}
