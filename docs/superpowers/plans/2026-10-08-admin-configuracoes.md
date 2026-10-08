# Admin — Aba de Configurações Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `/admin/configuracoes` tab where the shop owner edits barbearia identity, barbers, services, and per-barbeiro schedules (with lunch breaks) — replacing direct-SQL edits — and make the fila's open/closed state and the Hero's opening-hours text derive automatically from those schedules instead of a free-text field.

**Architecture:** Two pure functions in a new `lib/business-hours.ts` (`isAnyBarberOnShiftNow`, `summarizeOpeningHours`) carry all the time-window logic and are unit tested directly, matching the existing `lib/slots.ts`/`lib/queue-wait.ts` pattern. Thin orchestration functions in the same file fetch `barber_schedules` via the service-role `AdminClient` (required — `barber_schedules` has no anon RLS policy) and feed the pure functions. `lib/queue-server.ts` is extended to compute an *effective* `queueOpen` (manual toggle AND on-shift) alongside the raw manual flag. The new `/admin/configuracoes` CRUD is plain Server Actions using the authenticated (non-admin) Supabase client, following the existing `app/admin/agenda/actions.ts` pattern, since `site_config`/`barbers`/`services`/`barber_schedules` all already grant full access to any authenticated user via RLS.

**Tech Stack:** Next.js App Router (server components + Server Actions), Supabase (Postgres + RLS), Vitest.

## Global Constraints

- Soft delete only for `barbers`/`services` — never `DELETE`, always `active = false` (historical appointments/queue entries reference these rows via FK).
- No change to slot-calculation logic (`lib/slots.ts`, `computeBarberSlots`) — schedules keep being multiple `barber_schedules` rows per weekday; a lunch break is just two rows.
- Saving a barber's schedule for a weekday means: delete existing rows for that `barber_id`+`weekday`, then insert the new rows for that day — never touch other weekdays or other barbers.
- All new Server Actions require `requireAdmin()` (checks `supabase.auth.getUser()`), matching `app/admin/fila/actions.ts` / `app/admin/agenda/actions.ts`.
- Every mutating admin action calls `revalidatePath` for `/admin/configuracoes`, `/`, `/agendar`, `/fila`, `/fila/tv`.
- New pure logic goes in `lib/business-hours.ts` and is unit tested with Vitest (`describe`/`it`/`expect`, relative imports, no mocking) — same style as `lib/slots.test.ts`. Data-fetching/orchestration code and UI components are not unit tested in this codebase (no existing precedent) — verify those by `npm run test`, `npm run lint`, and manual browser walkthrough only.

---

### Task 1: Drop `site_config.opening_hours` and update generated types

**Files:**
- Create: `supabase/migrations/0004_remove_opening_hours.sql`
- Modify: `supabase/seed.sql`
- Modify: `lib/database.types.ts:401-448` (the `site_config` table block)
- Modify: `lib/site-data.ts:4-18` (`DEFAULT_SITE_CONFIG`)

**Interfaces:**
- Produces: `Tables<"site_config">` no longer has an `opening_hours` field. Every later task that touches `site_config`, `Hero`, `Footer`, `ContactSection`, or `/fila`/`/agendar`/`/` pages must not reference `siteConfig.opening_hours` — it will not compile.

- [ ] **Step 1: Write the migration**

```sql
alter table site_config drop column opening_hours;
```
Save as `supabase/migrations/0004_remove_opening_hours.sql`.

- [ ] **Step 2: Update the template seed**

In `supabase/seed.sql`, change:
```sql
insert into site_config (name, address, phone, opening_hours, about)
values (
  'Minha Barbearia',
  'Rua Exemplo, 123 - Centro',
  '(11) 99999-9999',
  'Seg a Sáb, 09:00 às 19:00',
  'Edite esta descrição no painel administrativo em Configurações.'
);
```
to:
```sql
insert into site_config (name, address, phone, about)
values (
  'Minha Barbearia',
  'Rua Exemplo, 123 - Centro',
  '(11) 99999-9999',
  'Edite esta descrição no painel administrativo em Configurações.'
);
```

- [ ] **Step 3: Remove `opening_hours` from the generated types**

In `lib/database.types.ts`, inside the `site_config` table definition, remove the three lines:
- `opening_hours: string | null` (Row)
- `opening_hours?: string | null` (Insert)
- `opening_hours?: string | null` (Update)

- [ ] **Step 4: Remove the dead default field**

In `lib/site-data.ts`, remove the line `opening_hours: null,` from `DEFAULT_SITE_CONFIG`.

- [ ] **Step 5: Confirm the break is visible**

Run: `npm run lint`
Expected: FAIL (type errors) in `components/site/Hero.tsx`, `components/site/Footer.tsx`, `components/site/ContactSection.tsx` for the now-missing `siteConfig.opening_hours` — this is expected; Task 5 fixes them. Do not fix them here.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0004_remove_opening_hours.sql supabase/seed.sql lib/database.types.ts lib/site-data.ts
git commit -m "feat: drop site_config.opening_hours, superseded by computed schedule summary"
```

---

### Task 2: `lib/business-hours.ts` — pure time-window logic (TDD)

**Files:**
- Create: `lib/business-hours.ts`
- Create: `lib/business-hours.test.ts`

**Interfaces:**
- Produces: `export type ScheduleWindow = { weekday: number; startTime: string; endTime: string }`, `export function isAnyBarberOnShiftNow(schedules: ScheduleWindow[], weekday: number, now: Date): boolean`, `export function summarizeOpeningHours(schedules: ScheduleWindow[]): string | null`. `startTime`/`endTime` are `"HH:MM"` or `"HH:MM:SS"` strings (Postgres `time` columns come back as `"HH:MM:SS"`).

- [ ] **Step 1: Write the failing tests**

Create `lib/business-hours.test.ts`:
```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/business-hours.test.ts`
Expected: FAIL with "Cannot find module './business-hours'" (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `lib/business-hours.ts`:
```typescript
export type ScheduleWindow = {
  weekday: number;
  startTime: string;
  endTime: string;
};

const WEEKDAY_ABBREVIATIONS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function timeStringToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function formatHHMM(time: string): string {
  return time.slice(0, 5);
}

export function isAnyBarberOnShiftNow(
  schedules: ScheduleWindow[],
  weekday: number,
  now: Date
): boolean {
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return schedules.some(
    (window) =>
      window.weekday === weekday &&
      nowMinutes >= timeStringToMinutes(window.startTime) &&
      nowMinutes < timeStringToMinutes(window.endTime)
  );
}

export function summarizeOpeningHours(schedules: ScheduleWindow[]): string | null {
  const rangeByWeekday = new Map<number, { start: string; end: string }>();

  for (const window of schedules) {
    const existing = rangeByWeekday.get(window.weekday);
    if (!existing) {
      rangeByWeekday.set(window.weekday, { start: window.startTime, end: window.endTime });
      continue;
    }
    if (window.startTime < existing.start) existing.start = window.startTime;
    if (window.endTime > existing.end) existing.end = window.endTime;
  }

  if (rangeByWeekday.size === 0) return null;

  type Group = { fromWeekday: number; toWeekday: number; start: string; end: string };
  const groups: Group[] = [];

  for (let weekday = 0; weekday <= 6; weekday++) {
    const range = rangeByWeekday.get(weekday);
    if (!range) continue;

    const last = groups[groups.length - 1];
    if (
      last &&
      last.toWeekday === weekday - 1 &&
      last.start === range.start &&
      last.end === range.end
    ) {
      last.toWeekday = weekday;
    } else {
      groups.push({ fromWeekday: weekday, toWeekday: weekday, start: range.start, end: range.end });
    }
  }

  return groups
    .map((group) => {
      const label =
        group.fromWeekday === group.toWeekday
          ? WEEKDAY_ABBREVIATIONS[group.fromWeekday]
          : `${WEEKDAY_ABBREVIATIONS[group.fromWeekday]} a ${WEEKDAY_ABBREVIATIONS[group.toWeekday]}`;
      return `${label}: ${formatHHMM(group.start)}–${formatHHMM(group.end)}`;
    })
    .join(" · ");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/business-hours.test.ts`
Expected: PASS (13 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/business-hours.ts lib/business-hours.test.ts
git commit -m "feat: add pure on-shift and opening-hours-summary logic"
```

---

### Task 3: `lib/business-hours.ts` — orchestration (fetch via AdminClient)

**Files:**
- Modify: `lib/business-hours.ts` (append)

**Interfaces:**
- Consumes: `ScheduleWindow`, `isAnyBarberOnShiftNow`, `summarizeOpeningHours` from Task 2. `AdminClient` from `@/lib/supabase/admin`.
- Produces: `export async function getActiveScheduleWindows(admin: AdminClient): Promise<ScheduleWindow[]>`, `export async function isQueueEffectivelyOpen(admin: AdminClient): Promise<boolean>`, `export async function getOpeningHoursSummary(admin: AdminClient): Promise<string | null>`. Task 4 (`lib/queue-server.ts`) and Task 6 (page wiring) both import from here.

- [ ] **Step 1: Add the orchestration functions**

Append to `lib/business-hours.ts`:
```typescript
import type { AdminClient } from "@/lib/supabase/admin";

export async function getActiveScheduleWindows(admin: AdminClient): Promise<ScheduleWindow[]> {
  const { data: barbers } = await admin.from("barbers").select("id").eq("active", true);
  const activeBarberIds = new Set((barbers ?? []).map((b) => b.id));
  if (activeBarberIds.size === 0) return [];

  const { data: schedules } = await admin
    .from("barber_schedules")
    .select("barber_id, weekday, start_time, end_time");

  return (schedules ?? [])
    .filter((row) => activeBarberIds.has(row.barber_id))
    .map((row) => ({
      weekday: row.weekday,
      startTime: row.start_time,
      endTime: row.end_time,
    }));
}

export async function isQueueEffectivelyOpen(admin: AdminClient): Promise<boolean> {
  const [{ data: siteConfig }, scheduleWindows] = await Promise.all([
    admin.from("site_config").select("queue_open").limit(1).maybeSingle(),
    getActiveScheduleWindows(admin),
  ]);

  if (!siteConfig?.queue_open) return false;

  const now = new Date();
  return isAnyBarberOnShiftNow(scheduleWindows, now.getDay(), now);
}

export async function getOpeningHoursSummary(admin: AdminClient): Promise<string | null> {
  const scheduleWindows = await getActiveScheduleWindows(admin);
  return summarizeOpeningHours(scheduleWindows);
}
```
(the import must move to the top of the file alongside the existing type definitions — put `import type { AdminClient } from "@/lib/supabase/admin";` as the first line of `lib/business-hours.ts`, not inline.)

- [ ] **Step 2: Verify the file still type-checks and unit tests still pass**

Run: `npx vitest run lib/business-hours.test.ts`
Expected: PASS (unchanged — these new functions have no dedicated tests, consistent with how `lib/queue-server.ts`'s data-fetching functions have none).

Run: `npm run lint`
Expected: no new errors from `lib/business-hours.ts` (the pre-existing Hero/Footer/ContactSection errors from Task 1 remain until Task 5).

- [ ] **Step 3: Commit**

```bash
git add lib/business-hours.ts
git commit -m "feat: fetch active barber schedules for effective-open and hours-summary checks"
```

---

### Task 4: Wire effective queue-open state into `lib/queue-server.ts`

**Files:**
- Modify: `lib/queue-server.ts:1-61` (imports, `QueueBoard` type, `getQueueBoard`)
- Modify: `lib/queue-server.ts:199-230` (`joinQueue`)

**Interfaces:**
- Consumes: `isAnyBarberOnShiftNow`, `isQueueEffectivelyOpen`, `type ScheduleWindow` from `@/lib/business-hours` (Tasks 2-3).
- Produces: `QueueBoard` gains `queueOpenManual: boolean`; `queueOpen` now means *effective* open (manual AND on-shift). Task 5's admin page and Task 6's `/fila` page both read these two fields by name.

- [ ] **Step 1: Update imports and the `QueueBoard` type**

In `lib/queue-server.ts`, add after the existing imports (line 4):
```typescript
import { isAnyBarberOnShiftNow, type ScheduleWindow } from "@/lib/business-hours";
```

Change the `QueueBoard` type (currently lines 31-35):
```typescript
export type QueueBoard = {
  /** Manual toggle plus at least one active barber on shift right now. */
  queueOpen: boolean;
  /** Raw value of the manual toggle, regardless of schedule. */
  queueOpenManual: boolean;
  barbers: QueueBoardBarberColumn[];
  waiting: QueueBoardWaitingItem[];
};
```

- [ ] **Step 2: Fetch schedules and compute the effective state in `getQueueBoard`**

The existing `Promise.all` in `getQueueBoard` (lines 40-61) has 6 queries destructured as `[{ data: siteConfig }, { data: barbers }, { data: inService }, { data: waitingRows }, { data: services }, { data: clients }]`. Add a 7th query at the end of both the array and the destructuring list: append `admin.from("barber_schedules").select("barber_id, weekday, start_time, end_time"),` as the last entry in the `Promise.all([...])` array, and append `{ data: scheduleRows }` as the last entry in the destructuring list on the left-hand side.

After the existing `barberNameById`/`inServiceByBarber` maps (around line 68), add:
```typescript
  const activeBarberIds = new Set((barbers ?? []).map((b) => b.id));
  const scheduleWindows: ScheduleWindow[] = (scheduleRows ?? [])
    .filter((row) => activeBarberIds.has(row.barber_id))
    .map((row) => ({ weekday: row.weekday, startTime: row.start_time, endTime: row.end_time }));
  const queueOpenManual = siteConfig?.queue_open ?? false;
  const queueOpen = queueOpenManual && isAnyBarberOnShiftNow(scheduleWindows, now.getDay(), now);
```

Update the return statement's first line from `queueOpen: siteConfig?.queue_open ?? false,` to:
```typescript
    queueOpen,
    queueOpenManual,
```

- [ ] **Step 3: Make `joinQueue` reject when effectively closed**

In `joinQueue`, replace the opening block:
```typescript
  const { data: siteConfig } = await admin
    .from("site_config")
    .select("queue_open")
    .limit(1)
    .maybeSingle();

  if (!siteConfig?.queue_open) {
    return { success: false, error: "A fila está fechada no momento." };
  }
```
with:
```typescript
  const effectivelyOpen = await isQueueEffectivelyOpen(admin);
  if (!effectivelyOpen) {
    return { success: false, error: "A fila está fechada no momento." };
  }
```
and add `isQueueEffectivelyOpen` to the `@/lib/business-hours` import from Step 1.

- [ ] **Step 4: Verify existing tests still pass**

Run: `npx vitest run`
Expected: PASS — `lib/queue-wait.test.ts` and other existing suites are unaffected (no test exercises `getQueueBoard`/`joinQueue` directly — see Global Constraints).

- [ ] **Step 5: Commit**

```bash
git add lib/queue-server.ts
git commit -m "fix: close queue automatically outside active barbers' schedule"
```

---

### Task 5: Admin fila page — show the manual toggle and the auto-closed warning

**Files:**
- Modify: `app/admin/fila/page.tsx:19-32`

**Interfaces:**
- Consumes: `board.queueOpen` (effective), `board.queueOpenManual` (raw toggle) from Task 4.

- [ ] **Step 1: Bind the toggle to the manual flag and add the warning**

Replace:
```tsx
        <form action={toggleQueueOpen.bind(null, !board.queueOpen)}>
          <button
            type="submit"
            className={`rounded-sm border px-3 py-2 text-sm transition-colors ${
              board.queueOpen
                ? "border-gold text-gold"
                : "border-ink-line text-paper-dim hover:text-paper"
            }`}
          >
            {board.queueOpen ? "Fila aberta" : "Fila fechada"} · clique para{" "}
            {board.queueOpen ? "fechar" : "abrir"}
          </button>
        </form>
      </div>
```
with:
```tsx
        <form action={toggleQueueOpen.bind(null, !board.queueOpenManual)}>
          <button
            type="submit"
            className={`rounded-sm border px-3 py-2 text-sm transition-colors ${
              board.queueOpenManual
                ? "border-gold text-gold"
                : "border-ink-line text-paper-dim hover:text-paper"
            }`}
          >
            {board.queueOpenManual ? "Fila aberta" : "Fila fechada"} · clique para{" "}
            {board.queueOpenManual ? "fechar" : "abrir"}
          </button>
        </form>
      </div>

      {board.queueOpenManual && !board.queueOpen && (
        <p className="text-sm text-danger">
          Fechada automaticamente — fora do horário de atendimento.
        </p>
      )}
```

- [ ] **Step 2: Manual check**

Run `npm run dev`, open `/admin/fila`. With the toggle "aberta" and no barber scheduled for the current moment, confirm the warning line appears and `/fila` (public) shows "Fila fechada" (Task 6 wires that). Toggling should still flip the manual state immediately (button label follows `queueOpenManual`, not the effective state).

- [ ] **Step 3: Commit**

```bash
git add app/admin/fila/page.tsx
git commit -m "feat: show auto-closed warning on admin fila board"
```

---

### Task 6: Replace `siteConfig.opening_hours` with the computed summary across the public site

**Files:**
- Modify: `components/site/Hero.tsx`
- Modify: `components/site/Footer.tsx`
- Modify: `components/site/ContactSection.tsx`
- Modify: `app/page.tsx`
- Modify: `app/agendar/page.tsx`
- Modify: `app/fila/page.tsx`

**Interfaces:**
- Consumes: `getOpeningHoursSummary(admin)` and `isQueueEffectivelyOpen`-backed `getQueueBoard` from Tasks 3-4.
- Produces: `Hero`, `Footer`, `ContactSection` take a new required prop `openingHoursSummary: string | null` instead of reading `siteConfig.opening_hours`. `Hero` renders a second button to `/fila`.

- [ ] **Step 1: Update `Hero.tsx`**

Replace the whole file with:
```tsx
import Image from "next/image";
import Link from "next/link";
import type { Tables } from "@/lib/database.types";

export function Hero({
  siteConfig,
  openingHoursSummary,
}: {
  siteConfig: Tables<"site_config">;
  openingHoursSummary: string | null;
}) {
  return (
    <section className="group relative isolate overflow-hidden border-b border-ink-line">
      <div className="absolute inset-0 -z-10">
        <Image
          src="/images/hero-barber.webp"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-[38%_32%] grayscale-[0.1] brightness-[1.05] saturate-[1.05] transition-transform duration-700 ease-out group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-l from-ink via-ink/55 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink/60 via-transparent to-ink/10" />
      </div>

      <div className="relative mx-auto flex min-h-[640px] max-w-6xl flex-col justify-center px-6 py-28">
        <div className="ml-auto max-w-xl animate-rise-in text-right">
          <h1 className="font-display text-5xl leading-[1.05] text-paper sm:text-6xl">
            {siteConfig.name}
          </h1>
          {siteConfig.about && (
            <p className="mt-6 ml-auto max-w-md text-balance text-base leading-relaxed text-paper-dim">
              {siteConfig.about}
            </p>
          )}
          <div className="mt-10 flex flex-wrap items-center justify-end gap-4">
            <Link
              href="/agendar"
              className="rounded-sm bg-gold px-7 py-3.5 text-sm font-semibold tracking-wide text-gold-ink transition-colors hover:bg-gold-bright"
            >
              Agendar horário
            </Link>
            <Link
              href="/fila"
              className="rounded-sm border border-gold px-7 py-3.5 text-sm font-semibold tracking-wide text-gold transition-colors hover:bg-gold hover:text-gold-ink"
            >
              Fila de atendimento
            </Link>
          </div>
          {openingHoursSummary && (
            <p className="mt-4 text-sm text-paper-dim">{openingHoursSummary}</p>
          )}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Update `Footer.tsx`**

Change the function signature to:
```tsx
export function Footer({
  siteConfig,
  openingHoursSummary,
}: {
  siteConfig: Tables<"site_config">;
  openingHoursSummary: string | null;
}) {
```
and change the line `{siteConfig.opening_hours && <span>{siteConfig.opening_hours}</span>}` to:
```tsx
            {openingHoursSummary && <span>{openingHoursSummary}</span>}
```

- [ ] **Step 3: Update `ContactSection.tsx`**

Change the function signature to:
```tsx
export function ContactSection({
  siteConfig,
  openingHoursSummary,
}: {
  siteConfig: Tables<"site_config">;
  openingHoursSummary: string | null;
}) {
  const hasContact =
    siteConfig.address ||
    siteConfig.phone ||
    siteConfig.whatsapp ||
    siteConfig.instagram ||
    openingHoursSummary;
```
and change:
```tsx
            {siteConfig.opening_hours && (
              <div className="border-t border-ink-line pt-5">
                <dt className="text-xs uppercase tracking-[0.2em] text-paper-dim">
                  Horário
                </dt>
                <dd className="mt-1.5 text-paper">{siteConfig.opening_hours}</dd>
              </div>
            )}
```
to:
```tsx
            {openingHoursSummary && (
              <div className="border-t border-ink-line pt-5">
                <dt className="text-xs uppercase tracking-[0.2em] text-paper-dim">
                  Horário
                </dt>
                <dd className="mt-1.5 text-paper">{openingHoursSummary}</dd>
              </div>
            )}
```

- [ ] **Step 4: Wire `app/page.tsx`**

Replace the file with:
```tsx
import {
  getSiteConfig,
  getActiveServices,
  getActiveBarbers,
} from "@/lib/site-data";
import { getOpeningHoursSummary } from "@/lib/business-hours";
import { createAdminClient } from "@/lib/supabase/admin";
import { Header } from "@/components/site/Header";
import { Hero } from "@/components/site/Hero";
import { ServicesSection } from "@/components/site/ServicesSection";
import { BarbersSection } from "@/components/site/BarbersSection";
import { ContactSection } from "@/components/site/ContactSection";
import { Footer } from "@/components/site/Footer";

export default async function Home() {
  const [siteConfig, services, barbers, openingHoursSummary] = await Promise.all([
    getSiteConfig(),
    getActiveServices(),
    getActiveBarbers(),
    getOpeningHoursSummary(createAdminClient()),
  ]);

  return (
    <>
      <Header siteConfig={siteConfig} />
      <main>
        <Hero siteConfig={siteConfig} openingHoursSummary={openingHoursSummary} />
        <ServicesSection services={services} />
        <BarbersSection barbers={barbers} />
        <ContactSection siteConfig={siteConfig} openingHoursSummary={openingHoursSummary} />
      </main>
      <Footer siteConfig={siteConfig} openingHoursSummary={openingHoursSummary} />
    </>
  );
}
```

- [ ] **Step 5: Wire `app/agendar/page.tsx`**

Replace the file with:
```tsx
import {
  getActiveServices,
  getActiveBarbers,
  getSiteConfig,
} from "@/lib/site-data";
import { getOpeningHoursSummary } from "@/lib/business-hours";
import { createAdminClient } from "@/lib/supabase/admin";
import { BookingWizard } from "@/components/booking/BookingWizard";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";

export default async function AgendarPage() {
  const [siteConfig, services, barbers, openingHoursSummary] = await Promise.all([
    getSiteConfig(),
    getActiveServices(),
    getActiveBarbers(),
    getOpeningHoursSummary(createAdminClient()),
  ]);

  return (
    <>
      <Header siteConfig={siteConfig} />
      <main className="flex-1">
        <BookingWizard services={services} barbers={barbers} />
      </main>
      <Footer siteConfig={siteConfig} openingHoursSummary={openingHoursSummary} />
    </>
  );
}
```

- [ ] **Step 6: Wire `app/fila/page.tsx`**

Replace the file with:
```tsx
import { getActiveServices, getActiveBarbers, getSiteConfig } from "@/lib/site-data";
import { getQueueBoard } from "@/lib/queue-server";
import { getOpeningHoursSummary } from "@/lib/business-hours";
import { createAdminClient } from "@/lib/supabase/admin";
import { QueueJoinForm } from "@/components/queue/QueueJoinForm";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";

export default async function FilaPage() {
  const admin = createAdminClient();
  const [siteConfig, services, barbers, board, openingHoursSummary] = await Promise.all([
    getSiteConfig(),
    getActiveServices(),
    getActiveBarbers(),
    getQueueBoard(admin),
    getOpeningHoursSummary(admin),
  ]);

  return (
    <>
      <Header siteConfig={siteConfig} />
      <main className="flex-1">
        {board.queueOpen ? (
          <QueueJoinForm services={services} barbers={barbers} />
        ) : (
          <div className="mx-auto max-w-md px-6 py-24 text-center">
            <h1 className="font-display text-2xl text-paper">Fila fechada</h1>
            <p className="mt-2 text-sm text-paper-dim">
              A fila de atendimento está fechada no momento. Volte durante o horário de
              funcionamento.
            </p>
          </div>
        )}
      </main>
      <Footer siteConfig={siteConfig} openingHoursSummary={openingHoursSummary} />
    </>
  );
}
```

- [ ] **Step 7: Verify the build is clean**

Run: `npm run lint`
Expected: PASS, no remaining references to `siteConfig.opening_hours` anywhere (the errors introduced in Task 1 are now gone).

- [ ] **Step 8: Commit**

```bash
git add components/site/Hero.tsx components/site/Footer.tsx components/site/ContactSection.tsx app/page.tsx app/agendar/page.tsx app/fila/page.tsx
git commit -m "feat: compute opening-hours text from schedules, add fila button to hero"
```

---

### Task 7: `/admin/configuracoes` Server Actions

**Files:**
- Create: `app/admin/configuracoes/actions.ts`

**Interfaces:**
- Produces: `ActionResult = { success: true } | { success: false; error: string }`, `updateSiteIdentity(input: { name: string; about: string }): Promise<ActionResult>`, `createBarber(name: string): Promise<ActionResult>`, `updateBarberName(barberId: string, name: string): Promise<ActionResult>`, `setBarberActive(barberId: string, active: boolean): Promise<void>`, `createService(input: { name: string; durationMinutes: number; priceCents: number }): Promise<ActionResult>`, `updateService(serviceId: string, input: { name: string; durationMinutes: number; priceCents: number }): Promise<ActionResult>`, `setServiceActive(serviceId: string, active: boolean): Promise<void>`, `export type BarberScheduleDay = { weekday: number; closed: boolean; start: string; end: string; hasBreak: boolean; breakStart: string; breakEnd: string }`, `saveBarberSchedule(barberId: string, days: BarberScheduleDay[]): Promise<ActionResult>`. Tasks 8-11's components import these by name.

- [ ] **Step 1: Write the actions file**

Create `app/admin/configuracoes/actions.ts`:
```typescript
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  return supabase;
}

function revalidateAll(): void {
  revalidatePath("/admin/configuracoes");
  revalidatePath("/");
  revalidatePath("/agendar");
  revalidatePath("/fila");
  revalidatePath("/fila/tv");
}

export type ActionResult = { success: true } | { success: false; error: string };

export async function updateSiteIdentity(input: {
  name: string;
  about: string;
}): Promise<ActionResult> {
  const supabase = await requireAdmin();
  const { data: siteConfig } = await supabase
    .from("site_config")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (!siteConfig) return { success: false, error: "Configuração não encontrada." };

  const { error } = await supabase
    .from("site_config")
    .update({ name: input.name, about: input.about || null })
    .eq("id", siteConfig.id);

  if (error) return { success: false, error: "Não foi possível salvar." };
  revalidateAll();
  return { success: true };
}

export async function createBarber(name: string): Promise<ActionResult> {
  const supabase = await requireAdmin();
  const { error } = await supabase.from("barbers").insert({ name });
  if (error) return { success: false, error: "Não foi possível criar o barbeiro." };
  revalidateAll();
  return { success: true };
}

export async function updateBarberName(barberId: string, name: string): Promise<ActionResult> {
  const supabase = await requireAdmin();
  const { error } = await supabase.from("barbers").update({ name }).eq("id", barberId);
  if (error) return { success: false, error: "Não foi possível atualizar o barbeiro." };
  revalidateAll();
  return { success: true };
}

export async function setBarberActive(barberId: string, active: boolean): Promise<void> {
  const supabase = await requireAdmin();
  await supabase.from("barbers").update({ active }).eq("id", barberId);
  revalidateAll();
}

export async function createService(input: {
  name: string;
  durationMinutes: number;
  priceCents: number;
}): Promise<ActionResult> {
  const supabase = await requireAdmin();
  const { error } = await supabase.from("services").insert({
    name: input.name,
    duration_minutes: input.durationMinutes,
    price_cents: input.priceCents,
  });
  if (error) return { success: false, error: "Não foi possível criar o serviço." };
  revalidateAll();
  return { success: true };
}

export async function updateService(
  serviceId: string,
  input: { name: string; durationMinutes: number; priceCents: number }
): Promise<ActionResult> {
  const supabase = await requireAdmin();
  const { error } = await supabase
    .from("services")
    .update({
      name: input.name,
      duration_minutes: input.durationMinutes,
      price_cents: input.priceCents,
    })
    .eq("id", serviceId);
  if (error) return { success: false, error: "Não foi possível atualizar o serviço." };
  revalidateAll();
  return { success: true };
}

export async function setServiceActive(serviceId: string, active: boolean): Promise<void> {
  const supabase = await requireAdmin();
  await supabase.from("services").update({ active }).eq("id", serviceId);
  revalidateAll();
}

export type BarberScheduleDay = {
  weekday: number;
  closed: boolean;
  start: string;
  end: string;
  hasBreak: boolean;
  breakStart: string;
  breakEnd: string;
};

export async function saveBarberSchedule(
  barberId: string,
  days: BarberScheduleDay[]
): Promise<ActionResult> {
  const supabase = await requireAdmin();

  for (const day of days) {
    const { error: deleteError } = await supabase
      .from("barber_schedules")
      .delete()
      .eq("barber_id", barberId)
      .eq("weekday", day.weekday);
    if (deleteError) return { success: false, error: "Não foi possível salvar o horário." };

    if (day.closed) continue;

    const rows = day.hasBreak
      ? [
          { barber_id: barberId, weekday: day.weekday, start_time: day.start, end_time: day.breakStart },
          { barber_id: barberId, weekday: day.weekday, start_time: day.breakEnd, end_time: day.end },
        ]
      : [{ barber_id: barberId, weekday: day.weekday, start_time: day.start, end_time: day.end }];

    const { error: insertError } = await supabase.from("barber_schedules").insert(rows);
    if (insertError) return { success: false, error: "Não foi possível salvar o horário." };
  }

  revalidateAll();
  return { success: true };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run lint`
Expected: PASS for this file (no consumers yet, but no type errors within it).

- [ ] **Step 3: Commit**

```bash
git add app/admin/configuracoes/actions.ts
git commit -m "feat: add server actions for admin configuracoes CRUD"
```

---

### Task 8: `/admin/configuracoes` page shell, tabs, and Identidade panel

**Files:**
- Create: `app/admin/configuracoes/page.tsx`
- Create: `components/admin/configuracoes/ConfiguracoesTabs.tsx`
- Create: `components/admin/configuracoes/IdentityPanel.tsx`
- Modify: `app/admin/layout.tsx:28-46`

**Interfaces:**
- Consumes: `updateSiteIdentity` from Task 7.
- Produces: route `/admin/configuracoes?tab=identidade|barbeiros|servicos|horarios`. Tasks 9-11 plug `BarbersPanel`, `ServicesPanel`, `SchedulesPanel` into the `tab === "..."` branches already stubbed in `page.tsx` below.

- [ ] **Step 1: Add the nav link**

In `app/admin/layout.tsx`, after the `/admin/fila` `<Link>` (ends at line 46) and before the `signOut` `<form>`, add:
```tsx
          <Link
            href="/admin/configuracoes"
            className="text-sm text-paper-dim transition-colors hover:text-paper"
          >
            Configurações
          </Link>
```

- [ ] **Step 2: Write the tabs component**

Create `components/admin/configuracoes/ConfiguracoesTabs.tsx`:
```tsx
import Link from "next/link";

const TABS: { value: string; label: string }[] = [
  { value: "identidade", label: "Identidade" },
  { value: "barbeiros", label: "Barbeiros" },
  { value: "servicos", label: "Serviços" },
  { value: "horarios", label: "Horários" },
];

export function ConfiguracoesTabs({ active }: { active: string }) {
  return (
    <div className="flex gap-2 border-b border-ink-line pb-4">
      {TABS.map((tab) => (
        <Link
          key={tab.value}
          href={`/admin/configuracoes?tab=${tab.value}`}
          aria-current={tab.value === active ? "page" : undefined}
          className={`rounded-sm border px-3 py-1.5 text-sm transition-colors ${
            tab.value === active
              ? "border-gold bg-ink-raised text-paper"
              : "border-ink-line text-paper-dim hover:border-ink-line-strong"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Write the Identidade panel**

Create `components/admin/configuracoes/IdentityPanel.tsx`:
```tsx
"use client";

import { useState, useTransition } from "react";
import type { Tables } from "@/lib/database.types";
import { updateSiteIdentity } from "@/app/admin/configuracoes/actions";

export function IdentityPanel({ siteConfig }: { siteConfig: Tables<"site_config"> }) {
  const [name, setName] = useState(siteConfig.name);
  const [about, setAbout] = useState(siteConfig.about ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateSiteIdentity({ name, about });
      if (result.success) {
        setSaved(true);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-4">
      <div>
        <label className="text-xs uppercase tracking-[0.2em] text-paper-dim">
          Nome da barbearia
        </label>
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1.5 w-full rounded-sm border border-ink-line bg-transparent px-3 py-2.5 text-sm text-paper focus:border-gold"
        />
      </div>
      <div>
        <label className="text-xs uppercase tracking-[0.2em] text-paper-dim">
          Texto da hero (abaixo do nome)
        </label>
        <textarea
          rows={3}
          value={about}
          onChange={(e) => setAbout(e.target.value)}
          className="mt-1.5 w-full rounded-sm border border-ink-line bg-transparent px-3 py-2.5 text-sm text-paper focus:border-gold"
        />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      {saved && !error && <p className="text-sm text-gold">Salvo.</p>}
      <button
        type="submit"
        disabled={isPending}
        className="rounded-sm bg-gold px-5 py-2.5 text-sm font-semibold text-gold-ink transition-colors hover:bg-gold-bright disabled:opacity-40"
      >
        {isPending ? "Salvando..." : "Salvar"}
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Write the page shell**

Create `app/admin/configuracoes/page.tsx`:
```tsx
import { createClient } from "@/lib/supabase/server";
import { ConfiguracoesTabs } from "@/components/admin/configuracoes/ConfiguracoesTabs";
import { IdentityPanel } from "@/components/admin/configuracoes/IdentityPanel";

type Tab = "identidade" | "barbeiros" | "servicos" | "horarios";

function parseTab(value: string | undefined): Tab {
  if (value === "barbeiros" || value === "servicos" || value === "horarios") return value;
  return "identidade";
}

export default async function ConfiguracoesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; barberId?: string }>;
}) {
  const params = await searchParams;
  const tab = parseTab(params.tab);

  const supabase = await createClient();
  const [{ data: siteConfig }, { data: barbers }, { data: services }, { data: schedules }] =
    await Promise.all([
      supabase.from("site_config").select("*").limit(1).maybeSingle(),
      supabase.from("barbers").select("*").order("name"),
      supabase.from("services").select("*").order("name"),
      supabase.from("barber_schedules").select("*"),
    ]);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="font-display text-2xl text-paper">Configurações</h1>
        <p className="mt-1 text-sm text-paper-dim">
          Identidade, barbeiros, serviços e horários de funcionamento.
        </p>
      </div>

      <ConfiguracoesTabs active={tab} />

      {tab === "identidade" && siteConfig && <IdentityPanel siteConfig={siteConfig} />}
      {tab === "barbeiros" && <p className="text-sm text-paper-dim">{(barbers ?? []).length} barbeiro(s) — painel chega na Task 9.</p>}
      {tab === "servicos" && <p className="text-sm text-paper-dim">{(services ?? []).length} serviço(s) — painel chega na Task 10.</p>}
      {tab === "horarios" && <p className="text-sm text-paper-dim">{(schedules ?? []).length} linha(s) de horário — painel chega na Task 11.</p>}
    </div>
  );
}
```
(the three placeholder `<p>` lines are replaced in Tasks 9-11 — they exist only so this task's deliverable is independently reviewable and the route works end-to-end today.)

- [ ] **Step 5: Manual check**

Run `npm run dev`, log into `/admin`, open `/admin/configuracoes`. Confirm the four tabs render, Identidade loads current `name`/`about`, editing and saving updates `/` after a refresh, and the other three tabs show their placeholder counts.

- [ ] **Step 6: Commit**

```bash
git add app/admin/configuracoes/page.tsx components/admin/configuracoes/ConfiguracoesTabs.tsx components/admin/configuracoes/IdentityPanel.tsx app/admin/layout.tsx
git commit -m "feat: add admin configuracoes route with tabs and identidade panel"
```

---

### Task 9: Barbeiros panel

**Files:**
- Create: `components/admin/configuracoes/BarbersPanel.tsx`
- Modify: `app/admin/configuracoes/page.tsx` (replace the `barbeiros` placeholder)

**Interfaces:**
- Consumes: `createBarber`, `updateBarberName`, `setBarberActive` from Task 7.
- Produces: nothing consumed by later tasks (leaf UI).

- [ ] **Step 1: Write the panel**

Create `components/admin/configuracoes/BarbersPanel.tsx`:
```tsx
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { Tables } from "@/lib/database.types";
import { createBarber, updateBarberName, setBarberActive } from "@/app/admin/configuracoes/actions";

export function BarbersPanel({ barbers }: { barbers: Tables<"barbers">[] }) {
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCreate(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    if (!newName.trim()) return;
    setError(null);
    startTransition(async () => {
      const result = await createBarber(newName.trim());
      if (result.success) {
        setNewName("");
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleCreate} className="flex gap-2">
        <input
          type="text"
          placeholder="Nome do novo barbeiro"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="flex-1 rounded-sm border border-ink-line bg-transparent px-3 py-2.5 text-sm text-paper placeholder:text-paper-dim focus:border-gold"
        />
        <button
          type="submit"
          disabled={isPending || !newName.trim()}
          className="rounded-sm bg-gold px-5 py-2.5 text-sm font-semibold text-gold-ink transition-colors hover:bg-gold-bright disabled:opacity-40"
        >
          Adicionar
        </button>
      </form>
      {error && <p className="text-sm text-danger">{error}</p>}

      <ul className="divide-y divide-ink-line border-t border-ink-line">
        {barbers.map((barber) => (
          <BarberRow key={barber.id} barber={barber} />
        ))}
      </ul>
    </div>
  );
}

function BarberRow({ barber }: { barber: Tables<"barbers"> }) {
  const [name, setName] = useState(barber.name);
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleRename(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    if (!name.trim()) return;
    startTransition(async () => {
      await updateBarberName(barber.id, name.trim());
      setEditing(false);
    });
  }

  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      {editing ? (
        <form onSubmit={handleRename} className="flex flex-1 gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            className="flex-1 rounded-sm border border-ink-line bg-transparent px-3 py-1.5 text-sm text-paper focus:border-gold"
          />
          <button type="submit" disabled={isPending} className="text-sm text-gold">
            Salvar
          </button>
          <button type="button" onClick={() => setEditing(false)} className="text-sm text-paper-dim">
            Cancelar
          </button>
        </form>
      ) : (
        <>
          <span className={`flex-1 text-sm ${barber.active ? "text-paper" : "text-paper-dim line-through"}`}>
            {barber.name}
          </span>
          <Link
            href={`/admin/configuracoes?tab=horarios&barberId=${barber.id}`}
            className="text-xs text-paper-dim transition-colors hover:text-gold"
          >
            editar horário
          </Link>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs text-paper-dim transition-colors hover:text-gold"
          >
            renomear
          </button>
          <button
            type="button"
            onClick={() =>
              startTransition(async () => {
                await setBarberActive(barber.id, !barber.active);
              })
            }
            disabled={isPending}
            className="text-xs text-paper-dim transition-colors hover:text-gold"
          >
            {barber.active ? "desativar" : "reativar"}
          </button>
        </>
      )}
    </li>
  );
}
```

- [ ] **Step 2: Plug it into the page**

In `app/admin/configuracoes/page.tsx`, add the import `import { BarbersPanel } from "@/components/admin/configuracoes/BarbersPanel";` and replace the `barbeiros` placeholder line with:
```tsx
      {tab === "barbeiros" && <BarbersPanel barbers={barbers ?? []} />}
```

- [ ] **Step 3: Manual check**

On `/admin/configuracoes?tab=barbeiros`: create a barber, rename one, deactivate one (confirm it still shows, struck through, and disappears from `/agendar`'s barber picker), reactivate it.

- [ ] **Step 4: Commit**

```bash
git add components/admin/configuracoes/BarbersPanel.tsx app/admin/configuracoes/page.tsx
git commit -m "feat: add barbeiros CRUD panel to admin configuracoes"
```

---

### Task 10: Serviços panel

**Files:**
- Create: `components/admin/configuracoes/ServicesPanel.tsx`
- Modify: `app/admin/configuracoes/page.tsx` (replace the `servicos` placeholder)

**Interfaces:**
- Consumes: `createService`, `updateService`, `setServiceActive` from Task 7; `formatDuration`, `formatPriceBRL` from `@/lib/format`.
- Produces: nothing consumed by later tasks (leaf UI).

- [ ] **Step 1: Write the panel**

Create `components/admin/configuracoes/ServicesPanel.tsx`:
```tsx
"use client";

import { useState, useTransition } from "react";
import type { Tables } from "@/lib/database.types";
import { formatDuration, formatPriceBRL } from "@/lib/format";
import { createService, updateService, setServiceActive } from "@/app/admin/configuracoes/actions";

export function ServicesPanel({ services }: { services: Tables<"services">[] }) {
  const [editingService, setEditingService] = useState<Tables<"services"> | "new" | null>(null);

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={() => setEditingService("new")}
        className="rounded-sm bg-gold px-5 py-2.5 text-sm font-semibold text-gold-ink transition-colors hover:bg-gold-bright"
      >
        Novo serviço
      </button>

      <ul className="divide-y divide-ink-line border-t border-ink-line">
        {services.map((service) => (
          <ServiceRow key={service.id} service={service} onEdit={() => setEditingService(service)} />
        ))}
      </ul>

      {editingService && (
        <ServiceForm
          service={editingService === "new" ? null : editingService}
          onClose={() => setEditingService(null)}
        />
      )}
    </div>
  );
}

function ServiceRow({
  service,
  onEdit,
}: {
  service: Tables<"services">;
  onEdit: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <span className={`flex-1 text-sm ${service.active ? "text-paper" : "text-paper-dim line-through"}`}>
        {service.name}
      </span>
      <span className="text-xs text-paper-dim">{formatDuration(service.duration_minutes)}</span>
      <span className="text-xs text-paper-dim">{formatPriceBRL(service.price_cents)}</span>
      <button type="button" onClick={onEdit} className="text-xs text-paper-dim transition-colors hover:text-gold">
        editar
      </button>
      <button
        type="button"
        onClick={() =>
          startTransition(async () => {
            await setServiceActive(service.id, !service.active);
          })
        }
        disabled={isPending}
        className="text-xs text-paper-dim transition-colors hover:text-gold"
      >
        {service.active ? "desativar" : "reativar"}
      </button>
    </li>
  );
}

function ServiceForm({
  service,
  onClose,
}: {
  service: Tables<"services"> | null;
  onClose: () => void;
}) {
  const [name, setName] = useState(service?.name ?? "");
  const [duration, setDuration] = useState(String(service?.duration_minutes ?? 30));
  const [price, setPrice] = useState(service ? (service.price_cents / 100).toFixed(2) : "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    const durationMinutes = parseInt(duration, 10);
    const priceCents = Math.round(parseFloat(price.replace(",", ".")) * 100);
    if (!name.trim() || !durationMinutes || Number.isNaN(priceCents)) return;

    setError(null);
    startTransition(async () => {
      const result = service
        ? await updateService(service.id, { name: name.trim(), durationMinutes, priceCents })
        : await createService({ name: name.trim(), durationMinutes, priceCents });

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
        <h2 className="font-display text-lg text-paper">
          {service ? "Editar serviço" : "Novo serviço"}
        </h2>
        <form onSubmit={handleSubmit} className="mt-5 space-y-3">
          <input
            type="text"
            placeholder="Nome"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-sm border border-ink-line bg-transparent px-3 py-2.5 text-sm text-paper placeholder:text-paper-dim focus:border-gold"
          />
          <input
            type="number"
            min={5}
            step={5}
            placeholder="Duração (minutos)"
            required
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="w-full rounded-sm border border-ink-line bg-transparent px-3 py-2.5 text-sm text-paper placeholder:text-paper-dim focus:border-gold"
          />
          <input
            type="text"
            inputMode="decimal"
            placeholder="Preço (R$)"
            required
            value={price}
            onChange={(e) => setPrice(e.target.value)}
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
              disabled={isPending}
              className="flex-1 rounded-sm bg-gold py-2.5 text-sm font-semibold text-gold-ink transition-colors hover:bg-gold-bright disabled:opacity-40"
            >
              {isPending ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Plug it into the page**

In `app/admin/configuracoes/page.tsx`, add `import { ServicesPanel } from "@/components/admin/configuracoes/ServicesPanel";` and replace the `servicos` placeholder with:
```tsx
      {tab === "servicos" && <ServicesPanel services={services ?? []} />}
```

- [ ] **Step 3: Manual check**

On `/admin/configuracoes?tab=servicos`: create a service, edit its price/duration, deactivate it (confirm it disappears from `/agendar`'s service picker), reactivate it.

- [ ] **Step 4: Commit**

```bash
git add components/admin/configuracoes/ServicesPanel.tsx app/admin/configuracoes/page.tsx
git commit -m "feat: add servicos CRUD panel to admin configuracoes"
```

---

### Task 11: Horários panel

**Files:**
- Create: `components/admin/configuracoes/SchedulesPanel.tsx`
- Modify: `app/admin/configuracoes/page.tsx` (replace the `horarios` placeholder)

**Interfaces:**
- Consumes: `saveBarberSchedule`, `type BarberScheduleDay` from Task 7.
- Produces: nothing consumed by later tasks (leaf UI). This is the last functional piece of the spec.

- [ ] **Step 1: Write the panel**

Create `components/admin/configuracoes/SchedulesPanel.tsx`:
```tsx
"use client";

import { useState, useTransition } from "react";
import type { Tables } from "@/lib/database.types";
import { saveBarberSchedule, type BarberScheduleDay } from "@/app/admin/configuracoes/actions";

const WEEKDAYS = [
  { value: 0, label: "Domingo" },
  { value: 1, label: "Segunda" },
  { value: 2, label: "Terça" },
  { value: 3, label: "Quarta" },
  { value: 4, label: "Quinta" },
  { value: 5, label: "Sexta" },
  { value: 6, label: "Sábado" },
];

function buildInitialDays(
  barberId: string,
  schedules: Tables<"barber_schedules">[]
): BarberScheduleDay[] {
  const rowsByWeekday = new Map<number, Tables<"barber_schedules">[]>();
  for (const row of schedules) {
    if (row.barber_id !== barberId) continue;
    const list = rowsByWeekday.get(row.weekday) ?? [];
    list.push(row);
    rowsByWeekday.set(row.weekday, list);
  }

  return WEEKDAYS.map(({ value: weekday }) => {
    const rows = (rowsByWeekday.get(weekday) ?? []).sort((a, b) =>
      a.start_time.localeCompare(b.start_time)
    );

    if (rows.length === 0) {
      return {
        weekday,
        closed: true,
        start: "09:00",
        end: "18:00",
        hasBreak: false,
        breakStart: "12:00",
        breakEnd: "13:00",
      };
    }
    if (rows.length === 1) {
      return {
        weekday,
        closed: false,
        start: rows[0].start_time.slice(0, 5),
        end: rows[0].end_time.slice(0, 5),
        hasBreak: false,
        breakStart: "12:00",
        breakEnd: "13:00",
      };
    }
    return {
      weekday,
      closed: false,
      start: rows[0].start_time.slice(0, 5),
      end: rows[rows.length - 1].end_time.slice(0, 5),
      hasBreak: true,
      breakStart: rows[0].end_time.slice(0, 5),
      breakEnd: rows[1].start_time.slice(0, 5),
    };
  });
}

export function SchedulesPanel({
  barbers,
  schedules,
  initialBarberId,
}: {
  barbers: Tables<"barbers">[];
  schedules: Tables<"barber_schedules">[];
  initialBarberId?: string;
}) {
  const [barberId, setBarberId] = useState(
    initialBarberId && barbers.some((b) => b.id === initialBarberId)
      ? initialBarberId
      : barbers[0]?.id ?? ""
  );
  const [days, setDays] = useState<BarberScheduleDay[]>(() => buildInitialDays(barberId, schedules));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSelectBarber(nextBarberId: string) {
    setBarberId(nextBarberId);
    setDays(buildInitialDays(nextBarberId, schedules));
    setSaved(false);
    setError(null);
  }

  function updateDay(weekday: number, patch: Partial<BarberScheduleDay>) {
    setDays((current) => current.map((day) => (day.weekday === weekday ? { ...day, ...patch } : day)));
  }

  function handleSave() {
    if (!barberId) return;
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await saveBarberSchedule(barberId, days);
      if (result.success) {
        setSaved(true);
      } else {
        setError(result.error);
      }
    });
  }

  if (barbers.length === 0) {
    return <p className="text-sm text-paper-dim">Cadastre um barbeiro ativo primeiro.</p>;
  }

  return (
    <div className="space-y-6">
      {barbers.length > 1 && (
        <select
          value={barberId}
          onChange={(e) => handleSelectBarber(e.target.value)}
          className="rounded-sm border border-ink-line bg-transparent px-3 py-2 text-sm text-paper focus:border-gold"
        >
          {barbers.map((barber) => (
            <option key={barber.id} value={barber.id} className="bg-ink">
              {barber.name}
            </option>
          ))}
        </select>
      )}

      <div className="space-y-3">
        {days.map((day) => (
          <div key={day.weekday} className="flex flex-wrap items-center gap-3 border-b border-ink-line pb-3">
            <span className="w-24 text-sm text-paper">{WEEKDAYS[day.weekday].label}</span>
            <label className="flex items-center gap-1.5 text-xs text-paper-dim">
              <input
                type="checkbox"
                checked={!day.closed}
                onChange={(e) => updateDay(day.weekday, { closed: !e.target.checked })}
              />
              aberto
            </label>
            {!day.closed && (
              <>
                <input
                  type="time"
                  value={day.start}
                  onChange={(e) => updateDay(day.weekday, { start: e.target.value })}
                  className="rounded-sm border border-ink-line bg-transparent px-2 py-1 text-sm text-paper focus:border-gold"
                />
                <span className="text-paper-dim">às</span>
                <input
                  type="time"
                  value={day.end}
                  onChange={(e) => updateDay(day.weekday, { end: e.target.value })}
                  className="rounded-sm border border-ink-line bg-transparent px-2 py-1 text-sm text-paper focus:border-gold"
                />
                <label className="flex items-center gap-1.5 text-xs text-paper-dim">
                  <input
                    type="checkbox"
                    checked={day.hasBreak}
                    onChange={(e) => updateDay(day.weekday, { hasBreak: e.target.checked })}
                  />
                  tem intervalo
                </label>
                {day.hasBreak && (
                  <>
                    <input
                      type="time"
                      value={day.breakStart}
                      onChange={(e) => updateDay(day.weekday, { breakStart: e.target.value })}
                      className="rounded-sm border border-ink-line bg-transparent px-2 py-1 text-sm text-paper focus:border-gold"
                    />
                    <span className="text-paper-dim">às</span>
                    <input
                      type="time"
                      value={day.breakEnd}
                      onChange={(e) => updateDay(day.weekday, { breakEnd: e.target.value })}
                      className="rounded-sm border border-ink-line bg-transparent px-2 py-1 text-sm text-paper focus:border-gold"
                    />
                  </>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      {saved && !error && <p className="text-sm text-gold">Horário salvo.</p>}

      <button
        type="button"
        onClick={handleSave}
        disabled={isPending}
        className="rounded-sm bg-gold px-5 py-2.5 text-sm font-semibold text-gold-ink transition-colors hover:bg-gold-bright disabled:opacity-40"
      >
        {isPending ? "Salvando..." : "Salvar horário"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Plug it into the page**

In `app/admin/configuracoes/page.tsx`, add `import { SchedulesPanel } from "@/components/admin/configuracoes/SchedulesPanel";` and replace the `horarios` placeholder with:
```tsx
      {tab === "horarios" && (
        <SchedulesPanel
          barbers={(barbers ?? []).filter((b) => b.active)}
          schedules={schedules ?? []}
          initialBarberId={params.barberId}
        />
      )}
```

- [ ] **Step 3: Manual check — full end-to-end walkthrough (covers spec section 4's manual checklist)**

1. On `/admin/configuracoes?tab=barbeiros`, click "editar horário" on a barber → lands on `?tab=horarios&barberId=...` with that barber pre-selected.
2. Set Monday 09:00–18:00 with a lunch break 12:00–13:00, save. Confirm `/agendar` for that barber on a Monday has no slots offered between 12:00–13:00, and the slot right after 13:00 is offered.
3. With the fila toggle "aberta" in `/admin/fila`, visit `/fila` outside any barber's configured hours (e.g. set all schedules to a day/time that excludes "now") — confirm it shows "Fila fechada" and `/admin/fila` shows the auto-closed warning.
4. Clear every barber's schedule for a given weekday entirely (both days "aberto" unchecked) — confirm that day disappears from the Hero/Footer/ContactSection opening-hours text on `/`.
5. Rename the barbearia and edit the hero text in Identidade — confirm both show on `/` after refresh.

- [ ] **Step 4: Run the full automated check**

Run: `npm run test`
Expected: PASS (all suites, including the new `lib/business-hours.test.ts`).

Run: `npm run lint`
Expected: PASS, no errors.

- [ ] **Step 5: Commit**

```bash
git add components/admin/configuracoes/SchedulesPanel.tsx app/admin/configuracoes/page.tsx
git commit -m "feat: add horarios panel to admin configuracoes, completing the feature"
```
