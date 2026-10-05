import { describe, it, expect } from "vitest";
import { getAvailableSlots } from "./slots";

const DATE = new Date("2026-10-12T00:00:00");
const WEEKDAY = DATE.getDay();
const OTHER_WEEKDAY = (WEEKDAY + 1) % 7;
const FAR_PAST = new Date("2000-01-01T00:00:00");

function at(time: string): Date {
  const [h, m] = time.split(":").map(Number);
  const d = new Date(DATE);
  d.setHours(h, m, 0, 0);
  return d;
}

describe("getAvailableSlots", () => {
  it("returns no slots when there is no schedule rule for the weekday", () => {
    const slots = getAvailableSlots({
      date: DATE,
      serviceDurationMinutes: 30,
      scheduleRules: [{ weekday: OTHER_WEEKDAY, startTime: "09:00", endTime: "12:00" }],
      timeOff: [],
      bookedAppointments: [],
      now: FAR_PAST,
    });
    expect(slots).toEqual([]);
  });

  it("generates slots at the given interval within the working window", () => {
    const slots = getAvailableSlots({
      date: DATE,
      serviceDurationMinutes: 30,
      scheduleRules: [{ weekday: WEEKDAY, startTime: "09:00", endTime: "10:30" }],
      timeOff: [],
      bookedAppointments: [],
      slotIntervalMinutes: 30,
      now: FAR_PAST,
    });
    expect(slots.map((s) => s.toTimeString().slice(0, 5))).toEqual([
      "09:00",
      "09:30",
      "10:00",
    ]);
  });

  it("excludes slots that overlap an existing appointment", () => {
    const slots = getAvailableSlots({
      date: DATE,
      serviceDurationMinutes: 30,
      scheduleRules: [{ weekday: WEEKDAY, startTime: "09:00", endTime: "10:30" }],
      timeOff: [],
      bookedAppointments: [{ startAt: at("09:30"), endAt: at("10:00") }],
      slotIntervalMinutes: 30,
      now: FAR_PAST,
    });
    expect(slots.map((s) => s.toTimeString().slice(0, 5))).toEqual([
      "09:00",
      "10:00",
    ]);
  });

  it("excludes slots that overlap time off", () => {
    const slots = getAvailableSlots({
      date: DATE,
      serviceDurationMinutes: 30,
      scheduleRules: [{ weekday: WEEKDAY, startTime: "09:00", endTime: "10:30" }],
      timeOff: [{ startAt: at("00:00"), endAt: at("23:59") }],
      bookedAppointments: [],
      slotIntervalMinutes: 30,
      now: FAR_PAST,
    });
    expect(slots).toEqual([]);
  });

  it("excludes slots that have already passed today", () => {
    const slots = getAvailableSlots({
      date: DATE,
      serviceDurationMinutes: 30,
      scheduleRules: [{ weekday: WEEKDAY, startTime: "09:00", endTime: "11:00" }],
      timeOff: [],
      bookedAppointments: [],
      slotIntervalMinutes: 30,
      now: at("10:05"),
    });
    expect(slots.map((s) => s.toTimeString().slice(0, 5))).toEqual(["10:30"]);
  });

  it("does not offer a slot that would run past the end of the working window", () => {
    const slots = getAvailableSlots({
      date: DATE,
      serviceDurationMinutes: 45,
      scheduleRules: [{ weekday: WEEKDAY, startTime: "09:00", endTime: "10:00" }],
      timeOff: [],
      bookedAppointments: [],
      slotIntervalMinutes: 30,
      now: FAR_PAST,
    });
    // 09:00+45=09:45 fits; 09:30+45=10:15 does not (window ends 10:00)
    expect(slots.map((s) => s.toTimeString().slice(0, 5))).toEqual(["09:00"]);
  });
});
