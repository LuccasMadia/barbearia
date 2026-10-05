# Agendamento (Plano 3/6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the public, no-login booking flow at `/agendar`: client picks a service, a barber (or "qualquer disponível"), sees real available time slots, confirms with name/phone, and gets a confirmation screen — with server-side concurrency protection so two clients can't double-book the same slot.

**Architecture:** The booking UI is a single client-side wizard component (`components/booking/BookingWizard.tsx`) that calls two Server Actions directly (`app/agendar/actions.ts`, `"use server"`). Those actions are the only place that reads/writes `barber_schedules`, `barber_time_off`, `appointments`, and `clients` — all four have zero anon RLS access (per Plan 1), so every read for slot calculation and every write for booking goes through the service-role admin client inside the Server Actions, never through the browser's anon session. Slot math itself is a pure, dependency-free function (`lib/slots.ts`) so it can be unit tested without touching the database — this is the one piece of logic the spec explicitly calls out as high-risk for subtle bugs. A Postgres exclusion constraint backs up the application-level re-check so a race between two concurrent bookings fails safely at the database layer instead of silently double-booking.

**Tech Stack:** Next.js (App Router, Server Actions, Client Component for the wizard), TypeScript, Supabase (admin/service-role client for all booking reads+writes), Vitest for unit tests.

## Global Constraints

- Repo is config-driven and reused per client: no hardcoded barbershop name/branding in code.
- Single-tenant per deployment. No tenant_id columns anywhere.
- `barber_schedules`, `barber_time_off`, `appointments`, `clients` have no anon RLS policy at all — only `lib/supabase/admin.ts` (service role, server-only) may read or write them. The browser must never see these tables through the anon client.
- No token/link-based cancellation and no automatic WhatsApp/SMS — out of scope for this plan (and for Fase 1 entirely, per spec).
- Phone number is the client's identifying key (normalized, digits only) — no login, no password.
- Weekday numbering matches JS `Date.getDay()`: `0` = Sunday … `6` = Saturday (same convention already used by Plan 1's `barber_schedules` table and seed data).

---

## File Structure

```
barbearia/
  lib/
    slots.ts                      # pure availability calculation
    slots.test.ts
    phone.ts                      # phone normalization
    phone.test.ts
    site-data.ts                  # modified: add getActiveBarbers()
  components/
    booking/
      BookingWizard.tsx           # client component, the whole booking flow
  app/
    agendar/
      actions.ts                  # Server Actions: getAvailableSlots, createAppointment
      page.tsx                    # modified: replaces Plan 2 placeholder
  supabase/
    migrations/
      0002_appointments_exclusion.sql
  package.json                     # modified: adds vitest + "test" script
```

---

### Task 1: Database-level double-booking protection

**Files:**
- Create: `supabase/migrations/0002_appointments_exclusion.sql`

**Interfaces:**
- Produces: a Postgres exclusion constraint `appointments_no_overlap` that rejects (error code `23P01`) any insert/update creating two `status = 'agendado'` appointments for the same barber with overlapping `[starts_at, ends_at)` ranges. This is the safety net behind the application-level recheck in Task 5.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0002_appointments_exclusion.sql`:

```sql
create extension if not exists btree_gist;

alter table appointments
  add constraint appointments_no_overlap
  exclude using gist (
    barber_id with =,
    tstzrange(starts_at, ends_at) with &&
  )
  where (status = 'agendado');
```

- [ ] **Step 2: Push the migration**

```bash
npx supabase db push
```

Expected: output lists `0002_appointments_exclusion.sql` as applied with no errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0002_appointments_exclusion.sql
git commit -m "feat: add exclusion constraint preventing overlapping barber appointments"
```

---

### Task 2: Phone normalization

**Files:**
- Create: `lib/phone.ts`
- Create: `lib/phone.test.ts`
- Modify: `package.json` (add `vitest` dev dependency and `test` script)

**Interfaces:**
- Produces: `normalizePhone(raw: string): string` — strips everything but digits. Used by Task 5 to key client lookups/upserts.

- [ ] **Step 1: Install Vitest**

```bash
npm install --save-dev vitest
```

- [ ] **Step 2: Add the test script**

In `package.json`, add `"test"` to the `scripts` block (alongside the existing `dev`/`build`/`start`/`lint`):

```json
"test": "vitest run"
```

- [ ] **Step 3: Write the failing tests**

Create `lib/phone.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { normalizePhone } from "./phone";

describe("normalizePhone", () => {
  it("strips formatting characters, keeping only digits", () => {
    expect(normalizePhone("(11) 99999-9999")).toBe("11999999999");
  });

  it("keeps a leading country code", () => {
    expect(normalizePhone("+55 11 99999-9999")).toBe("5511999999999");
  });

  it("is idempotent on an already-normalized number", () => {
    expect(normalizePhone("11999999999")).toBe("11999999999");
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

```bash
npx vitest run lib/phone.test.ts
```

Expected: FAIL with "Cannot find module './phone'" (or similar).

- [ ] **Step 5: Implement**

Create `lib/phone.ts`:

```ts
export function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "");
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
npx vitest run lib/phone.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add lib/phone.ts lib/phone.test.ts package.json package-lock.json
git commit -m "feat: add phone normalization helper"
```

---

### Task 3: Slot availability calculation (the spec's highest-risk logic)

**Files:**
- Create: `lib/slots.ts`
- Create: `lib/slots.test.ts`

**Interfaces:**
- Produces: `getAvailableSlots(params): Date[]` — the single source of truth for "what times can this barber be booked on this day for a service of this duration." Pure function, no I/O. Used by Task 5's Server Actions (which supply the DB-backed arguments).
  - `ScheduleRule = { weekday: number; startTime: string; endTime: string }` (`startTime`/`endTime` as `"HH:MM"` or `"HH:MM:SS"`, matching Postgres `time` columns).
  - `TimeRange = { startAt: Date; endAt: Date }`.
  - Params: `{ date: Date; serviceDurationMinutes: number; scheduleRules: ScheduleRule[]; timeOff: TimeRange[]; bookedAppointments: TimeRange[]; slotIntervalMinutes?: number (default 15); now?: Date (default `new Date()`) }`.

- [ ] **Step 1: Write the failing tests**

Create `lib/slots.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run lib/slots.test.ts
```

Expected: FAIL with "Cannot find module './slots'" (or similar).

- [ ] **Step 3: Implement**

Create `lib/slots.ts`:

```ts
export interface ScheduleRule {
  weekday: number;
  startTime: string;
  endTime: string;
}

export interface TimeRange {
  startAt: Date;
  endAt: Date;
}

export function getAvailableSlots(params: {
  date: Date;
  serviceDurationMinutes: number;
  scheduleRules: ScheduleRule[];
  timeOff: TimeRange[];
  bookedAppointments: TimeRange[];
  slotIntervalMinutes?: number;
  now?: Date;
}): Date[] {
  const {
    date,
    serviceDurationMinutes,
    scheduleRules,
    timeOff,
    bookedAppointments,
    slotIntervalMinutes = 15,
    now = new Date(),
  } = params;

  const weekday = date.getDay();
  const rulesForDay = scheduleRules.filter((rule) => rule.weekday === weekday);
  if (rulesForDay.length === 0) return [];

  const durationMs = serviceDurationMinutes * 60_000;
  const intervalMs = slotIntervalMinutes * 60_000;
  const slots: Date[] = [];

  for (const rule of rulesForDay) {
    const windowStart = timeStringToDate(date, rule.startTime);
    const windowEnd = timeStringToDate(date, rule.endTime);

    for (
      let candidate = new Date(windowStart);
      candidate.getTime() + durationMs <= windowEnd.getTime();
      candidate = new Date(candidate.getTime() + intervalMs)
    ) {
      if (candidate < now) continue;

      const candidateEnd = new Date(candidate.getTime() + durationMs);

      const blocked =
        timeOff.some((block) => overlaps(candidate, candidateEnd, block.startAt, block.endAt)) ||
        bookedAppointments.some((block) =>
          overlaps(candidate, candidateEnd, block.startAt, block.endAt)
        );

      if (!blocked) slots.push(candidate);
    }
  }

  return slots.sort((a, b) => a.getTime() - b.getTime());
}

function timeStringToDate(date: Date, time: string): Date {
  const [hours, minutes, seconds] = time.split(":").map(Number);
  const result = new Date(date);
  result.setHours(hours, minutes, seconds ?? 0, 0);
  return result;
}

function overlaps(startA: Date, endA: Date, startB: Date, endB: Date): boolean {
  return startA < endB && startB < endA;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run lib/slots.test.ts
```

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/slots.ts lib/slots.test.ts
git commit -m "feat: add slot availability calculation with unit tests"
```

---

### Task 4: Public barbers reader

**Files:**
- Modify: `lib/site-data.ts` (add one function; existing `getSiteConfig`/`getActiveServices` untouched)

**Interfaces:**
- Produces: `getActiveBarbers(): Promise<Tables<'barbers'>[]>` — barbers where `active = true`, ordered by `name`. Safe for anon (Plan 1's `"public read barbers"` RLS policy already allows this); used by `app/agendar/page.tsx` (Task 7) to list barber choices.

- [ ] **Step 1: Add the function**

Append to `lib/site-data.ts`:

```ts
export async function getActiveBarbers(): Promise<Tables<"barbers">[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("barbers")
    .select("*")
    .eq("active", true)
    .order("name");

  return data ?? [];
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/site-data.ts
git commit -m "feat: add getActiveBarbers to public site data layer"
```

---

### Task 5: Booking Server Actions

**Files:**
- Create: `app/agendar/actions.ts`

**Interfaces:**
- Consumes: `createAdminClient()` from `lib/supabase/admin.ts`; `getAvailableSlots` from `lib/slots.ts`; `normalizePhone` from `lib/phone.ts`.
- Produces:
  - `getAvailableSlots(input: { serviceId: string; barberId: string; date: string }): Promise<{ time: string }[]>` — `barberId` is either a real barber id or the literal string `"any"`; `date` is `"YYYY-MM-DD"`. `time` values are ISO strings. When `barberId` is `"any"`, returns the union of every active barber's free slots for that day.
  - `CreateAppointmentResult = { success: true; summary: { serviceName: string; barberName: string; startsAt: string } } | { success: false; error: string }`
  - `createAppointment(input: { serviceId: string; barberId: string; startsAtIso: string; name: string; phone: string }): Promise<CreateAppointmentResult>` — revalidates availability server-side (including resolving `"any"` to one specific, still-free barber), upserts the client by normalized phone, inserts the appointment, and returns a summary for the confirmation screen. Note: this calls the same day-wide slot computation as `getAvailableSlots` once per candidate barber to verify the chosen instant is still free — acceptable cost for a small barbershop's appointment volume, and it guarantees the check uses the exact same logic as what the client saw.

- [ ] **Step 1: Write the Server Actions file**

Create `app/agendar/actions.ts`:

```ts
"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getAvailableSlots as calculateAvailableSlots } from "@/lib/slots";
import { normalizePhone } from "@/lib/phone";

const SLOT_INTERVAL_MINUTES = 15;

type AdminClient = ReturnType<typeof createAdminClient>;

async function getCandidateBarberIds(
  admin: AdminClient,
  barberId: string
): Promise<string[]> {
  if (barberId !== "any") return [barberId];
  const { data } = await admin.from("barbers").select("id").eq("active", true);
  return (data ?? []).map((b) => b.id);
}

async function computeBarberSlots(
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

export async function getAvailableSlots(input: {
  serviceId: string;
  barberId: string;
  date: string;
}): Promise<{ time: string }[]> {
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

export type CreateAppointmentResult =
  | { success: true; summary: { serviceName: string; barberName: string; startsAt: string } }
  | { success: false; error: string };

export async function createAppointment(input: {
  serviceId: string;
  barberId: string;
  startsAtIso: string;
  name: string;
  phone: string;
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
    origin: "online",
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

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/agendar/actions.ts
git commit -m "feat: add booking Server Actions for availability and appointment creation"
```

---

### Task 6: Booking wizard UI

**Files:**
- Create: `components/booking/BookingWizard.tsx`

**Interfaces:**
- Consumes: `Tables<'services'>[]`, `Tables<'barbers'>[]` as props; `getAvailableSlots`, `createAppointment` from `app/agendar/actions.ts`.
- Produces: `<BookingWizard services={...} barbers={...} />` — a four-step client-side flow (service → barber → date/time → contact) ending in an inline confirmation screen. Used by `app/agendar/page.tsx` (Task 7).

- [ ] **Step 1: Write the wizard component**

Create `components/booking/BookingWizard.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import type { Tables } from "@/lib/database.types";
import { getAvailableSlots, createAppointment } from "@/app/agendar/actions";

type Step = "service" | "barber" | "datetime" | "contact";
const STEP_ORDER: Step[] = ["service", "barber", "datetime", "contact"];

export function BookingWizard({
  services,
  barbers,
}: {
  services: Tables<"services">[];
  barbers: Tables<"barbers">[];
}) {
  const [step, setStep] = useState<Step>("service");
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [barberId, setBarberId] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{
    serviceName: string;
    barberName: string;
    startsAt: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  function goBack() {
    const idx = STEP_ORDER.indexOf(step);
    if (idx > 0) setStep(STEP_ORDER[idx - 1]);
  }

  async function handleDateChange(nextDate: string) {
    setDate(nextDate);
    setSelectedSlot(null);
    setSlots([]);
    if (!serviceId || !barberId || !nextDate) return;

    const result = await getAvailableSlots({ serviceId, barberId, date: nextDate });
    setSlots(result.map((s) => s.time));
  }

  function handleSubmit(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    if (!serviceId || !barberId || !selectedSlot) return;

    setError(null);
    startTransition(async () => {
      const result = await createAppointment({
        serviceId,
        barberId,
        startsAtIso: selectedSlot,
        name,
        phone,
      });

      if (result.success) {
        setSummary(result.summary);
      } else {
        setError(result.error);
      }
    });
  }

  if (summary) {
    return (
      <div className="mx-auto max-w-md space-y-2 px-6 py-16 text-center">
        <h1 className="text-xl font-semibold">Agendamento confirmado!</h1>
        <p>{summary.serviceName}</p>
        <p>Com {summary.barberName}</p>
        <p>
          {new Date(summary.startsAt).toLocaleString("pt-BR", {
            dateStyle: "long",
            timeStyle: "short",
          })}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-6 px-6 py-16">
      {step !== "service" && (
        <button
          type="button"
          onClick={goBack}
          className="text-sm text-neutral-500 hover:underline"
        >
          ← Voltar
        </button>
      )}

      {step === "service" && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Escolha o serviço</h2>
          {services.map((service) => (
            <button
              key={service.id}
              type="button"
              onClick={() => {
                setServiceId(service.id);
                setStep("barber");
              }}
              className="block w-full rounded border border-neutral-300 px-4 py-3 text-left hover:border-neutral-900"
            >
              {service.name}
            </button>
          ))}
        </div>
      )}

      {step === "barber" && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Escolha o profissional</h2>
          <button
            type="button"
            onClick={() => {
              setBarberId("any");
              setStep("datetime");
            }}
            className="block w-full rounded border border-neutral-300 px-4 py-3 text-left hover:border-neutral-900"
          >
            Qualquer disponível
          </button>
          {barbers.map((barber) => (
            <button
              key={barber.id}
              type="button"
              onClick={() => {
                setBarberId(barber.id);
                setStep("datetime");
              }}
              className="block w-full rounded border border-neutral-300 px-4 py-3 text-left hover:border-neutral-900"
            >
              {barber.name}
            </button>
          ))}
        </div>
      )}

      {step === "datetime" && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Escolha data e horário</h2>
          <input
            type="date"
            value={date}
            onChange={(e) => handleDateChange(e.target.value)}
            className="w-full rounded border border-neutral-300 px-3 py-2"
          />
          {slots.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {slots.map((slot) => (
                <button
                  key={slot}
                  type="button"
                  onClick={() => setSelectedSlot(slot)}
                  className={`rounded border px-2 py-2 text-sm ${
                    selectedSlot === slot
                      ? "border-neutral-900 bg-neutral-900 text-white"
                      : "border-neutral-300"
                  }`}
                >
                  {new Date(slot).toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </button>
              ))}
            </div>
          )}
          {date && slots.length === 0 && (
            <p className="text-sm text-neutral-500">
              Nenhum horário disponível nesse dia.
            </p>
          )}
          <button
            type="button"
            disabled={!selectedSlot}
            onClick={() => setStep("contact")}
            className="w-full rounded bg-neutral-900 py-2 text-white disabled:opacity-50"
          >
            Continuar
          </button>
        </div>
      )}

      {step === "contact" && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <h2 className="text-lg font-semibold">Seus dados</h2>
          <input
            type="text"
            placeholder="Nome"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded border border-neutral-300 px-3 py-2"
          />
          <input
            type="tel"
            placeholder="Telefone"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded border border-neutral-300 px-3 py-2"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded bg-neutral-900 py-2 text-white disabled:opacity-50"
          >
            {isPending ? "Confirmando..." : "Confirmar agendamento"}
          </button>
        </form>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/booking/BookingWizard.tsx
git commit -m "feat: add booking wizard client component"
```

---

### Task 7: Wire the real booking flow into `/agendar`

**Files:**
- Modify: `app/agendar/page.tsx` (replaces the Plan 2 "em breve" placeholder)

**Interfaces:**
- Consumes: `getActiveServices`, `getActiveBarbers` from `lib/site-data.ts`; `BookingWizard` from `components/booking/BookingWizard.tsx`.

- [ ] **Step 1: Replace the placeholder page**

Replace `app/agendar/page.tsx`:

```tsx
import { getActiveServices, getActiveBarbers } from "@/lib/site-data";
import { BookingWizard } from "@/components/booking/BookingWizard";

export default async function AgendarPage() {
  const [services, barbers] = await Promise.all([
    getActiveServices(),
    getActiveBarbers(),
  ]);

  return <BookingWizard services={services} barbers={barbers} />;
}
```

- [ ] **Step 2: Verify it compiles and builds**

```bash
npx tsc --noEmit
npm run build
```

Expected: no errors; build output lists `/agendar` as a route (dynamic, since it reads from the database).

- [ ] **Step 3: Manual verification in the browser**

```bash
npm run dev -- --port 3000 &
```

Open `http://localhost:3000/agendar` and walk through the full flow using the Plan 1 seed data (service "Corte de Cabelo", barber "Barbeiro Exemplo", Mon–Fri 09:00–18:00): pick the service, pick "Qualquer disponível", pick a weekday date, confirm a slot renders, fill in a test name/phone, submit, and confirm the confirmation screen shows the right service/barber/time. Then check the Supabase dashboard's Table Editor to confirm a row was created in both `clients` and `appointments`. Stop the dev server afterward (`kill %1`).

- [ ] **Step 4: Commit**

```bash
git add app/agendar/page.tsx
git commit -m "feat: wire real booking flow into /agendar"
```

---

### Task 8: Full test and build verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full unit test suite**

```bash
npx vitest run
```

Expected: all tests pass (`lib/phone.test.ts`, `lib/slots.test.ts`).

- [ ] **Step 2: Run lint, typecheck, and build**

```bash
npm run lint
npx tsc --noEmit
npm run build
```

Expected: all three clean.

- [ ] **Step 3: Commit (only if any fixes were needed in Step 1–2)**

```bash
git add -A
git commit -m "fix: address issues found in full verification pass"
```

If nothing needed fixing, skip this step — there's nothing to commit.

---

## Self-Review Notes

- **Spec coverage for this plan's slice:** service → barber (or "qualquer disponível") → calculated real slots → name/phone → confirmation ✅; server-side revalidation of slot freshness at confirm time ✅; concurrency handled by both an app-level recheck and a DB exclusion constraint ✅; client upsert by normalized phone, reusing the record and updating the name if it changed ✅; no WhatsApp/SMS send, no login, no cancellation token — all correctly out of scope here (cancellation is Plan 4). Unit tests specifically target the slot-calculation logic per the spec's testing section.
- **Placeholder scan:** no TBD/TODO. No step describes behavior without code.
- **Type consistency:** `barberId: string` (where `"any"` is a sentinel value, not a real UUID) is used identically across `getAvailableSlots` and `createAppointment` in Task 5, and in `BookingWizard`'s state (Task 6) and its calls into those actions (same parameter names: `serviceId`, `barberId`, `date`/`startsAtIso`). `CreateAppointmentResult`'s `summary` shape (`serviceName`, `barberName`, `startsAt`) matches exactly what `BookingWizard`'s confirmation screen reads.
