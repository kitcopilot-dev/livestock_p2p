/**
 * Hauler role video recording.
 * Covers US-H1 (accept load), US-H2 (mark in transit), US-H3 (mark delivered with weight),
 * US-H4 (receive freight payout after settlement).
 *
 * Run: npx playwright test tests/hauler.spec.ts --headed
 * Output: test-results/hauler/
 */
import { test, expect } from "@playwright/test";
import { BASE, pause, loadPage, switchRole, snap } from "./helpers";

const DIR = "test-results/hauler";

test.describe("Hauler role walkthrough", () => {
  test("US-H1 → US-H4: accept load, transit, deliver, freight payout", async ({ page }) => {
    test.setTimeout(300_000);

    // Start as Hauler
    await switchRole(page, "Hauler");

    // ── US-H1: View dashboard as hauler ──────────────────────────────────
    await test.step("US-H1: Hauler dashboard", async () => {
      await loadPage(page, `${BASE}/`);
      await snap(page, "01-hauler-dashboard", DIR);
    });

    await test.step("US-H1: View loads page", async () => {
      await loadPage(page, `${BASE}/loads`);
      await snap(page, "02-loads-page", DIR);
    });

    // ── Create a fresh escrow (need buyer for this) ──────────────────────
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

    // ── US-H1: Hauler sees the new load ──────────────────────────────────
    await test.step("US-H1: Hauler sees assigned load", async () => {
      await switchRole(page, "Hauler");
      await loadPage(page, `${BASE}/loads`);
      await snap(page, "03-loads-with-new-load", DIR);

      // View the load detail if link exists
      const loadLink = page.locator("a[href*='/loads/']").first();
      if (await loadLink.isVisible().catch(() => false)) {
        await loadLink.click();
        await page.waitForLoadState("networkidle");
        await pause(page);
      }
      await snap(page, "04-load-detail", DIR);
    });

    // ── US-H2: Mark shipment in transit ──────────────────────────────────
    await test.step("US-H2: Mark in transit", async () => {
      await loadPage(page, `${BASE}/`);
      const transitBtn = page.locator("button").filter({ hasText: "Mark in transit" });
      if (await transitBtn.isVisible().catch(() => false)) {
        await snap(page, "05-funded-ready-for-transit", DIR);
        await transitBtn.click();
        await page.waitForLoadState("networkidle");
        await pause(page);
      }
      await snap(page, "06-in-transit-status", DIR);
      await snap(page, "07-timeline-pickup", DIR, { scroll: 400 });
    });

    // ── US-H3: Mark delivery with weight ─────────────────────────────────
    await test.step("US-H3: Mark delivered with weight", async () => {
      const weightInput = page.locator('input[type="number"]').first();
      if (await weightInput.isVisible().catch(() => false)) {
        await snap(page, "08-delivery-weight-input", DIR);
        // Keep default weight (contracted weight)
      }

      const deliveredBtn = page.locator("button").filter({ hasText: "Mark delivered" });
      if (await deliveredBtn.isVisible().catch(() => false)) {
        await deliveredBtn.click();
        await page.waitForLoadState("networkidle");
        await pause(page);
      }
      await snap(page, "09-inspection-period", DIR);
      await snap(page, "10-timeline-delivered", DIR, { scroll: 400 });
    });

    // ── US-H4: View settlement after resolution (advance to settlement) ──
    await test.step("Advance: buyer files dispute, platform arbitrates", async () => {
      // Buyer files dispute
      await switchRole(page, "Buyer");
      await loadPage(page, `${BASE}/`);
      const disputeSelect = page.locator("select").first();
      if (await disputeSelect.isVisible({ timeout: 5000 }).catch(() => false)) {
        await disputeSelect.selectOption("WEIGHT_SHRINK");
        await pause(page, 300);
        const detailInput = page.locator('input[type="text"]').last();
        if (await detailInput.isVisible().catch(() => false)) {
          await detailInput.fill("Delivered weight 131,000 lb vs contracted 134,200 lb — excessive shrink");
        }
        await page.locator("button").filter({ hasText: "File dispute" }).click();
        await page.waitForLoadState("networkidle");
        await pause(page);
      }

      // Platform escalates + resolves
      await switchRole(page, "Platform");
      await loadPage(page, `${BASE}/`);
      const escalateBtn = page.locator("button").filter({ hasText: "Escalate" });
      if (await escalateBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await escalateBtn.click();
        await page.waitForLoadState("networkidle");
        await pause(page);
        const splitBtn = page.locator("button").filter({ hasText: /split/i });
        if (await splitBtn.isVisible().catch(() => false)) {
          await splitBtn.click();
          await page.waitForLoadState("networkidle");
          await pause(page);
        }
      }
    });

    // ── US-H4: Hauler sees freight payout in settlement ──────────────────
    await test.step("US-H4: Hauler views freight payout", async () => {
      await switchRole(page, "Hauler");
      await loadPage(page, `${BASE}/escrows`);
      const escrowLink = page.locator("a[href*='/escrows/']").first();
      if (await escrowLink.isVisible().catch(() => false)) {
        await escrowLink.click();
        await page.waitForLoadState("networkidle");
        await pause(page);
      }
      await snap(page, "11-settlement-hauler-view", DIR);
      await snap(page, "12-settlement-breakdown-freight", DIR, { scroll: 500 });
      await snap(page, "13-timeline-final", DIR, { scroll: 900 });
    });
  });
});
