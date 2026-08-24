"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { prisma, type Species, type Gender, type ListingStatus, type ListingPriceType, type LoadType, type ListingTier } from "@livestock/db";
import { estimateRouteMiles } from "@livestock/shared";
import { getDemoUser, demoWindowsFromCookie } from "../../lib/demoAuth";
import { isDemoMode } from "../../lib/auth";
import { getPlatformSettings } from "../../lib/platformSettings";
import { assertFinancingEligible, financeEscrow } from "../../lib/financing";

export interface ListingActionResult {
  ok: boolean;
  error?: string;
  listingId?: string;
}

function centsFromDollars(dollars: string | null): number | null {
  if (!dollars) return null;
  const parsed = Number.parseFloat(dollars);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100);
}

export async function createListingAction(formData: FormData): Promise<ListingActionResult | void> {
  try {
    const user = await getDemoUser();
    const priceType = (formData.get("priceType")?.toString() ?? "PER_POUND") as ListingPriceType;
    const loadType = (formData.get("loadType")?.toString() ?? "FULL_LOAD") as LoadType;
    const tier = (formData.get("tier")?.toString() ?? "COMMERCIAL") as ListingTier;
    const headCount = Number(formData.get("headCount"));
    if (!headCount || headCount <= 0) {
      return { ok: false, error: "Head count must be at least 1" };
    }
    const avgWeightLbs = Number(formData.get("avgWeightLbs"));
    if (!avgWeightLbs || avgWeightLbs <= 0) {
      return { ok: false, error: "Average weight must be positive" };
    }

    let pricePerLbCents: number | null = null;
    let pricePerHeadCents: number | null = null;
    if (priceType === "PER_POUND") {
      pricePerLbCents = centsFromDollars(formData.get("pricePerLb")?.toString() ?? null);
      if (pricePerLbCents === null || pricePerLbCents <= 0) {
        return { ok: false, error: "Price per lb must be a positive dollar amount" };
      }
    } else {
      pricePerHeadCents = centsFromDollars(formData.get("pricePerHead")?.toString() ?? null);
      if (pricePerHeadCents === null || pricePerHeadCents <= 0) {
        return { ok: false, error: "Price per head must be a positive dollar amount" };
      }
      // Derive the equivalent per-lb price (micro-rounding) so marketplace
      // sorting and the escrow contract math stay consistent.
      pricePerLbCents = Math.round((pricePerHeadCents * 100) / avgWeightLbs);
    }

    const listing = await prisma.listing.create({
      data: {
        sellerId: user.id,
        species: (formData.get("species")?.toString() ?? "CATTLE") as Species,
        breed: formData.get("breed")?.toString() ?? "",
        headCount,
        avgWeightLbs,
        priceType,
        pricePerLbCents,
        pricePerHeadCents,
        loadType,
        tier,
        description: formData.get("description")?.toString() ?? "",
        location: formData.get("location")?.toString() ?? "",
        zipCode: formData.get("zipCode")?.toString() || null,
        gender: (formData.get("gender")?.toString() || null) as Gender | null,
        ageRange: formData.get("ageRange")?.toString() || null,
        healthStatus: formData.get("healthStatus")?.toString() || null,
        origin: formData.get("origin")?.toString() || null,
        registry: formData.get("registry")?.toString() || null,
        listingClass: formData.get("listingClass")?.toString() || null,
        subclass: formData.get("subclass")?.toString() || null,
        husbandry: formData.get("husbandry")?.toString() || null,
        frame: formData.get("frame")?.toString() || null,
        vaccines: formData.get("vaccines")?.toString() || null,
        condition: formData.get("condition")?.toString() || null,
        fertility: formData.get("fertility")?.toString() || null,
        registryType: formData.get("registryType")?.toString() || null,
        birthWeightLbs: (() => {
          const raw = formData.get("birthWeightLbs")?.toString();
          const n = raw ? Number(raw) : NaN;
          return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
        })(),
        imageUrl: formData.get("imageUrl")?.toString() || null,
      },
    });
    revalidatePath("/marketplace");
    revalidatePath("/seller");
    redirect(`/marketplace/${listing.id}`);
  } catch (err) {
    if (err instanceof Error && "digest" in err && (err as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) {
      throw err;
    }
    return { ok: false, error: (err as Error).message };
  }
}

export async function updateListingStatusAction(listingId: string, status: ListingStatus): Promise<ListingActionResult> {
  try {
    const user = await getDemoUser();
    await prisma.listing.update({
      where: { id: listingId, sellerId: user.id },
      data: { status },
    });
    revalidatePath("/marketplace");
    revalidatePath("/seller");
    revalidatePath(`/marketplace/${listingId}`);
    return { ok: true, listingId };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function createEscrowFromListingAction(
  listingId: string,
  financed = false,
): Promise<ListingActionResult> {
  try {
    const buyer = await getDemoUser();
    const listing = await prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing || listing.status !== "ACTIVE") return { ok: false, error: "Listing is not available" };

    // Sale amount honors the listing's pricing unit: per-head lots price by
    // head count; per-pound lots price by contracted weight. This is exact,
    // not derived from the rounded per-lb value.
    const saleAmountCents =
      listing.priceType === "PER_HEAD" && listing.pricePerHeadCents
        ? listing.pricePerHeadCents * listing.headCount
        : listing.pricePerLbCents * listing.avgWeightLbs * listing.headCount;

    // Check financing eligibility BEFORE creating anything, so a failed
    // financing choice never leaves the listing marked SOLD.
    if (financed) {
      const eligibilityError = await assertFinancingEligible({
        buyerId: buyer.id,
        saleAmountCents,
      });
      if (eligibilityError) return { ok: false, error: eligibilityError };
    }

    // Assign a carrier. Prefer a hauler other than the demo role user so the
    // load board accept flow has a visible reassignment to demonstrate.
    const hauler =
      (await prisma.user.findFirst({ where: { role: "HAULER", email: { not: "demo.hauler@livestock.local" } } })) ??
      (await prisma.user.findFirst({ where: { role: "HAULER" } }));
    if (!hauler) return { ok: false, error: "No hauler available" };

    const platform = await getPlatformSettings();
    const freightFeeCents = Math.round((saleAmountCents * platform.freightFeePct) / 100);
    const platformFeeBps = platform.platformFeeBps;

    const tm = new (await import("@livestock/domain")).TransactionManager();
    const escrow = await tm.createDraft({
      buyerId: buyer.id,
      sellerId: listing.sellerId,
      haulerId: hauler.id,
      saleAmountCents,
      contractedWeightLbs: listing.avgWeightLbs * listing.headCount,
      weightTolerancePct: platform.weightTolerancePct,
      freightFeeCents,
      platformFeeBps,
    });

    // Mark listing as sold
    await prisma.listing.update({
      where: { id: listingId },
      data: { status: "SOLD" },
    });

    // Open a transport load on the load board for this escrow's freight. The
    // destination is the buyer's delivery point — estimate the haul distance
    // (haversine over embedded demo-city coordinates, 180 mi fallback) so the
    // load counts toward the hauler's miles hauled.
    const loadDestination = `Delivery to ${buyer.name}`;
    const loadMiles = estimateRouteMiles(listing.location, loadDestination);
    await prisma.load.create({
      data: {
        escrowId: escrow.id,
        origin: listing.location,
        destination: loadDestination,
        distanceMiles: loadMiles,
        loadType: listing.loadType,
        marketplace: listing.marketplace,
        species: listing.species,
        headCount: listing.headCount,
        totalWeightLbs: listing.avgWeightLbs * listing.headCount,
        freightPayCents: freightFeeCents,
        posterId: listing.sellerId,
        status: "OPEN",
      },
    });

    if (financed) {
      // Deferred payment: stamp the financing terms and let the deadline job
      // auto-cancel if the buyer never funds.
      const res = await financeEscrow(escrow.id, buyer.id);
      if (!res.ok) {
        await prisma.listing.update({ where: { id: listingId }, data: { status: "ACTIVE" } });
        await prisma.load.deleteMany({ where: { escrowId: escrow.id } });
        return { ok: false, error: res.error };
      }
    } else {
      // Auto-fund the escrow: ledger-only fund via the transaction manager.
      await tm.fund(escrow.id, { actor: "BUYER", userId: buyer.id });
    }

    revalidatePath("/marketplace");
    revalidatePath("/seller");
    revalidatePath("/escrows");
    revalidatePath("/loads");
    redirect(`/escrows/${escrow.id}`);
  } catch (err) {
    if (err instanceof Error && "digest" in err && (err as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) {
      throw err;
    }
    return { ok: false, error: (err as Error).message };
  }
}

export async function acceptLoadAction(loadId: string): Promise<ListingActionResult> {
  try {
    const user = await getDemoUser();
    if (user.role !== "HAULER") return { ok: false, error: "Only haulers can accept loads" };
    const load = await prisma.load.findUnique({ where: { id: loadId } });
    if (!load) return { ok: false, error: "Load not found" };
    if (load.status !== "OPEN") return { ok: false, error: "Load is no longer open" };

    // Bind the accepting hauler to the load. Sale-derived loads also reassign the
    // escrow's carrier so the freight payout settles to the hauler who runs it;
    // standalone freight jobs have no escrow to update.
    await prisma.$transaction([
      prisma.load.update({
        where: { id: loadId },
        data: { haulerId: user.id, status: "ASSIGNED", acceptedAt: new Date() },
      }),
      ...(load.escrowId
        ? [
            prisma.escrowTransaction.update({
              where: { id: load.escrowId },
              data: { haulerId: user.id },
            }),
          ]
        : []),
    ]);

    revalidatePath("/loads");
    revalidatePath("/escrows");
    revalidatePath(`/escrows/${load.escrowId}`);
    return { ok: true, listingId: loadId };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function createFreightLoadAction(formData: FormData): Promise<ListingActionResult | void> {
  try {
    const user = await getDemoUser();
    if (user.role !== "SELLER") {
      return { ok: false, error: "Only sellers can post freight loads" };
    }
    const origin = formData.get("origin")?.toString().trim() ?? "";
    const destination = formData.get("destination")?.toString().trim() ?? "";
    if (!origin || !destination) {
      return { ok: false, error: "Origin and destination are required" };
    }
    const headCount = Number(formData.get("headCount"));
    if (!headCount || headCount <= 0) {
      return { ok: false, error: "Head count must be at least 1" };
    }
    const totalWeightLbs = Number(formData.get("totalWeightLbs"));
    if (!totalWeightLbs || totalWeightLbs <= 0) {
      return { ok: false, error: "Total weight must be positive" };
    }
    const freightCents = centsFromDollars(formData.get("freightPay")?.toString() ?? null);
    if (freightCents === null || freightCents <= 0) {
      return { ok: false, error: "Freight pay must be a positive dollar amount" };
    }
    const distanceRaw = Number(formData.get("distanceMiles"));
    const distanceMiles = Number.isFinite(distanceRaw) && distanceRaw > 0 ? Math.round(distanceRaw) : null;
    // Optional deliver-by deadline — feeds the hauler on-time rate.
    const dueRaw = formData.get("dueAt")?.toString() ?? "";
    const dueAt = dueRaw && !Number.isNaN(Date.parse(dueRaw)) ? new Date(dueRaw) : null;

    const load = await prisma.load.create({
      data: {
        origin,
        destination,
        distanceMiles,
        loadType: (formData.get("loadType")?.toString() ?? "FULL_LOAD") as LoadType,
        species: (formData.get("species")?.toString() ?? "CATTLE") as Species,
        headCount,
        totalWeightLbs,
        freightPayCents: freightCents,
        marketplace: "LIVE",
        status: "OPEN",
        posterId: user.id,
        dueAt,
      },
    });
    revalidatePath("/loads");
    redirect("/loads");
  } catch (err) {
    if (err instanceof Error && "digest" in err && (err as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) {
      throw err;
    }
    return { ok: false, error: (err as Error).message };
  }
}

/**
 * Demo helper: fund the escrow behind a load so the sale-side state machine
 * advances when the hauler marks the load picked up / delivered. Any role can
 * click this in the demo console; the escrow's own guards still apply (DRAFT ->
 * FUNDED allows BUYER / PLATFORM / SYSTEM_ARBITER, so we act as PLATFORM).
 */
export async function demoFundEscrowAction(loadId: string): Promise<ListingActionResult> {
  try {
    const user = await getDemoUser();
    const load = await prisma.load.findUnique({ where: { id: loadId } });
    if (!load || !load.escrowId) return { ok: false, error: "Load has no escrow to fund" };
    const escrow = await prisma.escrowTransaction.findUnique({ where: { id: load.escrowId } });
    if (escrow?.status !== "DRAFT") return { ok: false, error: "Escrow is not in DRAFT" };
    const tm = new (await import("@livestock/domain")).TransactionManager();
    await tm.fund(load.escrowId, { actor: "PLATFORM", userId: user.id });
    revalidatePath("/loads");
    revalidatePath(`/escrows/${load.escrowId}`);
    return { ok: true, listingId: loadId };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/**
 * Hauler drives an accepted load through pickup and delivery. The Load is the
 * source of truth for transport; when the load belongs to an escrow that is
 * funded, the same transition is mirrored onto the escrow state machine so the
 * 24h inspection window (and its BullMQ auto-release job) starts from the
 * hauler's delivery confirmation.
 */
export async function updateLoadStatusAction(loadId: string, nextStatus: "IN_TRANSIT" | "COMPLETED"): Promise<ListingActionResult> {
  try {
    const user = await getDemoUser();
    if (user.role !== "HAULER") return { ok: false, error: "Only haulers can update loads" };
    const load = await prisma.load.findUnique({ where: { id: loadId } });
    if (!load) return { ok: false, error: "Load not found" };
    if (load.haulerId !== user.id) return { ok: false, error: "This load is assigned to another hauler" };

    const allowed: Record<string, "IN_TRANSIT" | "COMPLETED"> = {
      ASSIGNED: "IN_TRANSIT",
      IN_TRANSIT: "COMPLETED",
    };
    if (allowed[load.status] !== nextStatus) {
      return { ok: false, error: `Cannot move load from ${load.status} to ${nextStatus}` };
    }

    await prisma.load.update({
      where: { id: loadId },
      data: {
        status: nextStatus,
        ...(nextStatus === "COMPLETED" ? { completedAt: new Date() } : {}),
      },
    });

    // Mirror onto the escrow machine when the sale side is ready. Escrows that
    // are still DRAFT (not funded) are left for the escrow lifecycle to catch
    // up — the transport record stays authoritative.
    if (load.escrowId && nextStatus === "IN_TRANSIT") {
      const escrow = await prisma.escrowTransaction.findUnique({ where: { id: load.escrowId } });
      if (escrow?.status === "FUNDED") {
        const tm = new (await import("@livestock/domain")).TransactionManager();
        await tm.markInTransit(load.escrowId, { actor: "HAULER", userId: user.id });
      }
    }
    if (load.escrowId && nextStatus === "COMPLETED") {
      const escrow = await prisma.escrowTransaction.findUnique({ where: { id: load.escrowId } });
      if (escrow?.status === "FUNDED" || escrow?.status === "IN_TRANSIT") {
        const { inspectionWindowMs } = isDemoMode()
          ? demoWindowsFromCookie(await cookies())
          : await getPlatformSettings();
        const tm = new (await import("@livestock/domain")).TransactionManager();
        const updated = await tm.markDelivered(load.escrowId, { actor: "HAULER", userId: user.id }, { inspectionWindowMs });
        if (updated.inspectionDeadlineAt) {
          const { scheduleInspectionTimeout } = await import("@livestock/jobs");
          await scheduleInspectionTimeout(load.escrowId, updated.inspectionDeadlineAt).catch(() => undefined);
        }
      }
    }

    revalidatePath("/loads");
    if (load.escrowId) revalidatePath(`/escrows/${load.escrowId}`);
    return { ok: true, listingId: loadId };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}


export async function bidOnLoadAction(
  loadId: string,
  amountDollars: string,
): Promise<ListingActionResult> {
  try {
    const user = await getDemoUser();
    if (user.role !== "HAULER") return { ok: false, error: "Only haulers can bid on loads" };
    const load = await prisma.load.findUnique({ where: { id: loadId } });
    if (!load) return { ok: false, error: "Load not found" };
    if (load.status !== "OPEN") return { ok: false, error: "Load is no longer open" };

    const amountCents = centsFromDollars(amountDollars);
    if (!amountCents || amountCents <= 0) {
      return { ok: false, error: "Bid amount must be positive" };
    }
    if (amountCents > load.freightPayCents) {
      return { ok: false, error: "Bid cannot exceed the posted freight pay" };
    }

    // One bid per hauler per load — upsert overwrites any previous bid.
    await prisma.loadBid.upsert({
      where: { loadId_haulerId: { loadId, haulerId: user.id } },
      create: { loadId, haulerId: user.id, amountCents, status: "PENDING" },
      update: { amountCents, status: "PENDING", updatedAt: new Date() },
    });

    revalidatePath("/loads");
    return { ok: true, listingId: loadId };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function acceptBidAction(bidId: string): Promise<ListingActionResult> {
  try {
    const user = await getDemoUser();
    if (user.role !== "SELLER") return { ok: false, error: "Only sellers can accept bids" };

    const bid = await prisma.loadBid.findUnique({
      where: { id: bidId },
      include: { load: true },
    });
    if (!bid) return { ok: false, error: "Bid not found" };
    if (bid.status !== "PENDING") return { ok: false, error: "This bid is no longer pending" };
    if (bid.load.status !== "OPEN") return { ok: false, error: "Load is no longer open" };
    if (bid.load.posterId !== user.id) return { ok: false, error: "You did not post this load" };

    // Accept: assign hauler + update freight pay to bid amount. Reject siblings.
    await prisma.$transaction([
      prisma.load.update({
        where: { id: bid.loadId },
        data: {
          haulerId: bid.haulerId,
          status: "ASSIGNED",
          acceptedAt: new Date(),
          freightPayCents: bid.amountCents,
        },
      }),
      prisma.loadBid.update({
        where: { id: bidId },
        data: { status: "ACCEPTED" },
      }),
      prisma.loadBid.updateMany({
        where: { loadId: bid.loadId, id: { not: bidId }, status: "PENDING" },
        data: { status: "REJECTED" },
      }),
      // Reassign escrow carrier if this load is linked to an escrow
      ...(bid.load.escrowId
        ? [
            prisma.escrowTransaction.update({
              where: { id: bid.load.escrowId },
              data: { haulerId: bid.haulerId },
            }),
          ]
        : []),
    ]);

    revalidatePath("/loads");
    if (bid.load.escrowId) revalidatePath(`/escrows/${bid.load.escrowId}`);
    return { ok: true, listingId: bid.loadId };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
