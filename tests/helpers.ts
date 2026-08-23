import { type Page } from "@playwright/test";

export const BASE = process.env.BASE_URL ?? "http://localhost:59145";

/** Pause for video readability. */
export async function pause(page: Page, ms = 1800) {
  await page.waitForTimeout(ms);
}

/** Wait for navigation + network idle + a readability pause. */
export async function loadPage(page: Page, url: string, pauseMs = 1800) {
  await page.goto(url);
  await page.waitForLoadState("networkidle");
  await pause(page, pauseMs);
}

/**
 * Open the role switcher dropdown and select the given role.
 * Navigates to the app first if the page hasn't loaded yet.
 */
export async function switchRole(
  page: Page,
  role: "Buyer" | "Seller" | "Hauler" | "Platform",
) {
  // Ensure we're on the app so the header exists
  if (!page.url() || page.url() === "about:blank") {
    await loadPage(page, `${BASE}/`);
  }

  // Click the role chip in the header
  const headerBtn = page
    .locator("header button")
    .filter({ hasText: /Buyer|Seller|Hauler|Platform/ })
    .last();
  await headerBtn.click({ timeout: 8000 });
  await pause(page, 500);

  // Click the role name in the dropdown
  const btn = page
    .getByRole("button", { name: new RegExp(`^${role}`) })
    .last();
  await btn.click();
  await pause(page, 1000);
}

/** Take a named screenshot into the given output directory. */
export async function snap(
  page: Page,
  name: string,
  dir: string,
  opts?: { scroll?: number; scrollDelay?: number },
) {
  if (opts?.scroll) {
    await page.evaluate((y) => window.scrollBy(0, y), opts.scroll);
    await pause(page, opts.scrollDelay ?? 600);
  }
  await page.screenshot({ path: `${dir}/${name}.png` });
}
