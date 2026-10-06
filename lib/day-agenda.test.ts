import { describe, it, expect } from "vitest";
import { buildDayTimeline, type AgendaAppointment } from "./day-agenda";

const DATE = new Date("2026-10-12T00:00:00");

function at(time: string): Date {
  const [h, m] = time.split(":").map(Number);
  const d = new Date(DATE);
  d.setHours(h, m, 0, 0);
  return d;
}

function appointment(overrides: Partial<AgendaAppointment> = {}): AgendaAppointment {
  return {
    id: "appt-1",
    startsAt: at("09:00"),
    endsAt: at("09:30"),
    clientName: "João",
    serviceName: "Corte",
    serviceId: "service-1",
    status: "agendado",
    origin: "online",
    ...overrides,
  };
}

describe("buildDayTimeline", () => {
  it("returns no slots when there are no work windows", () => {
    const timeline = buildDayTimeline({ workWindows: [], appointments: [] });
    expect(timeline).toEqual([]);
  });

  it("fills the work window with free slots when there are no appointments", () => {
    const timeline = buildDayTimeline({
      workWindows: [{ start: at("09:00"), end: at("09:30") }],
      appointments: [],
      slotIntervalMinutes: 15,
    });
    expect(timeline.map((s) => s.type)).toEqual(["free", "free"]);
    expect(timeline.map((s) => s.time.toTimeString().slice(0, 5))).toEqual([
      "09:00",
      "09:15",
    ]);
  });

  it("places an appointment at its start time and excludes it from free slots", () => {
    const appt = appointment({ startsAt: at("09:00"), endsAt: at("09:30") });
    const timeline = buildDayTimeline({
      workWindows: [{ start: at("09:00"), end: at("10:00") }],
      appointments: [appt],
      slotIntervalMinutes: 15,
    });
    expect(
      timeline.map((s) => [s.type, s.time.toTimeString().slice(0, 5)])
    ).toEqual([
      ["appointment", "09:00"],
      ["free", "09:30"],
      ["free", "09:45"],
    ]);
  });

  it("keeps appointments outside work windows visible as blocks", () => {
    const appt = appointment({ startsAt: at("08:00"), endsAt: at("08:30") });
    const timeline = buildDayTimeline({
      workWindows: [{ start: at("09:00"), end: at("09:30") }],
      appointments: [appt],
    });
    expect(timeline[0]).toEqual({
      type: "appointment",
      time: at("08:00"),
      appointment: appt,
    });
  });

  it("shows overlapping appointments as separate blocks instead of dropping one", () => {
    const a = appointment({
      id: "a",
      startsAt: at("09:00"),
      endsAt: at("09:30"),
      status: "cancelado",
    });
    const b = appointment({
      id: "b",
      startsAt: at("09:00"),
      endsAt: at("09:30"),
      status: "agendado",
    });
    const timeline = buildDayTimeline({
      workWindows: [{ start: at("09:00"), end: at("09:30") }],
      appointments: [a, b],
    });
    const appointmentSlots = timeline.filter((s) => s.type === "appointment");
    expect(appointmentSlots).toHaveLength(2);
  });
});
