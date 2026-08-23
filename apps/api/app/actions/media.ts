"use server";

import { revalidatePath } from "next/cache";
import { prisma, type ListingDocumentKind } from "@livestock/db";
import { getDemoUser } from "../../lib/demoAuth";
import { deleteUploadedFile, isDocumentMime, isImageMime, saveUploadedFile } from "../../lib/uploads";

export interface MediaActionResult {
  ok: boolean;
  error?: string;
  galleryUrls?: string[];
  documents?: Array<{ id: string; fileName: string; url: string; kind: string }>;
}

/**
 * Attach seller-uploaded photos and documents to a listing. Photos append to
 * the listing gallery (the first photo also becomes the card image); documents
 * become ListingDocument rows with a kind label for the compliance layer.
 *
 * Ownership is enforced server-side: only the listing's seller can upload.
 */
export async function uploadListingMediaAction(
  listingId: string,
  formData: FormData,
): Promise<MediaActionResult> {
  try {
    const user = await getDemoUser();
    const listing = await prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) return { ok: false, error: "Listing not found" };
    if (listing.sellerId !== user.id) return { ok: false, error: "Only the listing seller can add media" };

    const photoFiles = formData.getAll("photos").filter((f): f is File => f instanceof File);
    const docFiles = formData.getAll("documents").filter((f): f is File => f instanceof File);
    const docKinds = formData
      .getAll("docKind")
      .map((k) => k.toString())
      .filter(Boolean);

    if (photoFiles.length === 0 && docFiles.length === 0) {
      return { ok: false, error: "No files selected" };
    }

    const savedPhotos: string[] = [];
    for (const file of photoFiles) {
      if (!isImageMime(file.type)) return { ok: false, error: `"${file.name}" is not a supported image type` };
      const saved = await saveUploadedFile(listingId, file, "photo");
      savedPhotos.push(saved.url);
    }

    const savedDocs: Array<{ id: string; fileName: string; url: string; kind: string }> = [];
    for (let i = 0; i < docFiles.length; i += 1) {
      const file = docFiles[i]!;
      if (!isDocumentMime(file.type)) {
        return { ok: false, error: `"${file.name}" is not a supported document type (PDF or image)` };
      }
      const saved = await saveUploadedFile(listingId, file, "doc");
      const kind = (docKinds[i] as ListingDocumentKind | undefined) ?? "OTHER";
      const row = await prisma.listingDocument.create({
        data: {
          listingId,
          kind,
          fileName: saved.fileName,
          url: saved.url,
          mimeType: saved.mimeType,
          sizeBytes: saved.sizeBytes,
        },
      });
      savedDocs.push({ id: row.id, fileName: row.fileName, url: row.url, kind: row.kind });
    }

    // Update the listing: first photo becomes the card image; all photos append
    // to the gallery (deduped).
    if (savedPhotos.length > 0) {
      const merged = Array.from(new Set([...listing.galleryUrls, ...savedPhotos]));
      await prisma.listing.update({
        where: { id: listingId },
        data: {
          galleryUrls: merged,
          imageUrl: listing.imageUrl ?? savedPhotos[0]!,
        },
      });
    }

    revalidatePath(`/marketplace/${listingId}`);
    revalidatePath("/marketplace");
    revalidatePath("/seller");
    return { ok: true, galleryUrls: savedPhotos, documents: savedDocs };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/**
 * Remove a photo or document from a listing. The file is deleted from disk and
 * the reference cleared from the listing (photo) or the row deleted (document).
 */
export async function removeListingMediaAction(
  listingId: string,
  kind: "photo" | "document",
  url: string,
): Promise<MediaActionResult> {
  try {
    const user = await getDemoUser();
    const listing = await prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) return { ok: false, error: "Listing not found" };
    if (listing.sellerId !== user.id) return { ok: false, error: "Only the listing seller can remove media" };

    if (kind === "photo") {
      const gallery = listing.galleryUrls.filter((u) => u !== url);
      const imageUrl = listing.imageUrl === url ? gallery[0] ?? null : listing.imageUrl;
      await prisma.listing.update({
        where: { id: listingId },
        data: { galleryUrls: gallery, imageUrl },
      });
      await deleteUploadedFile(url);
    } else {
      const doc = await prisma.listingDocument.findFirst({ where: { listingId, url } });
      if (doc) {
        await prisma.listingDocument.delete({ where: { id: doc.id } });
        await deleteUploadedFile(url);
      }
    }

    revalidatePath(`/marketplace/${listingId}`);
    revalidatePath("/marketplace");
    revalidatePath("/seller");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
