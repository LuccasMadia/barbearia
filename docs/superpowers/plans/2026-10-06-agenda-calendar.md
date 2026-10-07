# Agenda Month Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/admin/agenda` into a month calendar (day cells show appointment count, today highlighted) and move the existing per-barber day board to `/admin/agenda/[date]`, so the owner can jump to any day instead of clicking "Próximo" repeatedly.

**Architecture:** `/admin/agenda` becomes a new Server Component that fetches a per-day appointment count for the requested month (`getMonthAgendaSummary`, a new thin query in `lib/admin-data.ts`) and renders it through a new `components/admin/AgendaMonthCalendar.tsx` — pure `<Link>`-based navigation, no client JS, mirroring how `DayNav` already works. The existing day-board page and its `DayNav` move unchanged (behaviorally) from `app/admin/agenda/` to `app/admin/agenda/[date]/`, trading the `?date=` query string for a route param, and `DayNav` gains a "← Calendário" link back to the month view.

**Tech Stack:** Same as the existing admin agenda feature — Next.js 16 App Router (Server Components only, no new Client Components), Supabase, Tailwind CSS v4.

## Global Constraints

- No past-date restriction in the new month calendar or its month navigation — the owner must be able to review history (unlike the public `/agendar` `MonthCalendar`, which disables past dates).
- Reuse the existing design tokens exactly: `bg-ink`, `text-paper`, `text-paper-dim`, `text-gold`, `border-ink-line`, `border-gold`, `font-display`, `rounded-sm` — same tokens the existing `MonthCalendar.tsx` and `DayNav.tsx` already use.
- `month` values are always `YYYY-MM` and `date` values always `YYYY-MM-DD`, both validated with regex before use, matching the existing convention in `app/admin/agenda/page.tsx` and `app/agendar/actions.ts`.
- `searchParams` and `params` in `page.tsx` are Promises in this Next.js version — always `await` them (see `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md`).
- No new test framework: `getMonthAgendaSummary` is a thin Supabase-fetching function, same category as the already-untested `getDayAgenda`/`getUpcomingAppointments` — verified by type-check and manual browser check, not a unit test.
- Commit after every task, Conventional Commits style.

---

### Task 1: `getMonthAgendaSummary` in `lib/admin-data.ts`

**Files:**
- Modify: `lib/admin-data.ts` (append at the end, after `getDayAgenda` which currently ends at line 220)

**Interfaces:**
- Produces: `export async function getMonthAgendaSummary(month: string): Promise<Record<string, number>>` — maps `"YYYY-MM-DD"` to the number of appointments (any status) starting that day.
- Consumed by: `app/admin/agenda/page.tsx` (Task 4).

- [ ] **Step 1: Append the function**

At the end of `lib/admin-data.ts`, add:

```ts
function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function getMonthAgendaSummary(month: string): Promise<Record<string, number>> {
  const [year, monthNumber] = month.split("-").map(Number);
  const monthStart = new Date(year, monthNumber - 1, 1);
  const monthEnd = new Date(year, monthNumber, 1);

  const supabase = await createClient();
  const { data: appointments } = await supabase
    .from("appointments")
    .select("starts_at")
    .gte("starts_at", monthStart.toISOString())
    .lt("starts_at", monthEnd.toISOString());

  const summary: Record<string, number> = {};
  for (const appt of appointments ?? []) {
    const key = toDateKey(new Date(appt.starts_at));
    summary[key] = (summary[key] ?? 0) + 1;
  }
  return summary;
}
```

Note: grouping uses local `Date` field getters (`getFullYear`/`getMonth`/`getDate`), not `toISOString().slice(0, 10)`, so a day's count matches the same local calendar day the rest of the admin UI displays (`getDayAgenda` and `AppointmentCard` both format times in local/`pt-BR` terms too).

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/admin-data.ts
git commit -m "feat: add getMonthAgendaSummary for the agenda calendar view"
```

---

### Task 2: `components/admin/AgendaMonthCalendar.tsx`

**Files:**
- Create: `components/admin/AgendaMonthCalendar.tsx`

**Interfaces:**
- Produces: `export function AgendaMonthCalendar({ month, summary }: { month: string; summary: Record<string, number> }): JSX.Element`
- Consumed by: `app/admin/agenda/page.tsx` (Task 4).

- [ ] **Step 1: Create the component**

Create `components/admin/AgendaMonthCalendar.tsx`:

```tsx
import Link from "next/link";

const WEEKDAY_LABELS = ["D", "S", "T", "Q", "Q", "S", "S"];
const MONTH_LABELS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

function toDateKey(year: number, monthIndex: number, day: number): string {
  const mm = String(monthIndex + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

function shiftMonth(month: string, offset: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const d = new Date(year, monthNumber - 1 + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function AgendaMonthCalendar({
  month,
  summary,
}: {
  month: string;
  summary: Record<string, number>;
}) {
  const [year, monthNumber] = month.split("-").map(Number);
  const monthIndex = monthNumber - 1;
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  const today = new Date();
  const todayKey = toDateKey(today.getFullYear(), today.getMonth(), today.getDate());

  const cells: Array<{ day: number; key: string } | null> = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ day, key: toDateKey(year, monthIndex, day) });
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <Link
          href={`/admin/agenda?month=${shiftMonth(month, -1)}`}
          aria-label="Mês anterior"
          className="rounded-sm p-1.5 text-paper-dim transition-colors hover:text-gold"
        >
          ‹
        </Link>
        <span className="text-sm text-paper">
          {MONTH_LABELS[monthIndex]} {year}
        </span>
        <Link
          href={`/admin/agenda?month=${shiftMonth(month, 1)}`}
          aria-label="Próximo mês"
          className="rounded-sm p-1.5 text-paper-dim transition-colors hover:text-gold"
        >
          ›
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-7 gap-y-1 text-center">
        {WEEKDAY_LABELS.map((label, i) => (
          <span key={i} className="pb-2 text-[11px] uppercase tracking-wide text-paper-dim">
            {label}
          </span>
        ))}

        {cells.map((cell, i) =>
          cell === null ? (
            <span key={`blank-${i}`} />
          ) : (
            <Link
              key={cell.key}
              href={`/admin/agenda/${cell.key}`}
              className={`mx-auto flex h-14 w-14 flex-col items-center justify-center gap-0.5 rounded-sm transition-colors hover:bg-ink-line ${
                cell.key === todayKey ? "border border-gold" : ""
              }`}
            >
              <span className="text-sm text-paper">{cell.day}</span>
              {(summary[cell.key] ?? 0) > 0 && (
                <span className="text-xs text-gold">{summary[cell.key]}</span>
              )}
            </Link>
          )
        )}
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
git add components/admin/AgendaMonthCalendar.tsx
git commit -m "feat: add AgendaMonthCalendar component"
```

---

### Task 3: Move the day board to `app/admin/agenda/[date]/`

**Files:**
- Create: `app/admin/agenda/[date]/DayNav.tsx` (moved and modified from `app/admin/agenda/DayNav.tsx`)
- Create: `app/admin/agenda/[date]/page.tsx` (moved and modified from `app/admin/agenda/page.tsx`)
- Delete: `app/admin/agenda/DayNav.tsx`
- Delete: `app/admin/agenda/page.tsx` (recreated as the calendar in Task 4 — deleting first keeps this task's diff a clean "move")

**Interfaces:**
- Produces: `/admin/agenda/[date]` route (default export); `export function DayNav({ date }: { date: string }): JSX.Element` (same signature as before, now also rendering a "← Calendário" link).
- Consumes: `getDayAgenda`, `getActiveServices`, `AgendaBoard` — unchanged from the current page.

- [ ] **Step 1: Create the moved `DayNav.tsx` with the calendar back-link and route-param links**

Create `app/admin/agenda/[date]/DayNav.tsx`:

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
  const month = date.slice(0, 7);

  return (
    <div className="space-y-2">
      <Link
        href={`/admin/agenda?month=${month}`}
        className="text-sm text-paper-dim transition-colors hover:text-paper"
      >
        ← Calendário
      </Link>
      <div className="flex items-center justify-between border-y border-ink-line py-3">
        <Link
          href={`/admin/agenda/${shiftDate(date, -1)}`}
          className="text-sm text-paper-dim transition-colors hover:text-paper"
        >
          ← Anterior
        </Link>
        <span className="font-display text-paper capitalize">{label}</span>
        <Link
          href={`/admin/agenda/${shiftDate(date, 1)}`}
          className="text-sm text-paper-dim transition-colors hover:text-paper"
        >
          Próximo →
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the moved `page.tsx` reading `date` from the route param**

Create `app/admin/agenda/[date]/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getDayAgenda } from "@/lib/admin-data";
import { getActiveServices } from "@/lib/site-data";
import { AgendaBoard } from "@/components/admin/AgendaBoard";
import { DayNav } from "./DayNav";

export default async function AgendaDayPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    redirect("/admin/agenda");
  }

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

- [ ] **Step 3: Delete the old files**

```bash
git rm app/admin/agenda/DayNav.tsx app/admin/agenda/page.tsx
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: FAIL — `app/admin/agenda` has no `page.tsx` for the `/admin/agenda` route itself anymore. This is expected; Task 4 adds it back as the calendar. If any error is about something other than the missing `/admin/agenda` page, stop and investigate before continuing.

- [ ] **Step 5: Commit**

```bash
git add app/admin/agenda/[date]/DayNav.tsx app/admin/agenda/[date]/page.tsx
git commit -m "refactor: move agenda day board to /admin/agenda/[date]"
```

---

### Task 4: New `/admin/agenda` calendar page

**Files:**
- Create: `app/admin/agenda/page.tsx`

**Interfaces:**
- Consumes: `getMonthAgendaSummary` (Task 1), `AgendaMonthCalendar` (Task 2).
- Produces: the `/admin/agenda` route (default export).

- [ ] **Step 1: Create the page**

Create `app/admin/agenda/page.tsx`:

```tsx
import { getMonthAgendaSummary } from "@/lib/admin-data";
import { AgendaMonthCalendar } from "@/components/admin/AgendaMonthCalendar";

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const params = await searchParams;
  const month =
    params.month && /^\d{4}-\d{2}$/.test(params.month) ? params.month : currentMonth();

  const summary = await getMonthAgendaSummary(month);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="font-display text-2xl text-paper">Agenda</h1>
        <p className="mt-1 text-sm text-paper-dim">Escolha um dia para ver os agendamentos.</p>
      </div>

      <AgendaMonthCalendar month={month} summary={summary} />
    </div>
  );
}
```

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS, no errors.

- [ ] **Step 3: Commit**

```bash
git add app/admin/agenda/page.tsx
git commit -m "feat: add /admin/agenda month calendar view"
```

---

### Task 5: Manual verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full automated suite one more time**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 2: Manually verify in the browser**

Run: `npm run dev`, log into `/admin-login`, then:

1. Click "Agenda" in the nav. Confirm you land on a month calendar (current month), today's cell has a visible border, and any day with existing appointments (e.g. the test data from the previous feature's verification) shows a count.
2. Click `‹` to go to the previous month. Confirm the URL becomes `/admin/agenda?month=...` with the prior month and the grid updates (even though it's in the past, it should still render and be navigable).
3. Click a day with a count. Confirm you land on `/admin/agenda/<that-date>` showing the same per-barber columns board as before, with the correct date in the header.
4. Click "← Anterior" / "Próximo →". Confirm they still move one day at a time and the URL changes to `/admin/agenda/<other-date>`.
5. Click "← Calendário". Confirm it returns to the month view, on the month containing the day you were just viewing.

- [ ] **Step 3: Report any discrepancy before moving on**

If any of the five checks in Step 2 fail, stop and fix the relevant task before considering this plan complete.
