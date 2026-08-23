import { describe, expect, it } from "vitest";
import { compactMoney, money, formatDate, formatLbs, bpsToPct, msToHours } from "../lib/format";

/**
 * compactMoney must be byte-identical between the Node server and the
 * browser, or React hydration fails (server HTML text != client DOM text).
 * It deliberately avoids Intl `notation: "compact"`, whose output differs
 * between runtimes ($115K vs $115.0K). These tests lock the exact strings.
 */
describe("compactMoney", () => {
  const cases: Array<[cents: number, expected: string]> = [
    // Below $1,000 — plain whole dollars, thousands grouping.
    [0, "$0"],
    [1, "$0"],
    [100, "$1"],
    [45_000, "$450"],
    [99_900, "$999"],
    [99_950, "$1,000"], // $999.50 → rounds to $1,000 (grouping kicks in)
    // $1,000+ — one decimal + K suffix.
    [100_000, "$1.0K"],
    [100_050, "$1.0K"],
    [150_000, "$1.5K"],
    [11_500_000, "$115.0K"], // the original hydration-mismatch case
    [30_520_000, "$305.2K"],
    [999_950_000, "$10.0M"], // $9,999,500 → 9.9995M rounds to 10.0M
    // $1,000,000+ — one decimal + M suffix.
    [140_000_000, "$1.4M"],
    [100_000_000, "$1.0M"],
    [25_000_000_000, "$250.0M"],
    // Negatives follow the same rules (leading minus, no parens).
    [-11_500_000, "$-115.0K"],
    [-450_000, "$-4.5K"],
  ];

  it.each(cases)("compactMoney(%d) === %s", (cents, expected) => {
    expect(compactMoney(cents)).toBe(expected);
  });

  it("is fully deterministic — repeated calls return identical output", () => {
    const values = [0, 45_000, 100_000, 11_500_000, 140_000_000, -11_500_000];
    for (const v of values) {
      const first = compactMoney(v);
      for (let i = 0; i < 5; i++) {
        expect(compactMoney(v)).toBe(first);
      }
    }
  });

  it("never emits locale-dependent characters (no narrow no-break space, no locale digits)", () => {
    const values = [0, 999, 1_235, 100_000, 11_500_000, 140_000_000];
    for (const v of values) {
      const out = compactMoney(v);
      // \u202F is the narrow no-break space Intl inserts in some locales.
      expect(out).not.toContain("\u202F");
      expect(out).not.toContain("\u00A0");
      expect(out).toMatch(/^\$[-0-9.,KM]+$/);
    }
  });
});

describe("money", () => {
  it("formats cents as explicit-locale USD currency", () => {
    expect(money(123_456)).toBe("$1,234.56");
    expect(money(0)).toBe("$0.00");
  });
});

describe("formatDate", () => {
  it("returns the em-dash for missing dates", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate(undefined)).toBe("—");
  });

  it("formats a fixed instant identically (explicit en-US options)", () => {
    // Construct from local components so the assertion is timezone-independent:
    // Aug 22, 2026 14:05 local → Aug 22, 02:05 PM (en-US, 12h clock).
    expect(formatDate(new Date(2026, 7, 22, 14, 5))).toBe("Aug 22, 02:05 PM");
    // Day boundaries roll over correctly.
    expect(formatDate(new Date(2026, 7, 22, 0, 5))).toBe("Aug 22, 12:05 AM");
  });
});

describe("formatLbs", () => {
  it("returns the em-dash for null/undefined", () => {
    expect(formatLbs(null)).toBe("—");
    expect(formatLbs(undefined)).toBe("—");
  });

  const cases: Array<[lbs: number, expected: string]> = [
    [0, "0 lb"],
    [1, "1 lb"],
    [1250, "1,250 lb"],
    [150_000, "150,000 lb"],
    [999_999, "999,999 lb"],
  ];

  it.each(cases)("formatLbs(%d) === %s", (lbs, expected) => {
    expect(formatLbs(lbs)).toBe(expected);
  });

  it("never emits locale-dependent characters", () => {
    const out = formatLbs(1_234_567);
    expect(out).not.toContain("\u202F");
    expect(out).not.toContain("\u00A0");
  });
});

describe("bpsToPct", () => {
  const cases: Array<[bps: number, expected: string]> = [
    [0, "0.00%"],
    [1, "0.01%"],
    [50, "0.50%"],
    [100, "1.00%"],
    [200, "2.00%"],  // default platform fee
    [400, "4.00%"],  // default barn commission
    [1_000, "10.00%"],
    [10_000, "100.00%"],
  ];

  it.each(cases)("bpsToPct(%d) === %s", (bps, expected) => {
    expect(bpsToPct(bps)).toBe(expected);
  });
});

describe("msToHours", () => {
  const cases: Array<[ms: number, expected: string]> = [
    [0, "0h"],
    [3_600_000, "1h"],          // exactly 1 hour
    [24 * 3_600_000, "24h"],    // the inspection window
    [48 * 3_600_000, "48h"],    // the dispute proof window
    [5_400_000, "1.5h"],        // 90 minutes — one decimal
    [3_700_000, "1.0h"],        // slightly over 1h — rounds to 1.0
    [1_800_000, "0.5h"],        // 30 minutes
  ];

  it.each(cases)("msToHours(%d) === %s", (ms, expected) => {
    expect(msToHours(ms)).toBe(expected);
  });
});
