/**
 * Buyer role video recording.
 * Covers US-B1 (browse), US-B2 (create escrow from listing), US-B3 (fund — implicit in Buy now),
 * US-B4 (cancel — shown but not executed), US-B5 (file dispute after delivery).
 *
 * Run: npx playwright test tests/buyer.spec.ts --headed
 * Output: test-results/buyer/
 */
import { test, expect } from "@playwright/test";
import { BASE, pause, loadPage, switchRole, snap } from "./helpers";

const DIR = "test-results/buyer";

test.describe("Buyer role walkthrough", () => {
  test("US-B1 → US-B5: browse, buy, fund, view, dispute", async ({ page }) => {
    test.setTimeout(300_000);

    // Start as Buyer
    await switchRole(page, "Buyer");

    // ── US-B1: Browse marketplace dashboard ──────────────────────────────
    await test.step("US-B1: Dashboard with featured lots", async () => {
      await loadPage(page, `${BASE}/`);
      await snap(page, "01-dashboard-featured-lots", DIR, { scroll: 400 });
    });

    await test.step("US-B1: Marketplace listings page", async () => {
      await loadPage(page, `${BASE}/marketplace`);
      await snap(page, "02-marketplace-listings", DIR);
    });

    // ── US-B2: View listing detail ───────────────────────────────────────
    await test.step("US-B2: Listing detail page", async () => {
      // Click the first listing card
      const link = page.locator("a[href*='/marketplace/']").first();
      if (await link.isVisible().catch(() => false)) {
        await link.click();
        await page.waitForLoadState("networkidle");
        await pause(page);
      } else {
        // Fallback: navigate to a known listing via dashboard
        await loadPage(page, `${BASE}/`);
        const card = page.locator("a[href*='/marketplace/']").first();
        if (await card.isVisible().catch(() => false)) {
          await card.click();
          await page.waitForLoadState("networkidle");
          await pause(page);
        }
      }
      await snap(page, "03-listing-detail-top", DIR);
      await snap(page, "04-listing-detail-pricing", DIR, { scroll: 600 });
      await snap(page, "05-listing-detail-comparison", DIR, { scroll: 600 });
    });

    // ── US-B2 + US-B3: Buy now (create + fund in one step) ──────────────
    await test.step("US-B2+US-B3: Buy now creates and funds escrow", async () => {
      const buyBtn = page.locator("button").filter({ hasText: /Buy now/ });
      if (await buyBtn.isVisible().catch(() => false)) {
        await snap(page, "06-buy-now-button", DIR);
        await buyBtn.click();
        await page.waitForURL(/\/escrows\//, { timeout: 15000 });
        await page.waitForLoadState("networkidle");
        await pause(page);
      } else {
        // Fallback: create via form
        await loadPage(page, `${BASE}/escrows/new`);
        const saleInput = page.locator('input[name="saleAmount"]');
        if (await saleInput.isVisible().catch(() => false)) {
          await saleInput.fill("50000");
          await page.locator('input[name="freightFee"]').fill("2500");
          await page.locator('input[name="contractedWeightLbs"]').fill("10000");
          await pause(page, 500);
          await snap(page, "06-new-escrow-form", DIR);
          await page.locator('button[type="submit"]').click();
          await page.waitForURL(/\/escrows\//, { timeout: 15000 });
          await page.waitForLoadState("networkidle");
          await pause(page);
          // Fund separately for form-created escrows
          const fundBtn = page.locator("button").filter({ hasText: "Fund escrow" });
          if (await fundBtn.isVisible().catch(() => false)) {
            await fundBtn.click();
            await page.waitForLoadState("networkidle");
            await pause(page);
          }
        }
      }
      await snap(page, "07-escrow-funded", DIR);
    });

    // ── US-B4: Show cancel option (but don't click — we need the escrow) ─
    await test.step("US-B4: Cancel button visible on funded escrow", async () => {
      const cancelBtn = page.locator("button").filter({ hasText: "Cancel escrow" });
      if (await cancelBtn.isVisible().catch(() => false)) {
        await snap(page, "08-cancel-button-visible", DIR);
      }
    });

    // ── Advance escrow to INSPECTION_PERIOD (need hauler + delivery) ─────
    await test.step("Advance: switch to hauler for transit + delivery", async () => {
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

    // ── US-B5: File dispute during inspection ────────────────────────────
    await test.step("US-B5: Buyer files dispute", async () => {
      await switchRole(page, "Buyer");
      await loadPage(page, `${BASE}/`);

      // The dispute form should be visible during inspection period
      const disputeSelect = page.locator("select").first();
      if (await disputeSelect.isVisible({ timeout: 5000 }).catch(() => false)) {
        await snap(page, "09-dispute-form", DIR);
        await disputeSelect.selectOption("QUALITY");
        await pause(page, 400);
        const detailInput = page.locator('input[type="text"]').last();
        if (await detailInput.isVisible().catch(() => false)) {
          await detailInput.fill("15 head show visible quality defects — below contract specifications");
        }
        await pause(page, 500);
        await snap(page, "10-dispute-filled", DIR);

        await page.locator("button").filter({ hasText: "File dispute" }).click();
        await page.waitForLoadState("networkidle");
        await pause(page);
      }
      await snap(page, "11-disputed-status", DIR);
    });

    // ── Final: view disputed escrow as buyer ─────────────────────────────
    await test.step("Final: buyer sees disputed escrow", async () => {
      await snap(page, "12-escrow-timeline-disputed", DIR, { scroll: 400 });
      await snap(page, "13-dispute-detail", DIR, { scroll: 800 });
    });
  });
});
