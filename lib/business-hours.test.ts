import { describe, it, expect } from "vitest";
import { isAnyBarberOnShiftNow, summarizeOpeningHours, type ScheduleWindow } from "./business-hours";

function at(time: string): Date {
  const [h, m] = time.split(":").map(Number);
  const d = new Date("2026-10-12T00:00:00");
  d.setHours(h, m, 0, 0);
  return d;
}

describe("isAnyBarberOnShiftNow", () => {
  it("returns false when schedules is empty", () => {
    expect(isAnyBarberOnShiftNow([], 1, at("10:00"))).toBe(false);
  });

  it("returns true when now falls inside a window for that weekday", () => {
    const schedules: ScheduleWindow[] = [{ weekday: 1, startTime: "09:00", endTime: "18:00" }];
    expect(isAnyBarberOnShiftNow(schedules, 1, at("10:00"))).toBe(true);
  });

  it("returns false outside the window", () => {
    const schedules: ScheduleWindow[] = [{ weekday: 1, startTime: "09:00", endTime: "18:00" }];
    expect(isAnyBarberOnShiftNow(schedules, 1, at("20:00"))).toBe(false);
  });

  it("returns false during a lunch break gap between two windows", () => {
    const schedules: ScheduleWindow[] = [
      { weekday: 1, startTime: "09:00", endTime: "12:00" },
      { weekday: 1, startTime: "13:00", endTime: "18:00" },
    ];
    expect(isAnyBarberOnShiftNow(schedules, 1, at("12:30"))).toBe(false);
  });

  it("returns true when at least one of multiple barbers is on shift", () => {
    const schedules: ScheduleWindow[] = [
      { weekday: 1, startTime: "14:00", endTime: "18:00" },
      { weekday: 1, startTime: "09:00", endTime: "12:00" },
    ];
    expect(isAnyBarberOnShiftNow(schedules, 1, at("10:00"))).toBe(true);
  });

  it("ignores windows for other weekdays", () => {
    const schedules: ScheduleWindow[] = [{ weekday: 2, startTime: "09:00", endTime: "18:00" }];
    expect(isAnyBarberOnShiftNow(schedules, 1, at("10:00"))).toBe(false);
  });
});

describe("summarizeOpeningHours", () => {
  it("returns null when there are no schedules", () => {
    expect(summarizeOpeningHours([])).toBeNull();
  });

  it("collapses a lunch break into a single outer window", () => {
    const schedules: ScheduleWindow[] = [
      { weekday: 1, startTime: "09:00", endTime: "12:00" },
      { weekday: 1, startTime: "13:00", endTime: "18:00" },
    ];
    expect(summarizeOpeningHours(schedules)).toBe("Seg: 09:00–18:00");
  });

  it("groups consecutive days with identical hours", () => {
    const schedules: ScheduleWindow[] = [1, 2, 3, 4, 5].map((weekday) => ({
      weekday,
      startTime: "09:00",
      endTime: "18:00",
    }));
    expect(summarizeOpeningHours(schedules)).toBe("Seg a Sex: 09:00–18:00");
  });

  it("keeps a day with different hours separate from its neighbors", () => {
    const schedules: ScheduleWindow[] = [
      ...[1, 2, 3, 4, 5].map((weekday) => ({ weekday, startTime: "09:00", endTime: "18:00" })),
      { weekday: 6, startTime: "09:00", endTime: "14:00" },
    ];
    expect(summarizeOpeningHours(schedules)).toBe("Seg a Sex: 09:00–18:00 · Sáb: 09:00–14:00");
  });

  it("excludes days with no barber working", () => {
    const schedules: ScheduleWindow[] = [{ weekday: 1, startTime: "09:00", endTime: "18:00" }];
    const summary = summarizeOpeningHours(schedules);
    expect(summary).toBe("Seg: 09:00–18:00");
    expect(summary).not.toContain("Ter");
  });

  it("merges overlapping windows from multiple barbers into min start / max end", () => {
    const schedules: ScheduleWindow[] = [
      { weekday: 1, startTime: "09:00", endTime: "17:00" },
      { weekday: 1, startTime: "10:00", endTime: "19:00" },
    ];
    expect(summarizeOpeningHours(schedules)).toBe("Seg: 09:00–19:00");
  });
});
