# Dashboard Charts, Period Filter & Demo Seed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Hoje/Semana/Mês period filter to `/admin`, replace the "Por serviço"/"Por barbeiro" text lists with hand-built gold bar charts, add a new daily-revenue bar chart, and ship a separate demo-data SQL script so the dashboard has something real to show in dev.

**Architecture:** A new pure module (`lib/period.ts`) computes the date range and the list of calendar days for a period — no Supabase/Next dependency, so it's unit-testable like `lib/day-agenda.ts`. `lib/admin-data.ts`'s `getMonthSummary` is replaced by `getPeriodSummary(period)`, which uses `lib/period.ts` to query the right window and returns a new `byDay` array (every day in range, zero-filled). Charts are hand-built HTML/CSS (flex layout, inline pixel/percent sizing) per the `dataviz` skill's guidance for a single-series magnitude chart — solid gold bars, no legend, native `title` tooltips, direct value labels only when there are few enough bars to not get cluttered. No charting library is added.

**Tech Stack:** Same as the rest of the admin area — Next.js 16 App Router (Server Components only), Supabase, Tailwind CSS v4, Vitest for the one new pure module.

## Global Constraints

- Single-series charts (one gold hue, one metric) never get a legend — only ≥2 series need one. Source: `dataviz` skill, `references/marks-and-anatomy.md`.
- Corner radius for any new bar/chart element is `rounded-sm` (the project's committed 2px token in DESIGN.md), not the dataviz skill's generic 4px default — DESIGN.md's explicit brief wins over the generic guidance.
- Text (labels, values, axis ticks) never uses the series color as its own text color choice *because* it's the series color — `text-gold` is fine here because gold is also this project's committed "price/emphasis" text token (see the existing Faturamento figure), not because it's the bar's fill.
- No new npm dependency for charting — everything is Tailwind + plain SVG/HTML already used elsewhere in the repo.
- `supabase/demo-seed.sql` is never referenced from `supabase/seed.sql` or any app code — it's a standalone, manually-run script, clearly commented as dev-only.
- `searchParams` in `page.tsx` is a Promise in this Next.js version — always `await` it.
- Commit after every task, Conventional Commits style.

---

### Task 1: `lib/period.ts` — pure period/date-range logic

**Files:**
- Create: `lib/period.ts`
- Test: `lib/period.test.ts`

**Interfaces:**
- Produces:
  - `export type Period = "today" | "week" | "month"`
  - `export type DateRange = { start: Date; end: Date }`
  - `export function periodRange(period: Period, now: Date): DateRange`
  - `export function enumerateDays(range: DateRange): Date[]`
- Consumed by: `lib/admin-data.ts` (Task 2), `app/admin/page.tsx` and `components/admin/PeriodFilter.tsx` (Task 5).

- [ ] **Step 1: Write the failing tests**

Create `lib/period.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/period.test.ts`
Expected: FAIL with "Cannot find module './period'".

- [ ] **Step 3: Write the implementation**

Create `lib/period.ts`:

```ts
export type Period = "today" | "week" | "month";

export type DateRange = { start: Date; end: Date };

export function periodRange(period: Period, now: Date): DateRange {
  if (period === "today") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
    return { start, end };
  }

  if (period === "week") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
    return { start, end };
  }

  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { start, end };
}

export function enumerateDays(range: DateRange): Date[] {
  const days: Date[] = [];
  for (
    let d = new Date(range.start);
    d.getTime() < range.end.getTime();
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
  ) {
    days.push(d);
  }
  return days;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/period.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/period.ts lib/period.test.ts
git commit -m "feat: add period range and day enumeration helpers"
```

---

### Task 2: `getPeriodSummary` in `lib/admin-data.ts`

**Files:**
- Modify: `lib/admin-data.ts`

**Interfaces:**
- Consumes: `periodRange`, `enumerateDays`, `type Period` from `lib/period.ts` (Task 1); the existing `toDateKey` already defined in this file (added for `getMonthAgendaSummary`).
- Produces:
  - `export type BreakdownRow = { name: string; count: number; revenueCents: number }` (was already defined, not exported — now exported)
  - `export type DaySummary = { date: string; revenueCents: number }`
  - `export type PeriodSummary = { revenueCents: number; appointmentCount: number; completedCount: number; byService: BreakdownRow[]; byBarber: BreakdownRow[]; byDay: DaySummary[] }`
  - `export async function getPeriodSummary(period: Period): Promise<PeriodSummary>`
- Removes: `getMonthSummary`, `MonthSummary`, `startOfMonth` (no other file imports any of these — confirmed by `app/admin/page.tsx` being the only consumer, replaced in Task 5).
- Consumed by: `app/admin/page.tsx` (Task 5), `components/admin/BreakdownBarChart.tsx` and `components/admin/RevenueByDayChart.tsx` (Tasks 3–4, via the types only).

- [ ] **Step 1: Add the import**

At the top of `lib/admin-data.ts`, add:

```ts
import { periodRange, enumerateDays, type Period } from "@/lib/period";
```

- [ ] **Step 2: Export `BreakdownRow`**

Change:

```ts
type BreakdownRow = { name: string; count: number; revenueCents: number };
```

to:

```ts
export type BreakdownRow = { name: string; count: number; revenueCents: number };
```

- [ ] **Step 3: Replace `getMonthSummary` with `getPeriodSummary`**

Delete the existing `export type MonthSummary = {...}` block, the `function startOfMonth(date: Date) {...}` function, and the `export async function getMonthSummary(): Promise<MonthSummary> {...}` function (everything between `export type BreakdownRow` and `export type UpcomingAppointment`). Replace with:

```ts
export type DaySummary = { date: string; revenueCents: number };

export type PeriodSummary = {
  revenueCents: number;
  appointmentCount: number;
  completedCount: number;
  byService: BreakdownRow[];
  byBarber: BreakdownRow[];
  byDay: DaySummary[];
};

export async function getPeriodSummary(period: Period): Promise<PeriodSummary> {
  const supabase = await createClient();
  const { start, end } = periodRange(period, new Date());

  const [{ data: appointments }, { data: services }, { data: barbers }] =
    await Promise.all([
      supabase
        .from("appointments")
        .select("status, service_id, barber_id, starts_at")
        .gte("starts_at", start.toISOString())
        .lt("starts_at", end.toISOString()),
      supabase.from("services").select("id, name, price_cents"),
      supabase.from("barbers").select("id, name"),
    ]);

  const serviceById = new Map((services ?? []).map((s) => [s.id, s]));
  const barberById = new Map((barbers ?? []).map((b) => [b.id, b]));

  const byServiceMap = new Map<string, BreakdownRow>();
  const byBarberMap = new Map<string, BreakdownRow>();
  const byDayMap = new Map<string, number>(
    enumerateDays({ start, end }).map((d) => [toDateKey(d), 0])
  );
  let revenueCents = 0;
  let completedCount = 0;

  for (const appt of appointments ?? []) {
    if (appt.status !== "concluido") continue;
    completedCount += 1;

    const service = serviceById.get(appt.service_id);
    const barber = barberById.get(appt.barber_id);
    const priceCents = service?.price_cents ?? 0;
    revenueCents += priceCents;

    const dayKey = toDateKey(new Date(appt.starts_at));
    byDayMap.set(dayKey, (byDayMap.get(dayKey) ?? 0) + priceCents);

    if (service) {
      const row = byServiceMap.get(service.id) ?? {
        name: service.name,
        count: 0,
        revenueCents: 0,
      };
      row.count += 1;
      row.revenueCents += priceCents;
      byServiceMap.set(service.id, row);
    }

    if (barber) {
      const row = byBarberMap.get(barber.id) ?? {
        name: barber.name,
        count: 0,
        revenueCents: 0,
      };
      row.count += 1;
      row.revenueCents += priceCents;
      byBarberMap.set(barber.id, row);
    }
  }

  return {
    revenueCents,
    appointmentCount: (appointments ?? []).length,
    completedCount,
    byService: Array.from(byServiceMap.values()).sort(
      (a, b) => b.revenueCents - a.revenueCents
    ),
    byBarber: Array.from(byBarberMap.values()).sort(
      (a, b) => b.revenueCents - a.revenueCents
    ),
    byDay: Array.from(byDayMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, dayRevenueCents]) => ({ date, revenueCents: dayRevenueCents })),
  };
}
```

Note: `toDateKey` here is the function already present in this file (added for `getMonthAgendaSummary`) — do not redefine it.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: FAIL — `app/admin/page.tsx` still imports `getMonthSummary`, which no longer exists. This is expected; Task 5 fixes it. If any other error appears, stop and investigate.

- [ ] **Step 5: Commit**

```bash
git add lib/admin-data.ts
git commit -m "feat: replace getMonthSummary with period-aware getPeriodSummary"
```

---

### Task 3: `components/admin/RevenueByDayChart.tsx`

**Files:**
- Create: `components/admin/RevenueByDayChart.tsx`

**Interfaces:**
- Consumes: `DaySummary` from `lib/admin-data.ts` (Task 2); `formatPriceBRL` from `lib/format.ts`.
- Produces: `export function RevenueByDayChart({ days }: { days: DaySummary[] }): JSX.Element`
- Consumed by: `app/admin/page.tsx` (Task 5).

- [ ] **Step 1: Create the component**

Create `components/admin/RevenueByDayChart.tsx`:

```tsx
import { formatPriceBRL } from "@/lib/format";
import type { DaySummary } from "@/lib/admin-data";

const CHART_HEIGHT = 176;
const LABEL_SPACE = 20;
const VALUE_LABEL_SPACE = 22;

function formatDayLabel(dateKey: string, showWeekday: boolean): string {
  const date = new Date(`${dateKey}T00:00:00`);
  if (showWeekday) {
    return date
      .toLocaleDateString("pt-BR", { weekday: "short" })
      .replace(".", "")
      .toUpperCase();
  }
  return String(date.getDate());
}

function formatDayTitle(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00`);
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    weekday: "short",
  });
}

export function RevenueByDayChart({ days }: { days: DaySummary[] }) {
  if (days.length === 0) {
    return <p className="text-sm text-paper-dim">Sem dados neste período.</p>;
  }

  const maxRevenue = Math.max(...days.map((d) => d.revenueCents), 1);
  const showValueLabels = days.length <= 7;
  const maxBarHeight = CHART_HEIGHT - LABEL_SPACE - (showValueLabels ? VALUE_LABEL_SPACE : 0);

  return (
    <div className="flex items-end gap-1" style={{ height: CHART_HEIGHT }}>
      {days.map((day) => {
        const barHeight =
          day.revenueCents > 0
            ? Math.max((day.revenueCents / maxRevenue) * maxBarHeight, 3)
            : 2;
        return (
          <div
            key={day.date}
            title={`${formatDayTitle(day.date)} — ${formatPriceBRL(day.revenueCents)}`}
            className="flex min-w-0 flex-1 flex-col items-center justify-end"
          >
            {showValueLabels && (
              <span
                className="mb-1 text-[11px] tabular-nums text-gold"
                style={{ visibility: day.revenueCents > 0 ? "visible" : "hidden" }}
              >
                {formatPriceBRL(day.revenueCents)}
              </span>
            )}
            <div
              className={`w-full max-w-6 rounded-t-sm ${
                day.revenueCents > 0 ? "bg-gold" : "bg-ink-line-strong"
              }`}
              style={{ height: barHeight }}
            />
            <span className="mt-1.5 text-[10px] text-paper-dim">
              {formatDayLabel(day.date, showValueLabels)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: Still FAIL for the same `app/admin/page.tsx` reason as Task 2 — confirm no *new* errors came from this file.

- [ ] **Step 3: Commit**

```bash
git add components/admin/RevenueByDayChart.tsx
git commit -m "feat: add RevenueByDayChart"
```

---

### Task 4: `components/admin/BreakdownBarChart.tsx`

**Files:**
- Create: `components/admin/BreakdownBarChart.tsx`

**Interfaces:**
- Consumes: `BreakdownRow` from `lib/admin-data.ts` (Task 2); `formatPriceBRL` from `lib/format.ts`.
- Produces: `export function BreakdownBarChart({ rows }: { rows: BreakdownRow[] }): JSX.Element`
- Consumed by: `app/admin/page.tsx` (Task 5), once for "Por serviço" and once for "Por barbeiro".

- [ ] **Step 1: Create the component**

Create `components/admin/BreakdownBarChart.tsx`:

```tsx
import { formatPriceBRL } from "@/lib/format";
import type { BreakdownRow } from "@/lib/admin-data";

export function BreakdownBarChart({ rows }: { rows: BreakdownRow[] }) {
  const maxRevenue = Math.max(...rows.map((r) => r.revenueCents), 1);

  return (
    <ul className="space-y-4">
      {rows.map((row) => {
        const widthPercent = Math.max((row.revenueCents / maxRevenue) * 100, 4);
        return (
          <li key={row.name}>
            <div className="flex items-baseline justify-between gap-4 text-sm">
              <span className="text-paper">{row.name}</span>
              <span className="shrink-0 tabular-nums text-paper-dim">
                {row.count}× · {formatPriceBRL(row.revenueCents)}
              </span>
            </div>
            <div
              className="mt-2 h-2 rounded-sm bg-gold"
              style={{ width: `${widthPercent}%` }}
            />
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: Still FAIL for the same `app/admin/page.tsx` reason — confirm no *new* errors from this file.

- [ ] **Step 3: Commit**

```bash
git add components/admin/BreakdownBarChart.tsx
git commit -m "feat: add BreakdownBarChart"
```

---

### Task 5: `components/admin/PeriodFilter.tsx` and rewire `app/admin/page.tsx`

**Files:**
- Create: `components/admin/PeriodFilter.tsx`
- Modify: `app/admin/page.tsx`

**Interfaces:**
- Produces: `export function PeriodFilter({ active }: { active: Period }): JSX.Element`
- Consumes: `getPeriodSummary`, `getUpcomingAppointments`, `type Period` (from `lib/period.ts`), `PeriodFilter`, `RevenueByDayChart`, `BreakdownBarChart`.

- [ ] **Step 1: Create `PeriodFilter.tsx`**

Create `components/admin/PeriodFilter.tsx`:

```tsx
import Link from "next/link";
import type { Period } from "@/lib/period";

const OPTIONS: { value: Period; label: string }[] = [
  { value: "today", label: "Hoje" },
  { value: "week", label: "Semana" },
  { value: "month", label: "Mês" },
];

export function PeriodFilter({ active }: { active: Period }) {
  return (
    <div className="flex gap-2">
      {OPTIONS.map((option) => (
        <Link
          key={option.value}
          href={`/admin?period=${option.value}`}
          aria-current={option.value === active ? "page" : undefined}
          className={`rounded-sm border px-3 py-1.5 text-sm transition-colors ${
            option.value === active
              ? "border-gold bg-ink-raised text-paper"
              : "border-ink-line text-paper-dim hover:border-ink-line-strong"
          }`}
        >
          {option.label}
        </Link>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Rewrite `app/admin/page.tsx`**

Replace the full contents of `app/admin/page.tsx` with:

```tsx
import { getPeriodSummary, getUpcomingAppointments } from "@/lib/admin-data";
import type { Period } from "@/lib/period";
import { formatPriceBRL } from "@/lib/format";
import { PeriodFilter } from "@/components/admin/PeriodFilter";
import { RevenueByDayChart } from "@/components/admin/RevenueByDayChart";
import { BreakdownBarChart } from "@/components/admin/BreakdownBarChart";

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const PERIOD_LABELS: Record<Period, string> = {
  today: "Hoje",
  week: "Esta semana",
  month: "Este mês",
};

function parsePeriod(value: string | undefined): Period {
  return value === "today" || value === "week" ? value : "month";
}

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const params = await searchParams;
  const period = parsePeriod(params.period);

  const [summary, upcoming] = await Promise.all([
    getPeriodSummary(period),
    getUpcomingAppointments(10),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-16">
      <div>
        <h1 className="font-display text-2xl text-paper">Dashboard</h1>
        <p className="mt-1 text-sm text-paper-dim">
          Resumo do período selecionado e próximos agendamentos.
        </p>
      </div>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-xs uppercase tracking-[0.2em] text-paper-dim">
            {PERIOD_LABELS[period]}
          </h2>
          <PeriodFilter active={period} />
        </div>

        <dl className="mt-4 flex flex-wrap items-baseline gap-x-12 gap-y-6 border-t border-ink-line pt-6">
          <div>
            <dt className="text-sm text-paper-dim">Faturamento</dt>
            <dd className="mt-1 font-display text-4xl tabular-nums text-gold">
              {formatPriceBRL(summary.revenueCents)}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-paper-dim">Atendimentos concluídos</dt>
            <dd className="mt-1 font-display text-xl tabular-nums text-paper-dim">
              {summary.completedCount}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-paper-dim">Total de agendamentos</dt>
            <dd className="mt-1 font-display text-xl tabular-nums text-paper-dim">
              {summary.appointmentCount}
            </dd>
          </div>
        </dl>

        <div className="mt-8">
          <RevenueByDayChart days={summary.byDay} />
        </div>
      </section>

      <div className="grid gap-16 sm:grid-cols-2">
        <section>
          <h2 className="text-xs uppercase tracking-[0.2em] text-paper-dim">
            Por serviço
          </h2>
          {summary.byService.length === 0 ? (
            <p className="mt-4 text-sm text-paper-dim">
              Nenhum atendimento concluído neste período ainda.
            </p>
          ) : (
            <div className="mt-4">
              <BreakdownBarChart rows={summary.byService} />
            </div>
          )}
        </section>

        <section>
          <h2 className="text-xs uppercase tracking-[0.2em] text-paper-dim">
            Por barbeiro
          </h2>
          {summary.byBarber.length === 0 ? (
            <p className="mt-4 text-sm text-paper-dim">
              Nenhum atendimento concluído neste período ainda.
            </p>
          ) : (
            <div className="mt-4">
              <BreakdownBarChart rows={summary.byBarber} />
            </div>
          )}
        </section>
      </div>

      <section>
        <h2 className="text-xs uppercase tracking-[0.2em] text-paper-dim">
          Próximos agendamentos
        </h2>
        {upcoming.length === 0 ? (
          <p className="mt-4 text-sm text-paper-dim">
            Nenhum agendamento futuro no momento.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-ink-line border-t border-ink-line">
            {upcoming.map((appt) => (
              <li
                key={appt.id}
                className="flex flex-wrap items-center gap-x-6 gap-y-1 py-3 text-sm"
              >
                <span className="w-40 shrink-0 tabular-nums text-paper">
                  {formatDateTime(appt.startsAt)}
                </span>
                <span className="flex-1 text-paper">{appt.clientName}</span>
                <span className="w-32 shrink-0 text-paper-dim">
                  {appt.serviceName}
                </span>
                <span className="w-28 shrink-0 text-paper-dim">
                  {appt.barberName}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS, no errors.

- [ ] **Step 4: Commit**

```bash
git add components/admin/PeriodFilter.tsx app/admin/page.tsx
git commit -m "feat: add period filter and wire charts into the dashboard"
```

---

### Task 6: `supabase/demo-seed.sql`

**Files:**
- Create: `supabase/demo-seed.sql`

- [ ] **Step 1: Create the script**

Create `supabase/demo-seed.sql`:

```sql
-- Demo data for local/dev dashboards — NOT the template seed.
-- supabase/seed.sql is the real per-client template seed and must stay
-- generic; this file is never referenced by it or by any app code.
--
-- Run this manually, only against your own dev/demo Supabase project:
--   supabase db execute -f supabase/demo-seed.sql
-- or paste it into the Supabase SQL editor.
--
-- Assumes at least one active barber and one active service already
-- exist (run supabase/seed.sql first, or use real cadastro data).

insert into clients (name, phone)
values
  ('Cliente Demo 1', '11900000001'),
  ('Cliente Demo 2', '11900000002'),
  ('Cliente Demo 3', '11900000003'),
  ('Cliente Demo 4', '11900000004'),
  ('Cliente Demo 5', '11900000005')
on conflict (phone) do nothing;

with
  barber_list as (
    select id, row_number() over (order by created_at) as rn
    from barbers where active = true
  ),
  barber_count as (select count(*) as n from barber_list),
  service_list as (
    select id, duration_minutes, row_number() over (order by created_at) as rn
    from services where active = true
  ),
  service_count as (select count(*) as n from service_list),
  client_list as (
    select id, row_number() over (order by created_at) as rn
    from clients where phone like '1190000%'
  ),
  client_count as (select count(*) as n from client_list),
  slots as (
    select
      d.day_offset,
      t.slot_time,
      row_number() over (order by d.day_offset, t.slot_time) as rn
    from generate_series(-28, 6) as d(day_offset)
    cross join (values (time '10:00'), (time '15:30')) as t(slot_time)
  )
insert into appointments (client_id, barber_id, service_id, starts_at, ends_at, status, origin)
select
  cl.id,
  b.id,
  sv.id,
  (current_date + s.day_offset + s.slot_time) as starts_at,
  (current_date + s.day_offset + s.slot_time) + (sv.duration_minutes || ' minutes')::interval as ends_at,
  case
    when s.day_offset > 0 then 'agendado'
    when s.rn % 9 = 0 then 'cancelado'
    when s.rn % 13 = 0 then 'faltou'
    else 'concluido'
  end as status,
  'avulso' as origin
from slots s
join client_list cl on cl.rn = ((s.rn - 1) % (select n from client_count)) + 1
join barber_list b on b.rn = ((s.rn - 1 + 1) % (select n from barber_count)) + 1
join service_list sv on sv.rn = ((s.rn - 1 + 2) % (select n from service_count)) + 1;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/demo-seed.sql
git commit -m "feat: add demo-seed.sql for populating dashboards in dev"
```

---

### Task 7: Run the demo seed and verify

**Files:** none (verification only)

- [ ] **Step 1: Run the full automated suite**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 2: Run the demo seed against the dev Supabase project**

Run (adjust to however this project already connects to Supabase — `supabase db execute -f supabase/demo-seed.sql`, or paste the file into the Supabase SQL editor for this project).

Then confirm the insert worked, e.g. via the Supabase SQL editor:

```sql
select count(*) from appointments where origin = 'avulso';
```

Expected: at least 56 rows beyond whatever existed before (28 days × 2 slots, minus any skipped by a day/barber/service count of zero — should not happen if `supabase/seed.sql` already ran).

- [ ] **Step 3: Manually verify in the browser**

Run: `npm run dev`, log into `/admin-login`, land on `/admin`, then:

1. Confirm the "Mês" period (default) shows a non-zero Faturamento and a daily bar chart with visible variation across the month, bars for days with zero revenue rendered as a thin neutral tick (not gold).
2. Click "Semana". Confirm the URL becomes `/admin?period=week`, the stats and both breakdown bar charts update, and the daily chart now shows ~7 bars with a value label above each non-zero bar.
3. Click "Hoje". Confirm it shows just today, including the case where today might have zero revenue (chart should still render, not crash, with the single bar as a thin tick).
4. Hover a bar in the daily chart. Confirm a native tooltip shows the date and exact amount.
5. Check "Por serviço" and "Por barbeiro": confirm the gold bars' relative lengths match the relative revenue numbers shown next to them, and that no service/barber name text overlaps or gets clipped by the bar below it.
6. Resize the browser narrow (~375px) and confirm the daily chart's day labels don't overlap each other illegibly for the "Mês" period — if they do, note it as a follow-up rather than blocking (admin is primarily a desktop tool per `PRODUCT.md`).

- [ ] **Step 4: Fix anything Step 3 found, in one batch — do not loop**

Per the `impeccable` skill's core principle: inspect once, fix everything found in a single pass, confirm with at most one more look, then stop. If label overflow or bar-height miscalculation shows up, adjust the constants in `RevenueByDayChart.tsx` directly rather than re-deriving the layout from scratch.

- [ ] **Step 5: Commit any fixes from Step 4**

```bash
git add -A
git commit -m "fix: adjust dashboard chart layout after visual verification"
```

(Skip this commit if Step 3 found nothing to fix.)
