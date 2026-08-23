"use client";

import { useState, useRef, useTransition } from "react";
import { uploadListingMediaAction, removeListingMediaAction } from "../app/actions/media";

/* ─────────────────────────────────────────────────────────────────── */
interface DocEntry {
  id: string;
  fileName: string;
  url: string;
  kind: string;
}

interface Props {
  listingId: string;
  isOwner: boolean;
  galleryUrls: string[];
  documents: DocEntry[];
}

/* ─────────────────────────────────────────────────────────────────── */

const DOC_KINDS: Array<{ value: string; label: string }> = [
  { value: "HEALTH_CERT", label: "Health certificate" },
  { value: "VET_RECORD", label: "Vet record" },
  { value: "SCALE_TICKET", label: "Scale ticket" },
  { value: "REGISTRATION", label: "Registration" },
  { value: "PROOF_OF_ORIGIN", label: "Proof of origin" },
  { value: "OTHER", label: "Other" },
];

export function ListingMediaManager({ listingId, isOwner, galleryUrls, documents }: Props) {
  const photoRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);

  /* ── Upload photos ─────────────────────────────────────────────── */
  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    startTransition(async () => {
      const fd = new FormData();
      files.forEach((f) => fd.append("photos", f));
      const res = await uploadListingMediaAction(listingId, fd);
      setFeedback(res.ok ? `${files.length} photo(s) uploaded.` : (res.error ?? "Upload failed"));
    });
  }

  function handleRemovePhoto(url: string) {
    startTransition(async () => {
      const res = await removeListingMediaAction(listingId, "photo", url);
      setFeedback(res.ok ? "Photo removed." : res.error ?? "Failed");
    });
  }

  /* ── Upload documents ──────────────────────────────────────────── */
  function handleDocChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    startTransition(async () => {
      const fd = new FormData();
      // Each file gets a matching kind entry so the action can label them.
      files.forEach((f) => {
        fd.append("documents", f);
        fd.append("docKind", "OTHER");
      });
      const res = await uploadListingMediaAction(listingId, fd);
      setFeedback(res.ok ? `${files.length} document(s) uploaded.` : (res.error ?? "Upload failed"));
    });
  }

  function handleRemoveDoc(url: string) {
    startTransition(async () => {
      const res = await removeListingMediaAction(listingId, "document", url);
      setFeedback(res.ok ? "Document removed." : res.error ?? "Failed");
    });
  }

  /* ─────────────────────────────────────────────────────────────────── */
  if (!isOwner && galleryUrls.length === 0 && documents.length === 0) return null;

  return (
    <>
      {/* ── Feedback toast ─────────────────────────────────────────── */}
      {feedback && (
        <div className="animate-fade-in rounded-xl border border-hay-500/30 bg-hay-500/10 px-4 py-2.5 text-sm">
          <span className="text-hay-200">{feedback}</span>
          <button
            className="ml-3 text-xs underline text-cream-400 hover:text-cream-200"
            onClick={() => setFeedback(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── Owner upload panel ─────────────────────────────────────── */}
      {isOwner && (
        <section className="card card-pad">
          <h2 className="flex items-center gap-2 font-display text-base font-semibold text-cream-50">
            <span className="h-2 w-2 rounded-full bg-hay-400" />
            Manage photos &amp; documents
          </h2>
          <p className="mt-1 text-xs text-cream-500">
            Upload photos to make your listing stand out. Upload documents like health certificates and scale tickets.
          </p>

          <div className="mt-4 flex flex-wrap gap-3">
            {/* ── Photo upload ─────────────────────────────────── */}
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-dirt-500 bg-dirt-800/40 px-4 py-3 text-sm font-medium text-cream-200 hover:border-hay-400/60 hover:bg-dirt-800/70 transition-colors">
              <span className="text-lg">📷</span>
              Add photos
              <input
                ref={photoRef}
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                onChange={handlePhotoChange}
                disabled={isPending}
              />
            </label>

            {/* ── Document upload ──────────────────────────────── */}
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-dirt-500 bg-dirt-800/40 px-4 py-3 text-sm font-medium text-cream-200 hover:border-denim-400/60 hover:bg-dirt-800/70 transition-colors">
              <span className="text-lg">📄</span>
              Add documents
              <input
                ref={docRef}
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png,.webp,.txt,.csv"
                className="hidden"
                onChange={handleDocChange}
                disabled={isPending}
              />
            </label>

            {isPending && <span className="flex items-center gap-1 text-sm text-cream-400">⏳ Uploading…</span>}
          </div>
        </section>
      )}

      {/* ── Photo gallery (visible to everyone) ─────────────────────── */}
      {galleryUrls.length > 0 && (
        <section className="card card-pad">
          <h2 className="flex items-center gap-2 font-display text-base font-semibold text-cream-50">
            <span className="h-2 w-2 rounded-full bg-hay-400" />
            Photos
          </h2>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {galleryUrls.map((url) => (
              <div key={url} className="group relative overflow-hidden rounded-xl border border-dirt-600 bg-dirt-800/50">
                <img
                  src={url}
                  alt=""
                  className="h-32 w-full object-cover transition-transform duration-300 group-hover:scale-105 sm:h-40"
                />
                {isOwner && (
                  <button
                    type="button"
                    onClick={() => handleRemovePhoto(url)}
                    disabled={isPending}
                    className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-barn-500/85 text-xs text-on-color opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100"
                    title="Remove photo"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Documents list (visible to everyone) ────────────────────── */}
      {documents.length > 0 && (
        <section className="card card-pad">
          <h2 className="flex items-center gap-2 font-display text-base font-semibold text-cream-50">
            <span className="h-2 w-2 rounded-full bg-denim-400" />
            Documents
          </h2>
          <div className="mt-4 divide-y divide-dirt-700/50">
            {documents.map((doc) => {
              const kindLabel = DOC_KINDS.find((k) => k.value === doc.kind)?.label ?? doc.kind;
              return (
                <div key={doc.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-cream-100 truncate">{doc.fileName}</p>
                    <p className="text-xs text-cream-500">{kindLabel}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <a
                      href={doc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg border border-denim-400/30 bg-denim-500/10 px-3 py-1 text-xs font-medium text-denim-200 hover:bg-denim-500/20 transition-colors"
                    >
                      View
                    </a>
                    {isOwner && (
                      <button
                        type="button"
                        onClick={() => handleRemoveDoc(doc.url)}
                        disabled={isPending}
                        className="rounded-lg border border-barn-400/30 bg-barn-500/10 px-3 py-1 text-xs font-medium text-barn-200 hover:bg-barn-500/20 transition-colors"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}