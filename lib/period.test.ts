import { describe, it, expect } from "vitest";
import { periodRange, enumerateDays } from "./period";

describe("periodRange", () => {
  it("today returns the single calendar day containing now", () => {
    const now = new Date("2026-10-06T15:30:00");
    const { start, end } = periodRange("today", now);
    expect(start).toEqual(new Date(2026, 9, 6));
    expect(end).toEqual(new Date(2026, 9, 7));
  });

  it("week starts on Sunday and spans 7 days", () => {
    // 2026-10-06 is a Tuesday
    const now = new Date("2026-10-06T15:30:00");
    const { start, end } = periodRange("week", now);
    expect(start).toEqual(new Date(2026, 9, 4));
    expect(end).toEqual(new Date(2026, 9, 11));
  });

  it("week on a Sunday starts that same day", () => {
    const now = new Date("2026-10-04T08:00:00"); // Sunday
    const { start, end } = periodRange("week", now);
    expect(start).toEqual(new Date(2026, 9, 4));
    expect(end).toEqual(new Date(2026, 9, 11));
  });

  it("month returns the first-of-month to first-of-next-month", () => {
    const now = new Date("2026-10-06T15:30:00");
    const { start, end } = periodRange("month", now);
    expect(start).toEqual(new Date(2026, 9, 1));
    expect(end).toEqual(new Date(2026, 10, 1));
  });

  it("month handles December rollover to January", () => {
    const now = new Date("2026-12-15T00:00:00");
    const { start, end } = periodRange("month", now);
    expect(start).toEqual(new Date(2026, 11, 1));
    expect(end).toEqual(new Date(2027, 0, 1));
  });
});

describe("enumerateDays", () => {
  it("returns one day for a single-day range", () => {
    const days = enumerateDays({ start: new Date(2026, 9, 6), end: new Date(2026, 9, 7) });
    expect(days).toEqual([new Date(2026, 9, 6)]);
  });

  it("returns every day in a 7-day range", () => {
    const days = enumerateDays({ start: new Date(2026, 9, 4), end: new Date(2026, 9, 11) });
    expect(days.map((d) => d.getDate())).toEqual([4, 5, 6, 7, 8, 9, 10]);
  });
});
