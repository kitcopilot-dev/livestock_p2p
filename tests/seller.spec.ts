/**
 * Seller role video recording.
 * Covers US-S1 (view escrow details), US-S2 (receive settlement after inspection clears).
 *
 * Run: npx playwright test tests/seller.spec.ts --headed
 * Output: test-results/seller/
 */
import { test, expect } from "@playwright/test";
import { BASE, pause, loadPage, switchRole, snap } from "./helpers";

const DIR = "test-results/seller";

test.describe("Seller role walkthrough", () => {
  test("US-S1 → US-S2: view escrow, receive settlement", async ({ page }) => {
    test.setTimeout(300_000);

    // Start as Seller
    await switchRole(page, "Seller");

    // ── US-S1: View dashboard as seller ──────────────────────────────────
    await test.step("US-S1: Seller dashboard", async () => {
      await loadPage(page, `${BASE}/`);
      await snap(page, "01-seller-dashboard", DIR);
      await snap(page, "02-seller-escrows-list", DIR, { scroll: 400 });
    });

    // ── US-S1: View escrow detail as seller ──────────────────────────────
    await test.step("US-S1: View escrow details as seller", async () => {
      await loadPage(page, `${BASE}/escrows`);
      await snap(page, "03-escrows-list-seller", DIR);

      // Click the first escrow
      const escrowLink = page.locator("a[href*='/escrows/']").first();
      if (await escrowLink.isVisible().catch(() => false)) {
        await escrowLink.click();
        await page.waitForLoadState("networkidle");
        await pause(page);
      }
      await snap(page, "04-escrow-detail-seller", DIR);
      await snap(page, "05-deal-breakdown-seller", DIR, { scroll: 300 });
      await snap(page, "06-parties-seller", DIR, { scroll: 600 });
    });

    // ── Create a fresh escrow to show seller the full lifecycle ───────────
    await test.step("Create fresh escrow (buyer)", async () => {
      await switchRole(page, "Buyer");
      await loadPage(page, `${BASE}/marketplace`);
      const link = page.locator("a[href*='/marketplace/']").first();
      if (await link.isVisible().catch(() => false)) {
        await link.click();
        await page.waitForLoadState("networkidle");
        await pause(page);
        const buyBtn = page.locator("button").filter({ hasText: /Buy now/ });
        if (await buyBtn.isVisible().catch(() => false)) {
          await buyBtn.click();
          await page.waitForURL(/\/escrows\//, { timeout: 15000 });
          await page.waitForLoadState("networkidle");
          await pause(page);
        }
      }
    });

    // ── Switch back to seller: see the new funded escrow ─────────────────
    await test.step("US-S1: Seller sees newly funded escrow", async () => {
      await switchRole(page, "Seller");
      await loadPage(page, `${BASE}/escrows`);
      await snap(page, "07-escrows-with-new-escrow", DIR);

      const escrowLink = page.locator("a[href*='/escrows/']").first();
      if (await escrowLink.isVisible().catch(() => false)) {
        await escrowLink.click();
        await page.waitForLoadState("networkidle");
        await pause(page);
      }
      await snap(page, "08-new-escrow-seller-view", DIR);
    });

    // ── Advance through delivery + inspection + release (no dispute) ─────
    await test.step("Advance: hauler transit + delivery", async () => {
      await switchRole(page, "Hauler");
      await loadPage(page, `${BASE}/`);
      const transitBtn = page.locator("button").filter({ hasText: "Mark in transit" });
      if (await transitBtn.isVisible().catch(() => false)) {
        await transitBtn.click();
        await page.waitForLoadState("networkidle");
        await pause(page);
      }
      const deliveredBtn = page.locator("button").filter({ hasText: "Mark delivered" });
      if (await deliveredBtn.isVisible().catch(() => false)) {
        await deliveredBtn.click();
        await page.waitForLoadState("networkidle");
        await pause(page);
      }
    });

    // ── US-S2: Seller sees settlement after release ──────────────────────
    await test.step("US-S2: View settlement as seller", async () => {
      await switchRole(page, "Seller");
      await loadPage(page, `${BASE}/escrows`);
      const escrowLink = page.locator("a[href*='/escrows/']").first();
      if (await escrowLink.isVisible().catch(() => false)) {
        await escrowLink.click();
        await page.waitForLoadState("networkidle");
        await pause(page);
      }
      await snap(page, "09-settlement-seller-view", DIR);
      await snap(page, "10-settlement-breakdown", DIR, { scroll: 500 });
      await snap(page, "11-timeline-settled", DIR, { scroll: 800 });
    });
  });
});
