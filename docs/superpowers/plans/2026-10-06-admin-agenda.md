# Admin Agenda Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/admin/agenda`, a day-by-day view (one column per barber) where the owner marks appointments as concluído/faltou/cancelado and creates walk-in (avulso) appointments by clicking a free slot.

**Architecture:** A new pure module (`lib/day-agenda.ts`) merges a barber's working-hour windows with that day's appointments (any status) into a chronological list of appointment-blocks and free-slots. `lib/admin-data.ts` fetches the Supabase data and feeds it into that pure function per barber. The appointment-creation logic already in `app/agendar/actions.ts` is extracted into a shared `lib/appointments-server.ts` module so the public booking flow and the new admin walk-in flow run through the exact same conflict-checking code, just with a different `origin` value. Status changes and walk-in creation are plain Next.js Server Actions wired to `<form action={...}>` — no client-side form state needed except the walk-in modal's open/closed state and its three input fields.

**Tech Stack:** Next.js 16 App Router (Server Components + Server Actions), Supabase (Postgres + Auth, via `@supabase/ssr` for the authenticated client and `@supabase/supabase-js` for the service-role client), Tailwind CSS v4, Vitest.

## Global Constraints

- Follow the existing design tokens exactly: `bg-ink`, `text-paper`, `text-paper-dim`, `text-gold`, `border-ink-line`, `border-ink-line-strong`, `bg-ink-raised`, `text-danger`, `font-display`, `rounded-sm` — do not invent new colors or spacing scales.
- Every Server Action that mutates data must re-check `supabase.auth.getUser()` itself — render-time gating (the layout's redirect) is not a security boundary for a POST-reachable action (per `node_modules/next/dist/docs/01-app/02-guides/server-actions.md`, "Security" section).
- No bypass of slot-conflict validation for walk-ins: reuse the same `resolveAndCreateAppointment` path the public flow uses, never a separate "forced" insert.
- `date` values are always `YYYY-MM-DD` strings validated with `/^\d{4}-\d{2}-\d{2}$/` before use, matching the existing convention in `app/agendar/actions.ts`.
- `searchParams` in `page.tsx` is a `Promise`, per this Next.js version's docs (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md`) — always `await` it.
- No new test framework or component-testing library: this codebase only unit-tests pure logic in `lib/*.ts` with Vitest (see `lib/slots.test.ts`, `lib/phone.test.ts`). New UI components are verified by type-check + manual browser check, matching existing convention (no React Testing Library present in `package.json`).
- Commit after every task, Conventional Commits style (`feat:`, `refactor:`, etc.), matching this repo's history.

---

### Task 1: Export `timeStringToDate` from `lib/slots.ts`

**Files:**
- Modify: `lib/slots.ts:65-70`

**Interfaces:**
- Produces: `export function timeStringToDate(date: Date, time: string): Date` — converts a `"HH:MM"` or `"HH:MM:SS"` string into a `Date` on the given calendar day. Used by `lib/admin-data.ts` in Task 4.

- [ ] **Step 1: Export the existing helper**

In `lib/slots.ts`, change:

```ts
function timeStringToDate(date: Date, time: string): Date {
```

to:

```ts
export function timeStringToDate(date: Date, time: string): Date {
```

No other code in the file changes.

- [ ] **Step 2: Run the existing test suite to confirm nothing broke**

Run: `npm test`
Expected: PASS (all existing `lib/slots.test.ts` and `lib/phone.test.ts` tests still pass — this is a pure export change, no behavior change).

- [ ] **Step 3: Commit**

```bash
git add lib/slots.ts
git commit -m "refactor: export timeStringToDate for reuse in admin agenda"
```

---

### Task 2: `lib/day-agenda.ts` — pure day-timeline builder

**Files:**
- Create: `lib/day-agenda.ts`
- Test: `lib/day-agenda.test.ts`

**Interfaces:**
- Produces:
  - `export type AgendaStatus = "agendado" | "concluido" | "cancelado" | "faltou"`
  - `export type AgendaOrigin = "online" | "avulso"`
  - `export type AgendaAppointment = { id: string; startsAt: Date; endsAt: Date; clientName: string; serviceName: string; serviceId: string; status: AgendaStatus; origin: AgendaOrigin }`
  - `export type AgendaSlot = { type: "appointment"; time: Date; appointment: AgendaAppointment } | { type: "free"; time: Date }`
  - `export type WorkWindow = { start: Date; end: Date }`
  - `export function buildDayTimeline(params: { workWindows: WorkWindow[]; appointments: AgendaAppointment[]; slotIntervalMinutes?: number }): AgendaSlot[]`
- Consumed by: `lib/admin-data.ts` (Task 4) and `components/admin/AgendaBoard.tsx` (Task 8, via the `BarberDayColumn` type built on `AgendaSlot`).

- [ ] **Step 1: Write the failing tests**

Create `lib/day-agenda.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/day-agenda.test.ts`
Expected: FAIL with "Cannot find module './day-agenda'" (the file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `lib/day-agenda.ts`:

```ts
export type AgendaStatus = "agendado" | "concluido" | "cancelado" | "faltou";
export type AgendaOrigin = "online" | "avulso";

export type AgendaAppointment = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  clientName: string;
  serviceName: string;
  serviceId: string;
  status: AgendaStatus;
  origin: AgendaOrigin;
};

export type AgendaSlot =
  | { type: "appointment"; time: Date; appointment: AgendaAppointment }
  | { type: "free"; time: Date };

export type WorkWindow = { start: Date; end: Date };

export function buildDayTimeline(params: {
  workWindows: WorkWindow[];
  appointments: AgendaAppointment[];
  slotIntervalMinutes?: number;
}): AgendaSlot[] {
  const { workWindows, appointments, slotIntervalMinutes = 15 } = params;
  const intervalMs = slotIntervalMinutes * 60_000;

  const appointmentSlots: AgendaSlot[] = appointments.map((appointment) => ({
    type: "appointment",
    time: appointment.startsAt,
    appointment,
  }));

  const freeSlots: AgendaSlot[] = [];
  for (const window of workWindows) {
    for (
      let tick = new Date(window.start);
      tick.getTime() < window.end.getTime();
      tick = new Date(tick.getTime() + intervalMs)
    ) {
      const covered = appointments.some(
        (a) => a.startsAt.getTime() <= tick.getTime() && a.endsAt.getTime() > tick.getTime()
      );
      if (!covered) freeSlots.push({ type: "free", time: new Date(tick) });
    }
  }

  return [...appointmentSlots, ...freeSlots].sort(
    (a, b) => a.time.getTime() - b.time.getTime()
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/day-agenda.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/day-agenda.ts lib/day-agenda.test.ts
git commit -m "feat: add buildDayTimeline for merging barber schedules and appointments"
```

---

### Task 3: Extract shared appointment-creation logic into `lib/appointments-server.ts`

**Files:**
- Create: `lib/appointments-server.ts`
- Modify: `app/agendar/actions.ts` (full rewrite, same exported signatures)

**Interfaces:**
- Produces:
  - `export const SLOT_INTERVAL_MINUTES = 15`
  - `export type AdminClient = ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>`
  - `export async function getCandidateBarberIds(admin: AdminClient, barberId: string): Promise<string[]>`
  - `export async function computeBarberSlots(admin: AdminClient, barberId: string, date: string, durationMinutes: number): Promise<Date[]>`
  - `export type CreateAppointmentResult = { success: true; summary: { serviceName: string; barberName: string; startsAt: string } } | { success: false; error: string }`
  - `export async function resolveAndCreateAppointment(input: { serviceId: string; barberId: string; startsAtIso: string; name: string; phone: string; origin: "online" | "avulso" }): Promise<CreateAppointmentResult>`
- Consumed by: `app/agendar/actions.ts` (this task) and `app/admin/agenda/actions.ts` (Task 5).

This is a pure extraction — the logic is unchanged, only relocated and parameterized by `origin`. There is no new behavior to unit-test; correctness is verified by the public booking flow's existing behavior staying identical (confirmed via type-check and a manual re-check of `/agendar` at the end of this task).

- [ ] **Step 1: Create the shared module**

Create `lib/appointments-server.ts`:

```ts
import { createAdminClient } from "@/lib/supabase/admin";
import { getAvailableSlots as calculateAvailableSlots } from "@/lib/slots";
import { normalizePhone } from "@/lib/phone";

export const SLOT_INTERVAL_MINUTES = 15;

export type AdminClient = ReturnType<typeof createAdminClient>;

export async function getCandidateBarberIds(
  admin: AdminClient,
  barberId: string
): Promise<string[]> {
  if (barberId !== "any") return [barberId];
  const { data } = await admin.from("barbers").select("id").eq("active", true);
  return (data ?? []).map((b) => b.id);
}

export async function computeBarberSlots(
  admin: AdminClient,
  barberId: string,
  date: string,
  durationMinutes: number
): Promise<Date[]> {
  const dayStart = new Date(`${date}T00:00:00`);
  const dayEnd = new Date(`${date}T23:59:59.999`);

  const [{ data: rules }, { data: timeOff }, { data: appointments }] = await Promise.all([
    admin
      .from("barber_schedules")
      .select("weekday, start_time, end_time")
      .eq("barber_id", barberId)
      .eq("weekday", dayStart.getDay()),
    admin
      .from("barber_time_off")
      .select("start_at, end_at")
      .eq("barber_id", barberId)
      .lte("start_at", dayEnd.toISOString())
      .gte("end_at", dayStart.toISOString()),
    admin
      .from("appointments")
      .select("starts_at, ends_at")
      .eq("barber_id", barberId)
      .eq("status", "agendado")
      .gte("starts_at", dayStart.toISOString())
      .lte("starts_at", dayEnd.toISOString()),
  ]);

  return calculateAvailableSlots({
    date: dayStart,
    serviceDurationMinutes: durationMinutes,
    scheduleRules: (rules ?? []).map((r) => ({
      weekday: r.weekday,
      startTime: r.start_time,
      endTime: r.end_time,
    })),
    timeOff: (timeOff ?? []).map((t) => ({
      startAt: new Date(t.start_at),
      endAt: new Date(t.end_at),
    })),
    bookedAppointments: (appointments ?? []).map((a) => ({
      startAt: new Date(a.starts_at),
      endAt: new Date(a.ends_at),
    })),
    slotIntervalMinutes: SLOT_INTERVAL_MINUTES,
  });
}

export type CreateAppointmentResult =
  | { success: true; summary: { serviceName: string; barberName: string; startsAt: string } }
  | { success: false; error: string };

export async function resolveAndCreateAppointment(input: {
  serviceId: string;
  barberId: string;
  startsAtIso: string;
  name: string;
  phone: string;
  origin: "online" | "avulso";
}): Promise<CreateAppointmentResult> {
  const admin = createAdminClient();

  const { data: service } = await admin
    .from("services")
    .select("name, duration_minutes")
    .eq("id", input.serviceId)
    .eq("active", true)
    .maybeSingle();

  if (!service) {
    return { success: false, error: "Serviço inválido." };
  }

  const startsAt = new Date(input.startsAtIso);
  const endsAt = new Date(startsAt.getTime() + service.duration_minutes * 60_000);
  const date = input.startsAtIso.slice(0, 10);

  const candidateBarberIds = await getCandidateBarberIds(admin, input.barberId);

  let chosenBarberId: string | null = null;
  for (const barberId of candidateBarberIds) {
    const slots = await computeBarberSlots(admin, barberId, date, service.duration_minutes);
    if (slots.some((slot) => slot.toISOString() === startsAt.toISOString())) {
      chosenBarberId = barberId;
      break;
    }
  }

  if (!chosenBarberId) {
    return {
      success: false,
      error: "Esse horário não está mais disponível. Escolha outro horário.",
    };
  }

  const normalizedPhone = normalizePhone(input.phone);

  const { data: existingClient } = await admin
    .from("clients")
    .select("id, name")
    .eq("phone", normalizedPhone)
    .maybeSingle();

  let clientId: string;
  if (existingClient) {
    clientId = existingClient.id;
    if (existingClient.name !== input.name) {
      await admin.from("clients").update({ name: input.name }).eq("id", clientId);
    }
  } else {
    const { data: newClient, error: clientError } = await admin
      .from("clients")
      .insert({ name: input.name, phone: normalizedPhone })
      .select("id")
      .single();

    if (clientError || !newClient) {
      return { success: false, error: "Não foi possível salvar seus dados. Tente novamente." };
    }
    clientId = newClient.id;
  }

  const { error: appointmentError } = await admin.from("appointments").insert({
    client_id: clientId,
    barber_id: chosenBarberId,
    service_id: input.serviceId,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    status: "agendado",
    origin: input.origin,
  });

  if (appointmentError) {
    if (appointmentError.code === "23P01") {
      return {
        success: false,
        error: "Esse horário acabou de ser reservado por outra pessoa. Escolha outro horário.",
      };
    }
    return { success: false, error: "Não foi possível criar o agendamento. Tente novamente." };
  }

  const { data: barber } = await admin
    .from("barbers")
    .select("name")
    .eq("id", chosenBarberId)
    .single();

  return {
    success: true,
    summary: {
      serviceName: service.name,
      barberName: barber?.name ?? "Equipe",
      startsAt: startsAt.toISOString(),
    },
  };
}
```

- [ ] **Step 2: Rewrite `app/agendar/actions.ts` to use the shared module**

Replace the full contents of `app/agendar/actions.ts` with:

```ts
"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  computeBarberSlots,
  getCandidateBarberIds,
  resolveAndCreateAppointment,
  type CreateAppointmentResult,
} from "@/lib/appointments-server";

export async function getAvailableSlots(input: {
  serviceId: string;
  barberId: string;
  date: string;
}): Promise<{ time: string }[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return [];

  const admin = createAdminClient();

  const { data: service } = await admin
    .from("services")
    .select("duration_minutes")
    .eq("id", input.serviceId)
    .eq("active", true)
    .maybeSingle();

  if (!service) return [];

  const barberIds = await getCandidateBarberIds(admin, input.barberId);
  const slotSets = await Promise.all(
    barberIds.map((id) => computeBarberSlots(admin, id, input.date, service.duration_minutes))
  );

  const uniqueTimes = new Set<string>();
  for (const slots of slotSets) {
    for (const slot of slots) uniqueTimes.add(slot.toISOString());
  }

  return Array.from(uniqueTimes)
    .sort()
    .map((time) => ({ time }));
}

export type { CreateAppointmentResult };

export async function createAppointment(input: {
  serviceId: string;
  barberId: string;
  startsAtIso: string;
  name: string;
  phone: string;
}): Promise<CreateAppointmentResult> {
  return resolveAndCreateAppointment({ ...input, origin: "online" });
}
```

- [ ] **Step 3: Run the full test suite and type-check**

Run: `npm test && npx tsc --noEmit`
Expected: PASS — `lib/slots.test.ts`, `lib/phone.test.ts`, and `lib/day-agenda.test.ts` all pass; no type errors. `app/agendar/actions.ts` no longer defines `computeBarberSlots`/`getCandidateBarberIds` itself, so a type error here means an import or signature drifted during the rewrite.

- [ ] **Step 4: Manually re-verify the public booking flow still works**

Run: `npm run dev`, open `http://localhost:3000/agendar`, pick a service, barber, date and time, and submit with a test name/phone. Expected: same confirmation screen as before this refactor (the behavior is unchanged — only the code location moved).

- [ ] **Step 5: Commit**

```bash
git add lib/appointments-server.ts app/agendar/actions.ts
git commit -m "refactor: extract appointment creation into lib/appointments-server for reuse"
```

---

### Task 4: `getDayAgenda` in `lib/admin-data.ts`

**Files:**
- Modify: `lib/admin-data.ts` (add imports, types, and function — existing `getMonthSummary`/`getUpcomingAppointments` untouched)

**Interfaces:**
- Consumes: `buildDayTimeline`, `AgendaAppointment`, `AgendaSlot`, `AgendaStatus`, `AgendaOrigin` from `lib/day-agenda.ts` (Task 2); `timeStringToDate` from `lib/slots.ts` (Task 1).
- Produces:
  - `export type BarberDayColumn = { barberId: string; barberName: string; hasScheduleToday: boolean; slots: AgendaSlot[] }`
  - `export type DayAgenda = { date: string; barbers: BarberDayColumn[] }`
  - `export async function getDayAgenda(date: string): Promise<DayAgenda>`
- Consumed by: `app/admin/agenda/page.tsx` (Task 9).

No automated test for this function: it's a thin Supabase-fetching wrapper around the already-tested `buildDayTimeline`, matching this codebase's convention of only unit-testing pure `lib/*.ts` logic (see `lib/slots.ts` vs. the untested `lib/admin-data.ts` functions that already exist).

- [ ] **Step 1: Add the imports**

At the top of `lib/admin-data.ts`, add to the existing `import { createClient } from "@/lib/supabase/server";` line's block:

```ts
import { createClient } from "@/lib/supabase/server";
import { buildDayTimeline, type AgendaAppointment, type AgendaSlot, type AgendaStatus, type AgendaOrigin } from "@/lib/day-agenda";
import { timeStringToDate } from "@/lib/slots";
```

- [ ] **Step 2: Append the new types and function**

At the end of `lib/admin-data.ts`, add:

```ts
export type BarberDayColumn = {
  barberId: string;
  barberName: string;
  hasScheduleToday: boolean;
  slots: AgendaSlot[];
};

export type DayAgenda = {
  date: string;
  barbers: BarberDayColumn[];
};

export async function getDayAgenda(date: string): Promise<DayAgenda> {
  const supabase = await createClient();
  const dayStart = new Date(`${date}T00:00:00`);
  const dayEnd = new Date(`${date}T23:59:59.999`);
  const weekday = dayStart.getDay();

  const [{ data: barbers }, { data: schedules }, { data: appointments }, { data: services }, { data: clients }] =
    await Promise.all([
      supabase.from("barbers").select("id, name").eq("active", true).order("name"),
      supabase
        .from("barber_schedules")
        .select("barber_id, start_time, end_time")
        .eq("weekday", weekday),
      supabase
        .from("appointments")
        .select("id, barber_id, service_id, client_id, starts_at, ends_at, status, origin")
        .gte("starts_at", dayStart.toISOString())
        .lte("starts_at", dayEnd.toISOString()),
      supabase.from("services").select("id, name"),
      supabase.from("clients").select("id, name"),
    ]);

  const serviceById = new Map((services ?? []).map((s) => [s.id, s.name]));
  const clientById = new Map((clients ?? []).map((c) => [c.id, c.name]));

  const windowsByBarber = new Map<string, { start: Date; end: Date }[]>();
  for (const rule of schedules ?? []) {
    const list = windowsByBarber.get(rule.barber_id) ?? [];
    list.push({
      start: timeStringToDate(dayStart, rule.start_time),
      end: timeStringToDate(dayStart, rule.end_time),
    });
    windowsByBarber.set(rule.barber_id, list);
  }

  const appointmentsByBarber = new Map<string, AgendaAppointment[]>();
  for (const appt of appointments ?? []) {
    const list = appointmentsByBarber.get(appt.barber_id) ?? [];
    list.push({
      id: appt.id,
      startsAt: new Date(appt.starts_at),
      endsAt: new Date(appt.ends_at),
      clientName: clientById.get(appt.client_id) ?? "—",
      serviceName: serviceById.get(appt.service_id) ?? "—",
      serviceId: appt.service_id,
      status: appt.status as AgendaStatus,
      origin: appt.origin as AgendaOrigin,
    });
    appointmentsByBarber.set(appt.barber_id, list);
  }

  return {
    date,
    barbers: (barbers ?? []).map((barber) => {
      const windows = windowsByBarber.get(barber.id) ?? [];
      return {
        barberId: barber.id,
        barberName: barber.name,
        hasScheduleToday: windows.length > 0,
        slots: buildDayTimeline({
          workWindows: windows,
          appointments: appointmentsByBarber.get(barber.id) ?? [],
        }),
      };
    }),
  };
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 4: Commit**

```bash
git add lib/admin-data.ts
git commit -m "feat: add getDayAgenda to admin data layer"
```

---

### Task 5: `app/admin/agenda/actions.ts` — status update and walk-in creation

**Files:**
- Create: `app/admin/agenda/actions.ts`

**Interfaces:**
- Consumes: `resolveAndCreateAppointment`, `CreateAppointmentResult` from `lib/appointments-server.ts` (Task 3); `createClient` from `lib/supabase/server.ts`.
- Produces:
  - `export async function updateAppointmentStatus(appointmentId: string, status: "concluido" | "faltou" | "cancelado"): Promise<void>`
  - `export async function createWalkInAppointment(input: { serviceId: string; barberId: string; startsAtIso: string; name: string; phone: string }): Promise<CreateAppointmentResult>`
- Consumed by: `components/admin/AppointmentCard.tsx` (Task 6) and `components/admin/WalkInForm.tsx` (Task 7).

- [ ] **Step 1: Create the actions file**

Create `app/admin/agenda/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  resolveAndCreateAppointment,
  type CreateAppointmentResult,
} from "@/lib/appointments-server";

async function requireAdmin(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
}

export async function updateAppointmentStatus(
  appointmentId: string,
  status: "concluido" | "faltou" | "cancelado"
): Promise<void> {
  await requireAdmin();
  const supabase = await createClient();
  await supabase
    .from("appointments")
    .update({ status })
    .eq("id", appointmentId)
    .eq("status", "agendado");
  revalidatePath("/admin/agenda");
}

export type { CreateAppointmentResult };

export async function createWalkInAppointment(input: {
  serviceId: string;
  barberId: string;
  startsAtIso: string;
  name: string;
  phone: string;
}): Promise<CreateAppointmentResult> {
  await requireAdmin();
  const result = await resolveAndCreateAppointment({ ...input, origin: "avulso" });
  if (result.success) revalidatePath("/admin/agenda");
  return result;
}
```

Note the `.eq("status", "agendado")` on the update: this enforces the one-way status transition from the design (only an `agendado` appointment can be moved to another status). If the row was already changed by a concurrent request, the update silently matches zero rows — acceptable here since the UI re-renders from fresh data after `revalidatePath` either way.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/admin/agenda/actions.ts
git commit -m "feat: add admin agenda server actions for status updates and walk-ins"
```

---

### Task 6: `components/admin/AppointmentCard.tsx`

**Files:**
- Create: `components/admin/AppointmentCard.tsx`

**Interfaces:**
- Consumes: `AgendaAppointment` from `lib/day-agenda.ts` (Task 2); `updateAppointmentStatus` from `app/admin/agenda/actions.ts` (Task 5).
- Produces: `export function AppointmentCard({ appointment }: { appointment: AgendaAppointment }): JSX.Element`
- Consumed by: `components/admin/AgendaBoard.tsx` (Task 8).

- [ ] **Step 1: Create the component**

Create `components/admin/AppointmentCard.tsx`:

```tsx
import { updateAppointmentStatus } from "@/app/admin/agenda/actions";
import type { AgendaAppointment } from "@/lib/day-agenda";

const STATUS_LABEL: Record<AgendaAppointment["status"], string> = {
  agendado: "Agendado",
  concluido: "Concluído",
  faltou: "Faltou",
  cancelado: "Cancelado",
};

function formatTime(date: Date): string {
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function AppointmentCard({ appointment }: { appointment: AgendaAppointment }) {
  return (
    <div className="rounded-sm border border-ink-line bg-ink-raised px-3 py-2.5 text-sm">
      <div className="flex items-center justify-between">
        <span className="text-paper">{formatTime(appointment.startsAt)}</span>
        {appointment.origin === "avulso" && (
          <span className="text-xs uppercase tracking-[0.1em] text-paper-dim">
            Avulso
          </span>
        )}
      </div>
      <p className="mt-1 text-paper">{appointment.clientName}</p>
      <p className="text-xs text-paper-dim">{appointment.serviceName}</p>

      {appointment.status === "agendado" ? (
        <div className="mt-2.5 flex gap-2">
          <form action={updateAppointmentStatus.bind(null, appointment.id, "concluido")}>
            <button
              type="submit"
              className="rounded-sm border border-ink-line px-2 py-1 text-xs text-paper transition-colors hover:border-gold hover:text-gold"
            >
              ✓ Concluído
            </button>
          </form>
          <form action={updateAppointmentStatus.bind(null, appointment.id, "faltou")}>
            <button
              type="submit"
              className="rounded-sm border border-ink-line px-2 py-1 text-xs text-paper transition-colors hover:border-ink-line-strong"
            >
              ✗ Faltou
            </button>
          </form>
          <form action={updateAppointmentStatus.bind(null, appointment.id, "cancelado")}>
            <button
              type="submit"
              className="rounded-sm border border-ink-line px-2 py-1 text-xs text-danger transition-colors hover:border-danger"
            >
              ✕ Cancelar
            </button>
          </form>
        </div>
      ) : (
        <p className="mt-2.5 text-xs text-paper-dim">{STATUS_LABEL[appointment.status]}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/admin/AppointmentCard.tsx
git commit -m "feat: add AppointmentCard with inline status actions"
```

---

### Task 7: `components/admin/WalkInForm.tsx`

**Files:**
- Create: `components/admin/WalkInForm.tsx`

**Interfaces:**
- Consumes: `createWalkInAppointment` from `app/admin/agenda/actions.ts` (Task 5); `Tables<"services">` from `lib/database.types.ts`; `formatDuration`, `formatPriceBRL` from `lib/format.ts`.
- Produces: `export function WalkInForm({ barberId, barberName, time, services, onClose }: { barberId: string; barberName: string; time: Date; services: Tables<"services">[]; onClose: () => void }): JSX.Element`
- Consumed by: `components/admin/AgendaBoard.tsx` (Task 8).

- [ ] **Step 1: Create the component**

Create `components/admin/WalkInForm.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import type { Tables } from "@/lib/database.types";
import { createWalkInAppointment } from "@/app/admin/agenda/actions";
import { formatDuration, formatPriceBRL } from "@/lib/format";

export function WalkInForm({
  barberId,
  barberName,
  time,
  services,
  onClose,
}: {
  barberId: string;
  barberName: string;
  time: Date;
  services: Tables<"services">[];
  onClose: () => void;
}) {
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    if (!serviceId) return;

    setError(null);
    startTransition(async () => {
      const result = await createWalkInAppointment({
        serviceId,
        barberId,
        startsAtIso: time.toISOString(),
        name,
        phone,
      });

      if (result.success) {
        onClose();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 px-4">
      <div className="w-full max-w-sm rounded-sm border border-ink-line bg-ink p-6">
        <h2 className="font-display text-lg text-paper">Agendamento avulso</h2>
        <p className="mt-1 text-sm text-paper-dim">
          {barberName} ·{" "}
          {time.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-3">
          <select
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
            required
            className="w-full rounded-sm border border-ink-line bg-transparent px-3 py-2.5 text-sm text-paper focus:border-gold"
          >
            {services.map((service) => (
              <option key={service.id} value={service.id} className="bg-ink">
                {service.name} · {formatDuration(service.duration_minutes)} ·{" "}
                {formatPriceBRL(service.price_cents)}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Nome"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-sm border border-ink-line bg-transparent px-3 py-2.5 text-sm text-paper placeholder:text-paper-dim focus:border-gold"
          />
          <input
            type="tel"
            placeholder="Telefone"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-sm border border-ink-line bg-transparent px-3 py-2.5 text-sm text-paper placeholder:text-paper-dim focus:border-gold"
          />
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-sm border border-ink-line py-2.5 text-sm text-paper-dim transition-colors hover:text-paper"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending || !serviceId}
              className="flex-1 rounded-sm bg-gold py-2.5 text-sm font-semibold text-gold-ink transition-colors hover:bg-gold-bright disabled:opacity-40"
            >
              {isPending ? "Criando..." : "Criar agendamento"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/admin/WalkInForm.tsx
git commit -m "feat: add WalkInForm modal for creating avulso appointments"
```

---

### Task 8: `components/admin/AgendaBoard.tsx`

**Files:**
- Create: `components/admin/AgendaBoard.tsx`

**Interfaces:**
- Consumes: `BarberDayColumn` from `lib/admin-data.ts` (Task 4); `Tables<"services">` from `lib/database.types.ts`; `AppointmentCard` (Task 6); `WalkInForm` (Task 7).
- Produces: `export function AgendaBoard({ barbers, services }: { barbers: BarberDayColumn[]; services: Tables<"services">[] }): JSX.Element`
- Consumed by: `app/admin/agenda/page.tsx` (Task 9).

- [ ] **Step 1: Create the component**

Create `components/admin/AgendaBoard.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { Tables } from "@/lib/database.types";
import type { BarberDayColumn } from "@/lib/admin-data";
import { AppointmentCard } from "./AppointmentCard";
import { WalkInForm } from "./WalkInForm";

type OpenSlot = { barberId: string; barberName: string; time: Date };

export function AgendaBoard({
  barbers,
  services,
}: {
  barbers: BarberDayColumn[];
  services: Tables<"services">[];
}) {
  const [openSlot, setOpenSlot] = useState<OpenSlot | null>(null);

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {barbers.map((barber) => (
        <section key={barber.barberId}>
          <h2 className="text-xs uppercase tracking-[0.2em] text-paper-dim">
            {barber.barberName}
          </h2>

          {!barber.hasScheduleToday ? (
            <p className="mt-4 text-sm text-paper-dim">Fechado hoje.</p>
          ) : (
            <div className="mt-4 space-y-2">
              {barber.slots.map((slot) =>
                slot.type === "appointment" ? (
                  <AppointmentCard key={slot.appointment.id} appointment={slot.appointment} />
                ) : (
                  <button
                    key={slot.time.toISOString()}
                    type="button"
                    onClick={() =>
                      setOpenSlot({
                        barberId: barber.barberId,
                        barberName: barber.barberName,
                        time: slot.time,
                      })
                    }
                    className="block w-full rounded-sm border border-dashed border-ink-line px-3 py-2 text-left text-sm text-paper-dim transition-colors hover:border-gold hover:text-gold"
                  >
                    {slot.time.toLocaleTimeString("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    · livre
                  </button>
                )
              )}
            </div>
          )}
        </section>
      ))}

      {openSlot && (
        <WalkInForm
          barberId={openSlot.barberId}
          barberName={openSlot.barberName}
          time={openSlot.time}
          services={services}
          onClose={() => setOpenSlot(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/admin/AgendaBoard.tsx
git commit -m "feat: add AgendaBoard to orchestrate barber columns and walk-in modal"
```

---

### Task 9: `app/admin/agenda/page.tsx` and `DayNav.tsx`

**Files:**
- Create: `app/admin/agenda/DayNav.tsx`
- Create: `app/admin/agenda/page.tsx`

**Interfaces:**
- Consumes: `getDayAgenda` from `lib/admin-data.ts` (Task 4); `getActiveServices` from `lib/site-data.ts`; `AgendaBoard` from `components/admin/AgendaBoard.tsx` (Task 8).
- Produces: `export function DayNav({ date }: { date: string }): JSX.Element`; the `/admin/agenda` route itself (default export, no other module imports it directly).

- [ ] **Step 1: Create `DayNav.tsx`**

Create `app/admin/agenda/DayNav.tsx`:

```tsx
import Link from "next/link";

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function DayNav({ date }: { date: string }) {
  const label = new Date(`${date}T00:00:00`).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });

  return (
    <div className="flex items-center justify-between border-y border-ink-line py-3">
      <Link
        href={`/admin/agenda?date=${shiftDate(date, -1)}`}
        className="text-sm text-paper-dim transition-colors hover:text-paper"
      >
        ← Anterior
      </Link>
      <span className="font-display text-paper capitalize">{label}</span>
      <Link
        href={`/admin/agenda?date=${shiftDate(date, 1)}`}
        className="text-sm text-paper-dim transition-colors hover:text-paper"
      >
        Próximo →
      </Link>
    </div>
  );
}
```

- [ ] **Step 2: Create `page.tsx`**

Create `app/admin/agenda/page.tsx`:

```tsx
import { getDayAgenda } from "@/lib/admin-data";
import { getActiveServices } from "@/lib/site-data";
import { AgendaBoard } from "@/components/admin/AgendaBoard";
import { DayNav } from "./DayNav";

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const params = await searchParams;
  const date =
    params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : todayIsoDate();

  const [agenda, services] = await Promise.all([getDayAgenda(date), getActiveServices()]);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="font-display text-2xl text-paper">Agenda</h1>
        <p className="mt-1 text-sm text-paper-dim">Agendamentos do dia, por barbeiro.</p>
      </div>

      <DayNav date={date} />

      <AgendaBoard barbers={agenda.barbers} services={services} />
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/admin/agenda/DayNav.tsx app/admin/agenda/page.tsx
git commit -m "feat: add /admin/agenda page with day navigation"
```

---

### Task 10: Add navigation links in `app/admin/layout.tsx`

**Files:**
- Modify: `app/admin/layout.tsx`

**Interfaces:**
- No new exports; this task only adds `<Link>` elements so `/admin/agenda` is reachable from the UI.

- [ ] **Step 1: Add the nav links**

Replace the full contents of `app/admin/layout.tsx` with:

```tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";
import { ScissorsMark } from "@/components/site/ScissorsMark";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin-login");
  }

  return (
    <div className="min-h-screen bg-ink text-paper">
      <header className="flex items-center justify-between border-b border-ink-line px-6 py-4">
        <span className="flex items-center gap-2.5 font-display text-base">
          <ScissorsMark className="h-5 w-5 text-gold" />
          Painel administrativo
        </span>
        <nav className="flex items-center gap-6">
          <Link
            href="/admin"
            className="text-sm text-paper-dim transition-colors hover:text-paper"
          >
            Dashboard
          </Link>
          <Link
            href="/admin/agenda"
            className="text-sm text-paper-dim transition-colors hover:text-paper"
          >
            Agenda
          </Link>
          <form action={signOut}>
            <button
              type="submit"
              className="text-sm text-paper-dim transition-colors hover:text-paper"
            >
              Sair
            </button>
          </form>
        </nav>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS, no errors.

- [ ] **Step 3: Commit**

```bash
git add app/admin/layout.tsx
git commit -m "feat: add Agenda link to admin nav"
```

---

### Task 11: Manual verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full automated suite one more time**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 2: Manually verify the three flows in the browser**

Run: `npm run dev`, log into `/admin-login`, then:

1. Go to `/admin/agenda`. Confirm each active barber shows a column with either "Fechado hoje" or a mix of appointment cards and "livre" rows, and that ← Anterior / Próximo → change the date in the URL and the data shown.
2. Click a "livre" row. Confirm the walk-in modal opens with the right barber name and time, pick a service, fill name/phone, submit. Confirm the modal closes and the new appointment appears as a card in the right column with the "Avulso" badge.
3. On an `agendado` card, click "✓ Concluído". Confirm the card switches to showing "Concluído" with no more action buttons, and that `/admin` (Dashboard) now reflects it in "Faturamento" and "Atendimentos concluídos" for the current month.
4. Try to create a second walk-in at the exact same time/barber as an existing appointment (edit the time manually is not possible from the UI, so instead: open two browser tabs on the same free slot, submit both) — confirm the second submission shows the "Esse horário não está mais disponível" or the concurrent-booking error instead of creating an overlapping appointment.

- [ ] **Step 3: Report any discrepancy before moving on**

If any of the four checks in Step 2 fail, stop and fix the relevant task before considering this plan complete — do not patch around it with a workaround that wasn't in the design.
