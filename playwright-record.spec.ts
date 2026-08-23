/**
 * Comprehensive Playwright E2E video recording of the full escrow lifecycle.
 * Covers every user story: buyer browse → buy → hauler transit → delivery →
 * dispute → arbitration → settlement → final state.
 *
 * Run: npx playwright test playwright-record.spec.ts --headed
 * Video saved to: ./test-results/video.webm
 */
import { test, expect } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://localhost:59145";

test.describe("Escrow lifecycle — full walkthrough", () => {
  test("every user story, end to end", async ({ page }) => {
    test.setTimeout(300_000); // 5 minutes

    const PAUSE = 1500; // ms to pause between actions for video readability

    async function switchRole(role: "Buyer" | "Seller" | "Hauler" | "Platform") {
      const headerBtn = page.locator("header button").filter({ hasText: /Buyer|Seller|Hauler|Platform/ }).last();
      await headerBtn.click({ timeout: 5000 });
      await page.waitForTimeout(400);
      const btn = page.getByRole("button", { name: new RegExp(`^${role}`) }).last();
      await btn.click();
      await page.waitForTimeout(800);
    }

    // ====================================================================
    // US-B1: Browse the marketplace (dashboard with featured lots)
    // ====================================================================
    await test.step("US-B1: Browse marketplace dashboard", async () => {
      await page.goto(`${BASE}/`);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(PAUSE);
      await page.screenshot({ path: "test-results/01-dashboard.png" });
      // Scroll to show featured lots
      await page.evaluate(() => window.scrollBy(0, 400));
      await page.waitForTimeout(PAUSE);
      await page.screenshot({ path: "test-results/02-featured-lots.png" });
    });

    // ====================================================================
    // US-S1: Seller view of dashboard
    // ====================================================================
    await test.step("US-S1: Seller viewport", async () => {
      await switchRole("Seller");
      await page.waitForTimeout(PAUSE);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(500);
      await page.screenshot({ path: "test-results/03-seller-dashboard.png" });
    });

    // Switch back to buyer for purchasing
    await switchRole("Buyer");
    await page.waitForTimeout(500);

    // ====================================================================
    // US-B2: View listing detail
    // ====================================================================
    await test.step("US-B2: View listing detail", async () => {
      await page.goto(`${BASE}/marketplace`);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(PAUSE);
      await page.screenshot({ path: "test-results/04-marketplace.png" });
      // Click a listing if available
      const listingLink = page.locator("a[href*='/marketplace/']").first();
      if (await listingLink.isVisible().catch(() => false)) {
        await listingLink.click();
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(PAUSE);
      } else {
        // Navigate to a known listing via the new escrow form instead
        await page.goto(`${BASE}/escrows/new`);
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(PAUSE);
      }
      await page.screenshot({ path: "test-results/05-listing-or-form.png" });
    });

    // ====================================================================
    // US-B2 + US-B3: Create AND fund escrow (Buy now = single step)
    // ====================================================================
    await test.step("US-B2+US-B3: Buy now (create + fund)", async () => {
      // If on listing page, click Buy now
      const buyBtn = page.locator("button").filter({ hasText: "Buy now" });
      if (await buyBtn.isVisible().catch(() => false)) {
        await buyBtn.click();
        await page.waitForURL(/\/escrows\//, { timeout: 15000 });
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(PAUSE);
      } else {
        // On the new-escrow form — fill and submit
        const saleInput = page.locator('input[name="saleAmount"]');
        if (await saleInput.isVisible().catch(() => false)) {
          await saleInput.fill("50000");
          await page.locator('input[name="freightFee"]').fill("2500");
          await page.locator('input[name="contractedWeightLbs"]').fill("10000");
          await page.waitForTimeout(500);
          await page.screenshot({ path: "test-results/06-form-filled.png" });
          await page.locator('button[type="submit"]').click();
          await page.waitForURL(/\/escrows\//, { timeout: 15000 });
          await page.waitForLoadState("networkidle");
          await page.waitForTimeout(PAUSE);
          // Fund the escrow (separate step for form-created escrows)
          const fundBtn = page.locator("button").filter({ hasText: "Fund escrow" });
          if (await fundBtn.isVisible().catch(() => false)) {
            await fundBtn.click();
            await page.waitForLoadState("networkidle");
            await page.waitForTimeout(PAUSE);
          }
        }
      }
      await page.screenshot({ path: "test-results/07-escrow-funded.png" });
    });

    // ====================================================================
    // US-H1 + US-H2: Hauler accepts load and marks in transit
    // ====================================================================
    await test.step("US-H1+US-H2: Hauler transit", async () => {
      await switchRole("Hauler");
      await page.waitForTimeout(PAUSE);
      // Show the escrow in funded state from hauler perspective
      await page.screenshot({ path: "test-results/08-hauler-view.png" });

      // Mark in transit
      const transitBtn = page.locator("button").filter({ hasText: "Mark in transit" });
      if (await transitBtn.isVisible().catch(() => false)) {
        await transitBtn.click();
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(PAUSE);
      }
      await page.screenshot({ path: "test-results/09-in-transit.png" });
    });

    // ====================================================================
    // US-H3: Hauler marks delivered with weight
    // ====================================================================
    await test.step("US-H3: Hauler delivery", async () => {
      const deliveredBtn = page.locator("button").filter({ hasText: "Mark delivered" });
      if (await deliveredBtn.isVisible().catch(() => false)) {
        await page.screenshot({ path: "test-results/10-delivery-form.png" });
        await deliveredBtn.click();
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(PAUSE);
      }
      await page.screenshot({ path: "test-results/11-inspection-period.png" });
    });

    // ====================================================================
    // US-B5: Buyer files a dispute during inspection
    // ====================================================================
    await test.step("US-B5: Buyer dispute", async () => {
      await switchRole("Buyer");
      await page.waitForTimeout(PAUSE);

      const disputeSelect = page.locator("select").first();
      if (await disputeSelect.isVisible().catch(() => false)) {
        await page.screenshot({ path: "test-results/12-dispute-form.png" });
        await disputeSelect.selectOption("QUALITY");
        await page.waitForTimeout(300);
        await page.locator('input[type="text"]').last().fill("15 head show visible quality defects — below contract specs");
        await page.waitForTimeout(500);
        await page.screenshot({ path: "test-results/13-dispute-filled.png" });

        await page.locator("button").filter({ hasText: "File dispute" }).click();
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(PAUSE);
      }
      await page.screenshot({ path: "test-results/14-disputed.png" });
    });

    // ====================================================================
    // US-P1: Platform escalates and arbitrates
    // ====================================================================
    await test.step("US-P1: Platform arbitration", async () => {
      await switchRole("Platform");
      await page.waitForTimeout(PAUSE);

      // Escalate to arbitration
      const escalateBtn = page.locator("button").filter({ hasText: "Escalate" });
      if (await escalateBtn.isVisible().catch(() => false)) {
        await page.screenshot({ path: "test-results/15-dispute-detail.png" });
        await escalateBtn.click();
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(PAUSE);
        await page.screenshot({ path: "test-results/16-arbitration.png" });

        // Resolve with split
        const splitBtn = page.locator("button").filter({ hasText: "split" });
        if (await splitBtn.isVisible().catch(() => false)) {
          await page.screenshot({ path: "test-results/17-arbitration-options.png" });
          await splitBtn.click();
          await page.waitForLoadState("networkidle");
          await page.waitForTimeout(PAUSE * 2);
        }
      }
      await page.screenshot({ path: "test-results/18-settled.png" });
    });

    // ====================================================================
    // View final escrow state and settlement breakdown
    // ====================================================================
    await test.step("Final escrow state", async () => {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(500);
      await page.screenshot({ path: "test-results/19-final-escrow.png" });
      // Scroll to see settlement/timeline
      await page.evaluate(() => window.scrollBy(0, 500));
      await page.waitForTimeout(PAUSE);
      await page.screenshot({ path: "test-results/20-settlement-details.png" });
    });

    // ====================================================================
    // Escrows list view
    // ====================================================================
    await test.step("Escrows list", async () => {
      await page.goto(`${BASE}/escrows`);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(PAUSE);
      await page.screenshot({ path: "test-results/21-escrows-list.png" });
    });

    // ====================================================================
    // Ledger view
    // ====================================================================
    await test.step("Ledger view", async () => {
      await page.goto(`${BASE}/ledger`);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(PAUSE);
      await page.screenshot({ path: "test-results/22-ledger.png" });
    });
  });
});
