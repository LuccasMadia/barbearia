import { describe, it, expect } from "vitest";
import { estimateWaitMinutes } from "./queue-wait";

const NOW = new Date("2026-10-07T10:00:00");

function minutesFromNow(minutes: number): Date {
  return new Date(NOW.getTime() + minutes * 60_000);
}

describe("estimateWaitMinutes", () => {
  it("returns 0 when the target's barber is free and no one is waiting ahead", () => {
    const result = estimateWaitMinutes({
      now: NOW,
      barbers: [{ barberId: "b1", freeAt: NOW }],
      waitingAhead: [],
      target: { entryId: "t", barberId: null, durationMinutes: 20 },
    });
    expect(result).toBe(0);
  });

  it("returns the barber's remaining busy time when there is no one waiting ahead", () => {
    const result = estimateWaitMinutes({
      now: NOW,
      barbers: [{ barberId: "b1", freeAt: minutesFromNow(10) }],
      waitingAhead: [],
      target: { entryId: "t", barberId: null, durationMinutes: 20 },
    });
    expect(result).toBe(10);
  });

  it("stacks the duration of each compatible entry ahead onto the same barber", () => {
    const result = estimateWaitMinutes({
      now: NOW,
      barbers: [{ barberId: "b1", freeAt: NOW }],
      waitingAhead: [
        { entryId: "a", barberId: null, durationMinutes: 15 },
        { entryId: "b", barberId: null, durationMinutes: 25 },
      ],
      target: { entryId: "t", barberId: null, durationMinutes: 20 },
    });
    expect(result).toBe(40);
  });

  it("assigns each 'any' entry to whichever barber frees up earliest", () => {
    const result = estimateWaitMinutes({
      now: NOW,
      barbers: [
        { barberId: "a", freeAt: minutesFromNow(5) },
        { barberId: "b", freeAt: NOW },
      ],
      waitingAhead: [
        { entryId: "1", barberId: null, durationMinutes: 20 },
        { entryId: "2", barberId: null, durationMinutes: 20 },
      ],
      target: { entryId: "t", barberId: null, durationMinutes: 1 },
    });
    // entry1 -> barber b (free now) -> b busy until +20
    // entry2 -> barber a (free at +5) -> a busy until +25
    // target (any) -> earliest of {a: +25, b: +20} = +20
    expect(result).toBe(20);
  });

  it("only counts entries ahead that share the target's specific barber preference", () => {
    const result = estimateWaitMinutes({
      now: NOW,
      barbers: [
        { barberId: "a", freeAt: NOW },
        { barberId: "b", freeAt: NOW },
      ],
      waitingAhead: [{ entryId: "1", barberId: "b", durationMinutes: 30 }],
      target: { entryId: "t", barberId: "a", durationMinutes: 1 },
    });
    expect(result).toBe(0);
  });

  it("returns null when there are no active barbers", () => {
    const result = estimateWaitMinutes({
      now: NOW,
      barbers: [],
      waitingAhead: [],
      target: { entryId: "t", barberId: null, durationMinutes: 10 },
    });
    expect(result).toBeNull();
  });

  it("returns null when the target's preferred barber doesn't exist", () => {
    const result = estimateWaitMinutes({
      now: NOW,
      barbers: [{ barberId: "a", freeAt: NOW }],
      waitingAhead: [],
      target: { entryId: "t", barberId: "ghost", durationMinutes: 10 },
    });
    expect(result).toBeNull();
  });
});
