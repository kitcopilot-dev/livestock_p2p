import { mkdir, writeFile, unlink, stat } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

/**
 * Local disk storage for seller-uploaded listing media.
 *
 * Files land under `public/uploads/listings/<listingId>/` and are served
 * statically by Next.js at `/uploads/listings/<listingId>/...`. In production
 * this module is swapped for an object store (S3/R2) — the server action only
 * depends on the returned public URL, so the swap is contained here.
 */

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MB per file

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif", "image/svg+xml"]);
const DOC_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "text/plain", "text/csv", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]);

export function isImageMime(mime: string): boolean {
  return IMAGE_TYPES.has(mime.toLowerCase());
}

export function isDocumentMime(mime: string): boolean {
  return DOC_TYPES.has(mime.toLowerCase());
}

function safeFileName(name: string): string {
  const base = path.basename(name).replace(/[^\w.\- ]/g, "_").replace(/\s+/g, "-").slice(0, 80);
  return base || "file";
}

function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/heic": ".heic",
    "image/heif": ".heif",
    "image/svg+xml": ".svg",
    "application/pdf": ".pdf",
    "text/plain": ".txt",
    "text/csv": ".csv",
  };
  return map[mime.toLowerCase()] ?? "";
}

export function uploadsRoot(): string {
  return path.join(process.cwd(), "public", "uploads");
}

/** Persist an uploaded File to disk and return its public URL. */
export async function saveUploadedFile(
  listingId: string,
  file: File,
  prefix: string,
): Promise<{ url: string; fileName: string; mimeType: string; sizeBytes: number }> {
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.byteLength === 0) throw new Error("Uploaded file is empty");
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new Error("File exceeds the 15 MB upload limit");
  }

  const dir = path.join(uploadsRoot(), "listings", listingId);
  await mkdir(dir, { recursive: true });

  const ext = extFromMime(file.type) || path.extname(file.name);
  const fileName = `${prefix}-${Date.now()}-${randomUUID().slice(0, 8)}${ext}`;
  await writeFile(path.join(dir, fileName), bytes);

  return {
    url: `/uploads/listings/${listingId}/${fileName}`,
    fileName: safeFileName(file.name),
    mimeType: file.type,
    sizeBytes: bytes.byteLength,
  };
}

/** Delete a file on disk by its public URL. Never throws on missing files. */
export async function deleteUploadedFile(url: string): Promise<void> {
  if (!url.startsWith("/uploads/")) return;
  const abs = path.join(process.cwd(), "public", url.replace(/^\/+/, ""));
  try {
    await stat(abs);
    await unlink(abs);
  } catch {
    // already gone — fine
  }
}

/** Human-readable size helper for the document list. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
