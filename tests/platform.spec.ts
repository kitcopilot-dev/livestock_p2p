/**
 * Platform role video recording.
 * Covers US-P1 (arbitrate disputes), US-P2 (monitor platform settings).
 *
 * Run: npx playwright test tests/platform.spec.ts --headed
 * Output: test-results/platform/
 */
import { test, expect } from "@playwright/test";
import { BASE, pause, loadPage, switchRole, snap } from "./helpers";

const DIR = "test-results/platform";

test.describe("Platform role walkthrough", () => {
  test("US-P1 → US-P2: arbitrate disputes, view settings", async ({ page }) => {
    test.setTimeout(300_000);

    // Start as Platform
    await switchRole(page, "Platform");

    // ── US-P2: Platform settings page ────────────────────────────────────
    await test.step("US-P2: Platform settings", async () => {
      await loadPage(page, `${BASE}/settings`);
      await snap(page, "01-settings-top", DIR);
      await snap(page, "02-settings-economics", DIR, { scroll: 400 });
      await snap(page, "03-settings-rail-provisioning", DIR, { scroll: 800 });
    });

    // ── US-P2: View ledger ───────────────────────────────────────────────
    await test.step("US-P2: Ledger view", async () => {
      await loadPage(page, `${BASE}/ledger`);
      await snap(page, "04-ledger-overview", DIR);
    });

    // ── US-P1: Create dispute scenario ───────────────────────────────────
    await test.step("Create escrow (buyer) and advance to dispute", async () => {
      // Buyer creates + funds
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

      // Hauler advances to delivery
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

      // Buyer files dispute
      await switchRole(page, "Buyer");
      await loadPage(page, `${BASE}/`);
      const disputeSelect = page.locator("select").first();
      if (await disputeSelect.isVisible({ timeout: 5000 }).catch(() => false)) {
        await disputeSelect.selectOption("QUALITY");
        await pause(page, 300);
        const detailInput = page.locator('input[type="text"]').last();
        if (await detailInput.isVisible().catch(() => false)) {
          await detailInput.fill("Several head show signs of respiratory illness — does not match health cert");
        }
        await page.locator("button").filter({ hasText: "File dispute" }).click();
        await page.waitForLoadState("networkidle");
        await pause(page);
      }
    });

    // ── US-P1: Platform sees disputed escrow ─────────────────────────────
    await test.step("US-P1: Platform views disputed escrow", async () => {
      await switchRole(page, "Platform");
      await loadPage(page, `${BASE}/escrows`);
      await snap(page, "05-escrows-disputed", DIR);

      const escrowLink = page.locator("a[href*='/escrows/']").first();
      if (await escrowLink.isVisible().catch(() => false)) {
        await escrowLink.click();
        await page.waitForLoadState("networkidle");
        await pause(page);
      }
      await snap(page, "06-disputed-escrow-detail", DIR);
      await snap(page, "07-dispute-card", DIR, { scroll: 500 });
    });

    // ── US-P1: Escalate to arbitration ───────────────────────────────────
    await test.step("US-P1: Escalate to arbitration", async () => {
      const escalateBtn = page.locator("button").filter({ hasText: "Escalate" });
      if (await escalateBtn.isVisible().catch(() => false)) {
        await snap(page, "08-escalate-button", DIR);
        await escalateBtn.click();
        await page.waitForLoadState("networkidle");
        await pause(page);
      }
      await snap(page, "09-arbitration-processing", DIR);
      await snap(page, "10-arbitration-options", DIR, { scroll: 400 });
    });

    // ── US-P1: Resolve with split ────────────────────────────────────────
    await test.step("US-P1: Resolve dispute — split", async () => {
      const splitBtn = page.locator("button").filter({ hasText: /split/i });
      if (await splitBtn.isVisible().catch(() => false)) {
        await snap(page, "11-split-button", DIR);
        await splitBtn.click();
        await page.waitForLoadState("networkidle");
        await pause(page);
      }
      await snap(page, "12-resolved-split", DIR);
    });

    // ── US-P1: View settlement breakdown ─────────────────────────────────
    await test.step("US-P1: Settlement breakdown after arbitration", async () => {
      await snap(page, "13-settlement-breakdown", DIR, { scroll: 300 });
      await snap(page, "14-timeline-arbitration", DIR, { scroll: 600 });
      await snap(page, "15-parties-settled", DIR, { scroll: 900 });
    });

    // ── Final: escrows list + settings recap ─────────────────────────────
    await test.step("Final: escrows list showing resolved state", async () => {
      await loadPage(page, `${BASE}/escrows`);
      await snap(page, "16-escrows-final", DIR);
    });

    await test.step("Final: settings with rail provisioning status", async () => {
      await loadPage(page, `${BASE}/settings`);
      await snap(page, "17-settings-final", DIR, { scroll: 800 });
    });
  });
});
