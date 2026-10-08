# Fila de Atendimento Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the walk-in queue module (`/fila`, `/fila/status`, `/fila/tv`, `/admin/fila`) alongside the existing agendamento module, sharing the same `appointments`/`clients` tables for billing, plus the phone-first/autofill tweak to the booking wizard.

**Architecture:** A new `queue_entries` table tracks the live queue (`aguardando` → `em_atendimento` → `concluido`/`cancelado`). All public reads/writes go through Server Actions using the service-role admin client — `queue_entries` gets no anon RLS policy, same pattern as `appointments`. A pure, dependency-free module (`lib/queue-wait.ts`) simulates multiple barbers freeing up over time to estimate wait minutes — the one piece of logic risky enough to deserve unit tests, same rationale as `lib/slots.ts`. `lib/queue-server.ts` is the data/business-logic layer (mirrors `lib/appointments-server.ts`), consumed by thin `"use server"` wrappers in `app/fila/actions.ts` (public) and `app/admin/fila/actions.ts` (owner-only). Finishing a queue service writes a normal `appointments` row (`origin: 'fila'`, `status: 'concluido'`) so the existing dashboard/revenue code needs zero changes to cover fila-origin business. Live-feeling updates come from a tiny shared `<AutoRefresh>` client component that calls `router.refresh()` on an interval — no WebSocket/Realtime — while the join form (`/fila`) is never affected by it, since it's a separate one-shot page.

**Tech Stack:** Next.js 16 App Router (Server Components + Server Actions), Supabase (service-role admin client for all queue reads/writes), TypeScript, Tailwind CSS v4, Vitest for the one new pure module.

## Global Constraints

- Fila and agendamento are mutually exclusive per barbershop client in practice — this plan never cross-checks queue availability against `barber_schedules`/`barber_time_off`/scheduled `appointments`.
- `queue_entries.barber_id` is reused across the entry's lifecycle: while `aguardando` it's the client's *preference* (`null` = qualquer); the moment a barber calls the entry, it's overwritten with that barber's id and becomes the definitive assignment.
- Queue revenue always flows through a normal `appointments` row (`origin: 'fila'`, `status: 'concluido'`) created when a service finishes — never compute fila revenue separately from the dashboard's existing `appointments`-based logic.
- `queue_entries` gets zero anon RLS policy, same as `appointments`/`clients` — every public read/write goes through the service-role admin client inside a Server Action, never the browser's anon session.
- The position shown to a waiting client is a simple arrival-order count, **not** filtered by barber preference. Only `estimatedWaitMinutes` does the barber-aware simulation. Don't conflate the two.
- `searchParams` in a `page.tsx` is a `Promise` in this Next.js version — always `await` it.
- No new npm dependency — polling via `setInterval` + `router.refresh()`, no Supabase Realtime, no charting/websocket library.
- Commit after every task, Conventional Commits style.

---

## File Structure

```
barbearia/
  supabase/
    migrations/
      0003_queue_entries.sql       # new table, site_config.queue_open, appointments.origin + 'fila'
  lib/
    supabase/
      admin.ts                     # modified: export AdminClient type (moved here from appointments-server.ts)
    appointments-server.ts         # modified: use upsertClientByPhone, drop inline client upsert
    clients-server.ts              # new: getClientByPhone, upsertClientByPhone (shared by booking + fila)
    site-data.ts                   # modified: DEFAULT_SITE_CONFIG gets queue_open: false
    queue-wait.ts                  # new: pure estimateWaitMinutes simulation
    queue-wait.test.ts
    queue-server.ts                # new: queue_entries data/business logic (public + admin operations)
  components/
    AutoRefresh.tsx                 # new: shared polling trigger (client component, no UI)
    booking/
      BookingWizard.tsx             # modified: phone-first contact step with name autofill
    queue/
      QueueJoinForm.tsx             # new: client wizard for /fila
    admin/
      QueueBoard.tsx                 # new: per-barber columns (Server Component)
      QueueWaitingList.tsx           # new: waiting list with remove action (Server Component)
  app/
    agendar/
      actions.ts                   # modified: add lookupClientByPhone
    fila/
      actions.ts                   # new: joinQueue, getQueueStatusByPhone, leaveQueue, lookupClientByPhone
      page.tsx                     # new: join page
      status/
        page.tsx                   # new: phone lookup + live status + leave
      tv/
        page.tsx                   # new: read-only big-screen display
    admin/
      layout.tsx                   # modified: add "Fila" nav link
      fila/
        actions.ts                 # new: callNextForBarber, finishService, removeFromQueue, toggleQueueOpen
        page.tsx                   # new: admin queue board page
```

---

### Task 1: Migration — `queue_entries`, `site_config.queue_open`, `appointments.origin` extension

**Files:**
- Create: `supabase/migrations/0003_queue_entries.sql`
- Modify: `lib/site-data.ts`

**Interfaces:**
- Produces: table `queue_entries` (`id`, `client_id`, `service_id`, `barber_id` nullable, `status` ∈ `aguardando|em_atendimento|concluido|cancelado`, `created_at`, `started_at`, `finished_at`); `site_config.queue_open boolean`; `appointments.origin` now also accepts `'fila'`. Regenerated `Database` type in `lib/database.types.ts` is consumed by every later task.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0003_queue_entries.sql`:

```sql
alter table site_config add column queue_open boolean not null default false;

alter table appointments drop constraint appointments_origin_check;
alter table appointments add constraint appointments_origin_check
  check (origin in ('online','avulso','fila'));

create table queue_entries (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id),
  service_id uuid not null references services(id),
  barber_id uuid references barbers(id),
  status text not null default 'aguardando'
    check (status in ('aguardando','em_atendimento','concluido','cancelado')),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

alter table queue_entries enable row level security;
create policy "owner all queue_entries" on queue_entries for all to authenticated using (true) with check (true);

-- No anon policy at all, same as appointments/clients: every public read/write
-- to queue_entries goes through the service-role admin client inside a
-- Server Action, never through anon RLS.
```

- [ ] **Step 2: Push the migration**

```bash
npx supabase db push
```

Expected: output lists `0003_queue_entries.sql` as applied with no errors. If `alter table appointments drop constraint appointments_origin_check` fails with "constraint does not exist", run `select conname from pg_constraint where conrelid = 'appointments'::regclass;` in the Supabase SQL editor to find the actual auto-generated name and substitute it.

- [ ] **Step 3: Regenerate TypeScript types**

```bash
npx supabase gen types typescript --project-id <PROJECT_REF> > lib/database.types.ts
```

Expected: `lib/database.types.ts` now includes a `queue_entries` table and `site_config.queue_open`.

- [ ] **Step 4: Update the site_config default fallback**

In `lib/site-data.ts`, add `queue_open: false` to `DEFAULT_SITE_CONFIG`:

```ts
const DEFAULT_SITE_CONFIG: Tables<"site_config"> = {
  id: "default",
  name: "Minha Barbearia",
  logo_url: null,
  primary_color: "#111111",
  address: null,
  phone: null,
  whatsapp: null,
  instagram: null,
  opening_hours: null,
  about: null,
  queue_open: false,
  created_at: new Date(0).toISOString(),
  updated_at: new Date(0).toISOString(),
};
```

- [ ] **Step 5: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0003_queue_entries.sql lib/database.types.ts lib/site-data.ts
git commit -m "feat: add queue_entries table, queue_open toggle, and fila origin"
```

---

### Task 2: Shared client-by-phone lookup

**Files:**
- Modify: `lib/supabase/admin.ts`
- Create: `lib/clients-server.ts`
- Modify: `lib/appointments-server.ts`

**Interfaces:**
- Produces:
  - `lib/supabase/admin.ts`: `export type AdminClient = ReturnType<typeof createAdminClient>;`
  - `lib/clients-server.ts`: `export async function getClientByPhone(admin: AdminClient, phone: string): Promise<{ name: string } | null>`, `export async function upsertClientByPhone(admin: AdminClient, input: { name: string; phone: string }): Promise<string>` (throws on failure to insert).
- Consumed by: `lib/appointments-server.ts` (this task), `lib/queue-server.ts` (Task 5), `app/agendar/actions.ts` (Task 3), `app/fila/actions.ts` (Task 5).

- [ ] **Step 1: Move `AdminClient` to `lib/supabase/admin.ts`**

In `lib/supabase/admin.ts`, add the type export after `createAdminClient`:

```ts
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "createAdminClient() requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  return createSupabaseClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export type AdminClient = ReturnType<typeof createAdminClient>;
```

- [ ] **Step 2: Write `lib/clients-server.ts`**

Create `lib/clients-server.ts`:

```ts
import type { AdminClient } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/phone";

export async function getClientByPhone(
  admin: AdminClient,
  phone: string
): Promise<{ name: string } | null> {
  const { data } = await admin
    .from("clients")
    .select("name")
    .eq("phone", normalizePhone(phone))
    .maybeSingle();

  return data ? { name: data.name } : null;
}

export async function upsertClientByPhone(
  admin: AdminClient,
  input: { name: string; phone: string }
): Promise<string> {
  const normalizedPhone = normalizePhone(input.phone);

  const { data: existingClient } = await admin
    .from("clients")
    .select("id, name")
    .eq("phone", normalizedPhone)
    .maybeSingle();

  if (existingClient) {
    if (existingClient.name !== input.name) {
      await admin.from("clients").update({ name: input.name }).eq("id", existingClient.id);
    }
    return existingClient.id;
  }

  const { data: newClient, error } = await admin
    .from("clients")
    .insert({ name: input.name, phone: normalizedPhone })
    .select("id")
    .single();

  if (error || !newClient) {
    throw new Error("Não foi possível salvar os dados do cliente.");
  }

  return newClient.id;
}
```

- [ ] **Step 3: Refactor `lib/appointments-server.ts` to reuse it**

In `lib/appointments-server.ts`:
1. Change the import line from `import { createAdminClient } from "@/lib/supabase/admin";` to `import { createAdminClient, type AdminClient } from "@/lib/supabase/admin";`.
2. Delete the local line `export type AdminClient = ReturnType<typeof createAdminClient>;`.
3. Add `import { upsertClientByPhone } from "@/lib/clients-server";`.
4. Remove the now-unused `import { normalizePhone } from "@/lib/phone";` line.
5. Replace this block inside `resolveAndCreateAppointment`:

```ts
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
```

with:

```ts
  let clientId: string;
  try {
    clientId = await upsertClientByPhone(admin, { name: input.name, phone: input.phone });
  } catch {
    return { success: false, error: "Não foi possível salvar seus dados. Tente novamente." };
  }
```

- [ ] **Step 4: Verify it compiles and the existing booking flow still builds**

```bash
npx tsc --noEmit
npm run build
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/supabase/admin.ts lib/clients-server.ts lib/appointments-server.ts
git commit -m "refactor: extract shared client-by-phone lookup and upsert"
```

---

### Task 3: Telefone primeiro + autofill de nome no agendamento

**Files:**
- Modify: `app/agendar/actions.ts`
- Modify: `components/booking/BookingWizard.tsx`

**Interfaces:**
- Produces: `app/agendar/actions.ts` exports `lookupClientByPhone(phone: string): Promise<{ name: string } | null>`.
- Consumes: `getClientByPhone` from `lib/clients-server.ts` (Task 2).

- [ ] **Step 1: Add the lookup action**

In `app/agendar/actions.ts`, add the import and export:

```ts
import { createAdminClient } from "@/lib/supabase/admin";
import { getClientByPhone } from "@/lib/clients-server";
```

(add to existing imports at the top), then append:

```ts
export async function lookupClientByPhone(phone: string): Promise<{ name: string } | null> {
  return getClientByPhone(createAdminClient(), phone);
}
```

- [ ] **Step 2: Reorder the contact fields and wire autofill in `BookingWizard.tsx`**

In `components/booking/BookingWizard.tsx`, add `lookupClientByPhone` to the import from `@/app/agendar/actions`:

```ts
import { getAvailableSlots, createAppointment, lookupClientByPhone } from "@/app/agendar/actions";
```

Add a handler near `handleSubmit`:

```ts
function handlePhoneBlur() {
  if (phone.replace(/\D/g, "").length < 8) return;
  startTransition(async () => {
    const found = await lookupClientByPhone(phone);
    if (found && !name) setName(found.name);
  });
}
```

Replace the contact `<form>` block (currently nome input first, then telefone) with telefone first:

```tsx
          <form onSubmit={handleSubmit} className="mt-8 space-y-3">
            <input
              type="tel"
              placeholder="Telefone"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onBlur={handlePhoneBlur}
              className="w-full rounded-sm border border-ink-line bg-transparent px-3 py-2.5 text-sm text-paper placeholder:text-paper-dim focus:border-gold"
            />
            <input
              type="text"
              placeholder="Nome"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-sm border border-ink-line bg-transparent px-3 py-2.5 text-sm text-paper placeholder:text-paper-dim focus:border-gold"
            />
            {error && <p className="text-sm text-danger">{error}</p>}
            <button
              type="submit"
              disabled={!selectedSlot || isPending}
              className="w-full rounded-sm bg-gold py-3 text-sm font-semibold text-gold-ink transition-colors hover:bg-gold-bright disabled:opacity-40"
            >
              {isPending ? "Confirmando..." : "Confirmar agendamento"}
            </button>
          </form>
```

- [ ] **Step 3: Verify it compiles and builds**

```bash
npx tsc --noEmit
npm run build
```

Expected: no errors.

- [ ] **Step 4: Manual verification in the browser**

```bash
npm run dev -- --port 3000 &
```

Open `http://localhost:3000/agendar`, pick a service/barber/slot, type a phone number that already has a `clients` row (from a previous booking or the seed data), and confirm the name field autofills on blur and stays editable. Try a phone with no existing record and confirm the name field stays empty for manual entry. Stop the dev server afterward (`kill %1`).

- [ ] **Step 5: Commit**

```bash
git add app/agendar/actions.ts components/booking/BookingWizard.tsx
git commit -m "feat: ask phone before name in booking, autofill name when found"
```

---

### Task 4: `lib/queue-wait.ts` — pure wait-time simulation

**Files:**
- Create: `lib/queue-wait.ts`
- Test: `lib/queue-wait.test.ts`

**Interfaces:**
- Produces:
  - `export type QueueBarberState = { barberId: string; freeAt: Date }`
  - `export type QueueWaitEntry = { entryId: string; barberId: string | null; durationMinutes: number }`
  - `export function estimateWaitMinutes(params: { now: Date; barbers: QueueBarberState[]; waitingAhead: QueueWaitEntry[]; target: QueueWaitEntry }): number | null`
- Consumed by: `lib/queue-server.ts` (Task 5).

- [ ] **Step 1: Write the failing tests**

Create `lib/queue-wait.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run lib/queue-wait.test.ts
```

Expected: FAIL with "Cannot find module './queue-wait'".

- [ ] **Step 3: Write the implementation**

Create `lib/queue-wait.ts`:

```ts
export type QueueBarberState = {
  barberId: string;
  freeAt: Date;
};

export type QueueWaitEntry = {
  entryId: string;
  barberId: string | null;
  durationMinutes: number;
};

export function estimateWaitMinutes(params: {
  now: Date;
  barbers: QueueBarberState[];
  waitingAhead: QueueWaitEntry[];
  target: QueueWaitEntry;
}): number | null {
  const { now, barbers, waitingAhead, target } = params;
  if (barbers.length === 0) return null;

  const freeAtByBarber = new Map(barbers.map((b) => [b.barberId, b.freeAt]));

  function earliestCompatible(preference: string | null): string | null {
    const candidateIds = preference ? [preference] : [...freeAtByBarber.keys()];
    const candidates = candidateIds.filter((id) => freeAtByBarber.has(id));
    if (candidates.length === 0) return null;

    return candidates.reduce((best, id) =>
      freeAtByBarber.get(id)!.getTime() < freeAtByBarber.get(best)!.getTime() ? id : best
    );
  }

  for (const entry of waitingAhead) {
    const barberId = earliestCompatible(entry.barberId);
    if (!barberId) continue;

    const startAt = freeAtByBarber.get(barberId)!;
    const endAt = new Date(
      Math.max(startAt.getTime(), now.getTime()) + entry.durationMinutes * 60_000
    );
    freeAtByBarber.set(barberId, endAt);
  }

  const targetBarberId = earliestCompatible(target.barberId);
  if (!targetBarberId) return null;

  const availableAt = freeAtByBarber.get(targetBarberId)!;
  const waitMs = Math.max(0, availableAt.getTime() - now.getTime());
  return Math.round(waitMs / 60_000);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run lib/queue-wait.test.ts
```

Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/queue-wait.ts lib/queue-wait.test.ts
git commit -m "feat: add queue wait-time simulation with unit tests"
```

---

### Task 5: `lib/queue-server.ts` core (board, status, join, leave) + public Server Actions

**Files:**
- Create: `lib/queue-server.ts`
- Create: `app/fila/actions.ts`

**Interfaces:**
- Produces:
  - `export type QueueBoardBarberColumn = { barberId: string; barberName: string; current: { entryId: string; clientName: string; serviceName: string; startedAt: Date } | null }`
  - `export type QueueBoardWaitingItem = { entryId: string; clientName: string; serviceName: string; preferredBarberName: string | null; estimatedWaitMinutes: number | null }`
  - `export type QueueBoard = { queueOpen: boolean; barbers: QueueBoardBarberColumn[]; waiting: QueueBoardWaitingItem[] }`
  - `export async function getQueueBoard(admin: AdminClient): Promise<QueueBoard>`
  - `export type QueueStatus = { state: "none" } | { state: "waiting"; entryId: string; serviceName: string; position: number; estimatedWaitMinutes: number | null } | { state: "in_service"; entryId: string; serviceName: string; barberName: string | null }`
  - `export async function getQueueStatusByPhone(admin: AdminClient, phone: string): Promise<QueueStatus>`
  - `export type JoinQueueResult = { success: true; entryId: string } | { success: false; error: string }`
  - `export async function joinQueue(admin: AdminClient, input: { serviceId: string; barberId: string; name: string; phone: string }): Promise<JoinQueueResult>`
  - `export async function leaveQueue(admin: AdminClient, entryId: string): Promise<void>`
  - `app/fila/actions.ts` exports: `lookupClientByPhone(phone: string)`, `joinQueue(input)`, `getQueueStatusByPhone(phone: string)`, `leaveQueue(entryId: string)`.
- Consumes: `AdminClient` from `lib/supabase/admin.ts`, `upsertClientByPhone`/`getClientByPhone` from `lib/clients-server.ts` (Task 2), `estimateWaitMinutes`/`QueueBarberState`/`QueueWaitEntry` from `lib/queue-wait.ts` (Task 4).
- Consumed by: `components/queue/QueueJoinForm.tsx` and `app/fila/page.tsx` (Task 7), `app/fila/status/page.tsx` (Task 8), `app/fila/tv/page.tsx` (Task 9), `lib/queue-server.ts`'s own admin extensions (Task 10).

- [ ] **Step 1: Write `lib/queue-server.ts`**

Create `lib/queue-server.ts`:

```ts
import type { AdminClient } from "@/lib/supabase/admin";
import { upsertClientByPhone } from "@/lib/clients-server";
import { normalizePhone } from "@/lib/phone";
import { estimateWaitMinutes, type QueueBarberState, type QueueWaitEntry } from "@/lib/queue-wait";

type WaitingRow = QueueWaitEntry & {
  createdAt: Date;
  clientId: string;
  serviceId: string;
};

export type QueueBoardBarberColumn = {
  barberId: string;
  barberName: string;
  current: {
    entryId: string;
    clientName: string;
    serviceName: string;
    startedAt: Date;
  } | null;
};

export type QueueBoardWaitingItem = {
  entryId: string;
  clientName: string;
  serviceName: string;
  preferredBarberName: string | null;
  estimatedWaitMinutes: number | null;
};

export type QueueBoard = {
  queueOpen: boolean;
  barbers: QueueBoardBarberColumn[];
  waiting: QueueBoardWaitingItem[];
};

export async function getQueueBoard(admin: AdminClient): Promise<QueueBoard> {
  const now = new Date();

  const [
    { data: siteConfig },
    { data: barbers },
    { data: inService },
    { data: waitingRows },
    { data: services },
    { data: clients },
  ] = await Promise.all([
    admin.from("site_config").select("queue_open").limit(1).maybeSingle(),
    admin.from("barbers").select("id, name").eq("active", true).order("name"),
    admin
      .from("queue_entries")
      .select("id, barber_id, client_id, service_id, started_at")
      .eq("status", "em_atendimento"),
    admin
      .from("queue_entries")
      .select("id, barber_id, client_id, service_id, created_at")
      .eq("status", "aguardando")
      .order("created_at", { ascending: true }),
    admin.from("services").select("id, name, duration_minutes"),
    admin.from("clients").select("id, name"),
  ]);

  const serviceById = new Map((services ?? []).map((s) => [s.id, s]));
  const clientNameById = new Map((clients ?? []).map((c) => [c.id, c.name]));
  const barberNameById = new Map((barbers ?? []).map((b) => [b.id, b.name]));
  const inServiceByBarber = new Map(
    (inService ?? []).map((row) => [row.barber_id as string, row])
  );

  const barberStates: QueueBarberState[] = (barbers ?? []).map((b) => {
    const current = inServiceByBarber.get(b.id);
    if (!current || !current.started_at) return { barberId: b.id, freeAt: now };

    const duration = serviceById.get(current.service_id)?.duration_minutes ?? 0;
    const freeAt = new Date(new Date(current.started_at).getTime() + duration * 60_000);
    return { barberId: b.id, freeAt: freeAt > now ? freeAt : now };
  });

  const waitingRowsMapped: WaitingRow[] = (waitingRows ?? []).map((row) => ({
    entryId: row.id,
    barberId: row.barber_id,
    durationMinutes: serviceById.get(row.service_id)?.duration_minutes ?? 0,
    createdAt: new Date(row.created_at),
    clientId: row.client_id,
    serviceId: row.service_id,
  }));

  const waiting: QueueBoardWaitingItem[] = waitingRowsMapped.map((entry, index) => ({
    entryId: entry.entryId,
    clientName: clientNameById.get(entry.clientId) ?? "—",
    serviceName: serviceById.get(entry.serviceId)?.name ?? "—",
    preferredBarberName: entry.barberId ? barberNameById.get(entry.barberId) ?? null : null,
    estimatedWaitMinutes: estimateWaitMinutes({
      now,
      barbers: barberStates,
      waitingAhead: waitingRowsMapped.slice(0, index),
      target: entry,
    }),
  }));

  return {
    queueOpen: siteConfig?.queue_open ?? false,
    barbers: (barbers ?? []).map((b) => {
      const current = inServiceByBarber.get(b.id);
      return {
        barberId: b.id,
        barberName: b.name,
        current:
          current && current.started_at
            ? {
                entryId: current.id,
                clientName: clientNameById.get(current.client_id) ?? "—",
                serviceName: serviceById.get(current.service_id)?.name ?? "—",
                startedAt: new Date(current.started_at),
              }
            : null,
      };
    }),
    waiting,
  };
}

export type QueueStatus =
  | { state: "none" }
  | {
      state: "waiting";
      entryId: string;
      serviceName: string;
      position: number;
      estimatedWaitMinutes: number | null;
    }
  | {
      state: "in_service";
      entryId: string;
      serviceName: string;
      barberName: string | null;
    };

export async function getQueueStatusByPhone(
  admin: AdminClient,
  phone: string
): Promise<QueueStatus> {
  const normalizedPhone = normalizePhone(phone);

  const { data: client } = await admin
    .from("clients")
    .select("id")
    .eq("phone", normalizedPhone)
    .maybeSingle();

  if (!client) return { state: "none" };

  const { data: entry } = await admin
    .from("queue_entries")
    .select("id, status, service_id, barber_id")
    .eq("client_id", client.id)
    .in("status", ["aguardando", "em_atendimento"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!entry) return { state: "none" };

  const { data: service } = await admin
    .from("services")
    .select("name")
    .eq("id", entry.service_id)
    .maybeSingle();

  if (entry.status === "em_atendimento") {
    const barberResult = entry.barber_id
      ? await admin.from("barbers").select("name").eq("id", entry.barber_id).maybeSingle()
      : { data: null };

    return {
      state: "in_service",
      entryId: entry.id,
      serviceName: service?.name ?? "—",
      barberName: barberResult.data?.name ?? null,
    };
  }

  const board = await getQueueBoard(admin);
  const index = board.waiting.findIndex((w) => w.entryId === entry.id);

  return {
    state: "waiting",
    entryId: entry.id,
    serviceName: service?.name ?? "—",
    position: index === -1 ? 0 : index,
    estimatedWaitMinutes: index === -1 ? null : board.waiting[index].estimatedWaitMinutes,
  };
}

export type JoinQueueResult =
  | { success: true; entryId: string }
  | { success: false; error: string };

export async function joinQueue(
  admin: AdminClient,
  input: { serviceId: string; barberId: string; name: string; phone: string }
): Promise<JoinQueueResult> {
  const { data: siteConfig } = await admin
    .from("site_config")
    .select("queue_open")
    .limit(1)
    .maybeSingle();

  if (!siteConfig?.queue_open) {
    return { success: false, error: "A fila está fechada no momento." };
  }

  const { data: service } = await admin
    .from("services")
    .select("id")
    .eq("id", input.serviceId)
    .eq("active", true)
    .maybeSingle();

  if (!service) {
    return { success: false, error: "Serviço inválido." };
  }

  let clientId: string;
  try {
    clientId = await upsertClientByPhone(admin, { name: input.name, phone: input.phone });
  } catch {
    return { success: false, error: "Não foi possível salvar seus dados. Tente novamente." };
  }

  const { data: entry, error } = await admin
    .from("queue_entries")
    .insert({
      client_id: clientId,
      service_id: input.serviceId,
      barber_id: input.barberId === "any" ? null : input.barberId,
      status: "aguardando",
    })
    .select("id")
    .single();

  if (error || !entry) {
    return { success: false, error: "Não foi possível entrar na fila. Tente novamente." };
  }

  return { success: true, entryId: entry.id };
}

export async function leaveQueue(admin: AdminClient, entryId: string): Promise<void> {
  await admin
    .from("queue_entries")
    .update({ status: "cancelado" })
    .eq("id", entryId)
    .eq("status", "aguardando");
}
```

- [ ] **Step 2: Write `app/fila/actions.ts`**

Create `app/fila/actions.ts`:

```ts
"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getClientByPhone } from "@/lib/clients-server";
import {
  joinQueue as joinQueueServer,
  getQueueStatusByPhone as getQueueStatusByPhoneServer,
  leaveQueue as leaveQueueServer,
  type JoinQueueResult,
  type QueueStatus,
} from "@/lib/queue-server";

export async function lookupClientByPhone(phone: string): Promise<{ name: string } | null> {
  return getClientByPhone(createAdminClient(), phone);
}

export type { JoinQueueResult, QueueStatus };

export async function joinQueue(input: {
  serviceId: string;
  barberId: string;
  name: string;
  phone: string;
}): Promise<JoinQueueResult> {
  return joinQueueServer(createAdminClient(), input);
}

export async function getQueueStatusByPhone(phone: string): Promise<QueueStatus> {
  return getQueueStatusByPhoneServer(createAdminClient(), phone);
}

export async function leaveQueue(entryId: string): Promise<void> {
  await leaveQueueServer(createAdminClient(), entryId);
}
```

- [ ] **Step 3: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/queue-server.ts app/fila/actions.ts
git commit -m "feat: add queue board, status, join and leave data layer"
```

---

### Task 6: `AutoRefresh` shared polling component

**Files:**
- Create: `components/AutoRefresh.tsx`

**Interfaces:**
- Produces: `<AutoRefresh intervalMs={4000} />` — client component, renders nothing, calls `router.refresh()` on an interval.
- Consumed by: `app/fila/status/page.tsx` (Task 8), `app/fila/tv/page.tsx` (Task 9), `app/admin/fila/page.tsx` (Task 11).

- [ ] **Step 1: Write the component**

Create `components/AutoRefresh.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function AutoRefresh({ intervalMs = 4000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);

  return null;
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/AutoRefresh.tsx
git commit -m "feat: add AutoRefresh polling component"
```

---

### Task 7: `/fila` — join page

**Files:**
- Create: `components/queue/QueueJoinForm.tsx`
- Create: `app/fila/page.tsx`

**Interfaces:**
- Consumes: `joinQueue`, `lookupClientByPhone` from `app/fila/actions.ts` (Task 5); `getActiveServices`, `getActiveBarbers`, `getSiteConfig` from `lib/site-data.ts`.
- Produces: `<QueueJoinForm services={...} barbers={...} />`; the `/fila` route.

- [ ] **Step 1: Write `QueueJoinForm.tsx`**

Create `components/queue/QueueJoinForm.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Tables } from "@/lib/database.types";
import { joinQueue, lookupClientByPhone } from "@/app/fila/actions";
import { formatDuration, formatPriceBRL } from "@/lib/format";

export function QueueJoinForm({
  services,
  barbers,
}: {
  services: Tables<"services">[];
  barbers: Tables<"barbers">[];
}) {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [barberId, setBarberId] = useState("any");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handlePhoneBlur() {
    if (phone.replace(/\D/g, "").length < 8) return;
    startTransition(async () => {
      const found = await lookupClientByPhone(phone);
      if (found && !name) setName(found.name);
    });
  }

  function handleSubmit(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    if (!serviceId) return;

    setError(null);
    startTransition(async () => {
      const result = await joinQueue({ serviceId, barberId, name, phone });
      if (result.success) {
        router.push(`/fila/status?phone=${encodeURIComponent(phone)}`);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <h1 className="font-display text-3xl text-paper">Entrar na fila</h1>
      <form onSubmit={handleSubmit} className="mt-8 space-y-3">
        <input
          type="tel"
          placeholder="Telefone"
          required
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          onBlur={handlePhoneBlur}
          className="w-full rounded-sm border border-ink-line bg-transparent px-3 py-2.5 text-sm text-paper placeholder:text-paper-dim focus:border-gold"
        />
        <input
          type="text"
          placeholder="Nome"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-sm border border-ink-line bg-transparent px-3 py-2.5 text-sm text-paper placeholder:text-paper-dim focus:border-gold"
        />
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
        <select
          value={barberId}
          onChange={(e) => setBarberId(e.target.value)}
          className="w-full rounded-sm border border-ink-line bg-transparent px-3 py-2.5 text-sm text-paper focus:border-gold"
        >
          <option value="any" className="bg-ink">
            Qualquer disponível
          </option>
          {barbers.map((barber) => (
            <option key={barber.id} value={barber.id} className="bg-ink">
              {barber.name}
            </option>
          ))}
        </select>
        {error && <p className="text-sm text-danger">{error}</p>}
        <button
          type="submit"
          disabled={isPending || !serviceId}
          className="w-full rounded-sm bg-gold py-3 text-sm font-semibold text-gold-ink transition-colors hover:bg-gold-bright disabled:opacity-40"
        >
          {isPending ? "Entrando..." : "Entrar na fila"}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Write `app/fila/page.tsx`**

Create `app/fila/page.tsx`:

```tsx
import { getActiveServices, getActiveBarbers, getSiteConfig } from "@/lib/site-data";
import { QueueJoinForm } from "@/components/queue/QueueJoinForm";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";

export default async function FilaPage() {
  const [siteConfig, services, barbers] = await Promise.all([
    getSiteConfig(),
    getActiveServices(),
    getActiveBarbers(),
  ]);

  return (
    <>
      <Header siteConfig={siteConfig} />
      <main className="flex-1">
        {siteConfig.queue_open ? (
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
      <Footer siteConfig={siteConfig} />
    </>
  );
}
```

- [ ] **Step 3: Verify it compiles and builds**

```bash
npx tsc --noEmit
npm run build
```

Expected: no errors; build output lists `/fila` as a route.

- [ ] **Step 4: Commit**

```bash
git add components/queue/QueueJoinForm.tsx app/fila/page.tsx
git commit -m "feat: add public fila join page"
```

---

### Task 8: `/fila/status` — phone lookup, live status, leave

**Files:**
- Create: `app/fila/status/page.tsx`

**Interfaces:**
- Consumes: `getQueueStatusByPhone`, `leaveQueue` from `app/fila/actions.ts` (Task 5); `AutoRefresh` from `components/AutoRefresh.tsx` (Task 6).

- [ ] **Step 1: Write the page**

Create `app/fila/status/page.tsx`:

```tsx
import { getQueueStatusByPhone, leaveQueue } from "@/app/fila/actions";
import { AutoRefresh } from "@/components/AutoRefresh";

export default async function FilaStatusPage({
  searchParams,
}: {
  searchParams: Promise<{ phone?: string }>;
}) {
  const { phone } = await searchParams;

  if (!phone) {
    return (
      <div className="mx-auto max-w-sm px-6 py-24 text-center">
        <h1 className="font-display text-2xl text-paper">Acompanhar fila</h1>
        <form method="get" className="mt-8 space-y-3">
          <input
            type="tel"
            name="phone"
            placeholder="Telefone"
            required
            className="w-full rounded-sm border border-ink-line bg-transparent px-3 py-2.5 text-sm text-paper placeholder:text-paper-dim focus:border-gold"
          />
          <button
            type="submit"
            className="w-full rounded-sm bg-gold py-3 text-sm font-semibold text-gold-ink transition-colors hover:bg-gold-bright"
          >
            Consultar
          </button>
        </form>
      </div>
    );
  }

  const status = await getQueueStatusByPhone(phone);

  return (
    <div className="mx-auto max-w-sm px-6 py-24 text-center">
      <AutoRefresh intervalMs={4000} />
      <h1 className="font-display text-2xl text-paper">Acompanhar fila</h1>

      {status.state === "none" && (
        <p className="mt-6 text-paper-dim">
          Nenhuma entrada ativa na fila para esse telefone.
        </p>
      )}

      {status.state === "waiting" && (
        <div className="mt-6 space-y-2">
          <p className="text-paper">{status.serviceName}</p>
          <p className="text-paper-dim">{status.position} pessoa(s) na frente</p>
          {status.estimatedWaitMinutes !== null && (
            <p className="font-display text-3xl text-gold">
              ~{status.estimatedWaitMinutes} min
            </p>
          )}
          <form action={leaveQueue.bind(null, status.entryId)} className="pt-4">
            <button
              type="submit"
              className="text-sm text-danger transition-colors hover:text-danger"
            >
              Saí da fila
            </button>
          </form>
        </div>
      )}

      {status.state === "in_service" && (
        <div className="mt-6 space-y-2">
          <p className="text-paper">{status.serviceName}</p>
          <p className="text-gold">
            Você está sendo atendido{status.barberName ? ` por ${status.barberName}` : ""}.
          </p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles and builds**

```bash
npx tsc --noEmit
npm run build
```

Expected: no errors; build output lists `/fila/status` as a route.

- [ ] **Step 3: Commit**

```bash
git add app/fila/status/page.tsx
git commit -m "feat: add fila status page with leave action"
```

---

### Task 9: `/fila/tv` — read-only big-screen display

**Files:**
- Create: `app/fila/tv/page.tsx`

**Interfaces:**
- Consumes: `getQueueBoard` from `lib/queue-server.ts` (Task 5); `AutoRefresh` from `components/AutoRefresh.tsx` (Task 6).

- [ ] **Step 1: Write the page**

Create `app/fila/tv/page.tsx`:

```tsx
import { createAdminClient } from "@/lib/supabase/admin";
import { getQueueBoard } from "@/lib/queue-server";
import { AutoRefresh } from "@/components/AutoRefresh";

export default async function FilaTvPage() {
  const board = await getQueueBoard(createAdminClient());

  return (
    <div className="min-h-screen bg-ink p-12 text-paper">
      <AutoRefresh intervalMs={4000} />
      <h1 className="font-display text-4xl text-gold">Fila de atendimento</h1>

      <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {board.barbers.map((barber) => (
          <section key={barber.barberId} className="rounded-sm border border-ink-line p-6">
            <h2 className="text-sm uppercase tracking-[0.2em] text-paper-dim">
              {barber.barberName}
            </h2>
            {barber.current ? (
              <div className="mt-4">
                <p className="font-display text-2xl text-paper">
                  {barber.current.clientName}
                </p>
                <p className="text-paper-dim">{barber.current.serviceName}</p>
              </div>
            ) : (
              <p className="mt-4 text-paper-dim">Disponível</p>
            )}
          </section>
        ))}
      </div>

      <div className="mt-12">
        <h2 className="text-sm uppercase tracking-[0.2em] text-paper-dim">Próximos na fila</h2>
        {board.waiting.length === 0 ? (
          <p className="mt-4 text-paper-dim">Nenhum cliente esperando.</p>
        ) : (
          <ul className="mt-4 divide-y divide-ink-line border-t border-ink-line">
            {board.waiting.map((item, index) => (
              <li
                key={item.entryId}
                className="flex items-center gap-x-6 gap-y-1 py-4 text-lg"
              >
                <span className="w-10 shrink-0 text-paper-dim">{index + 1}º</span>
                <span className="flex-1 text-paper">{item.clientName}</span>
                <span className="text-paper-dim">{item.serviceName}</span>
                <span className="w-24 shrink-0 text-right text-gold">
                  {item.estimatedWaitMinutes !== null
                    ? `~${item.estimatedWaitMinutes} min`
                    : "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles and builds**

```bash
npx tsc --noEmit
npm run build
```

Expected: no errors; build output lists `/fila/tv` as a route.

- [ ] **Step 3: Commit**

```bash
git add app/fila/tv/page.tsx
git commit -m "feat: add read-only fila TV display"
```

---

### Task 10: Admin queue operations — call next, finish, remove, toggle

**Files:**
- Modify: `lib/queue-server.ts`
- Create: `app/admin/fila/actions.ts`

**Interfaces:**
- Produces (appended to `lib/queue-server.ts`):
  - `export async function callNextForBarber(admin: AdminClient, barberId: string): Promise<{ success: true } | { success: false; error: string }>`
  - `export async function finishService(admin: AdminClient, entryId: string): Promise<void>` (also inserts the `appointments` row for billing)
  - `export async function removeFromQueue(admin: AdminClient, entryId: string): Promise<void>`
  - `export async function setQueueOpen(admin: AdminClient, open: boolean): Promise<void>`
  - `app/admin/fila/actions.ts` exports owner-only wrappers of all four, named identically.
- Consumed by: `components/admin/QueueBoard.tsx` and `components/admin/QueueWaitingList.tsx`, `app/admin/fila/page.tsx` (Task 11).

- [ ] **Step 1: Append the admin operations to `lib/queue-server.ts`**

Add to the end of `lib/queue-server.ts`:

```ts
export async function callNextForBarber(
  admin: AdminClient,
  barberId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const { data: candidates } = await admin
    .from("queue_entries")
    .select("id")
    .eq("status", "aguardando")
    .or(`barber_id.is.null,barber_id.eq.${barberId}`)
    .order("created_at", { ascending: true })
    .limit(1);

  const next = candidates?.[0];
  if (!next) {
    return { success: false, error: "Nenhum cliente aguardando para este barbeiro." };
  }

  await admin
    .from("queue_entries")
    .update({
      status: "em_atendimento",
      started_at: new Date().toISOString(),
      barber_id: barberId,
    })
    .eq("id", next.id)
    .eq("status", "aguardando");

  return { success: true };
}

export async function finishService(admin: AdminClient, entryId: string): Promise<void> {
  const { data: entry } = await admin
    .from("queue_entries")
    .select("client_id, barber_id, service_id, started_at")
    .eq("id", entryId)
    .eq("status", "em_atendimento")
    .maybeSingle();

  if (!entry || !entry.barber_id || !entry.started_at) return;

  const startedAt = new Date(entry.started_at);
  const now = new Date();
  const finishedAt = now > startedAt ? now : new Date(startedAt.getTime() + 1000);

  await admin
    .from("queue_entries")
    .update({ status: "concluido", finished_at: finishedAt.toISOString() })
    .eq("id", entryId);

  await admin.from("appointments").insert({
    client_id: entry.client_id,
    barber_id: entry.barber_id,
    service_id: entry.service_id,
    starts_at: startedAt.toISOString(),
    ends_at: finishedAt.toISOString(),
    status: "concluido",
    origin: "fila",
  });
}

export async function removeFromQueue(admin: AdminClient, entryId: string): Promise<void> {
  await admin
    .from("queue_entries")
    .update({ status: "cancelado" })
    .eq("id", entryId)
    .eq("status", "aguardando");
}

export async function setQueueOpen(admin: AdminClient, open: boolean): Promise<void> {
  const { data: siteConfig } = await admin
    .from("site_config")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (!siteConfig) return;

  await admin.from("site_config").update({ queue_open: open }).eq("id", siteConfig.id);
}
```

- [ ] **Step 2: Write `app/admin/fila/actions.ts`**

Create `app/admin/fila/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  callNextForBarber as callNextForBarberServer,
  finishService as finishServiceServer,
  removeFromQueue as removeFromQueueServer,
  setQueueOpen as setQueueOpenServer,
} from "@/lib/queue-server";

async function requireAdmin(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
}

export async function callNextForBarber(barberId: string): Promise<void> {
  await requireAdmin();
  await callNextForBarberServer(createAdminClient(), barberId);
  revalidatePath("/admin/fila");
}

export async function finishService(entryId: string): Promise<void> {
  await requireAdmin();
  await finishServiceServer(createAdminClient(), entryId);
  revalidatePath("/admin/fila");
  revalidatePath("/admin");
}

export async function removeFromQueue(entryId: string): Promise<void> {
  await requireAdmin();
  await removeFromQueueServer(createAdminClient(), entryId);
  revalidatePath("/admin/fila");
}

export async function toggleQueueOpen(open: boolean): Promise<void> {
  await requireAdmin();
  await setQueueOpenServer(createAdminClient(), open);
  revalidatePath("/admin/fila");
  revalidatePath("/fila");
}
```

- [ ] **Step 3: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/queue-server.ts app/admin/fila/actions.ts
git commit -m "feat: add admin queue operations (call next, finish, remove, toggle)"
```

---

### Task 11: `/admin/fila` — admin board page

**Files:**
- Create: `components/admin/QueueBoard.tsx`
- Create: `components/admin/QueueWaitingList.tsx`
- Create: `app/admin/fila/page.tsx`
- Modify: `app/admin/layout.tsx`

**Interfaces:**
- Consumes: `QueueBoard` type and `getQueueBoard` from `lib/queue-server.ts` (Tasks 5/10); `callNextForBarber`, `finishService`, `removeFromQueue`, `toggleQueueOpen` from `app/admin/fila/actions.ts` (Task 10); `AutoRefresh` from `components/AutoRefresh.tsx` (Task 6).

- [ ] **Step 1: Write `QueueBoard.tsx`**

Create `components/admin/QueueBoard.tsx`:

```tsx
import { callNextForBarber, finishService } from "@/app/admin/fila/actions";
import type { QueueBoard as QueueBoardData } from "@/lib/queue-server";

function formatTime(date: Date) {
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function QueueBoard({ board }: { board: QueueBoardData }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {board.barbers.map((barber) => (
        <section key={barber.barberId} className="rounded-sm border border-ink-line p-4">
          <h2 className="text-xs uppercase tracking-[0.2em] text-paper-dim">
            {barber.barberName}
          </h2>

          {barber.current ? (
            <div className="mt-4">
              <p className="text-paper">{barber.current.clientName}</p>
              <p className="text-xs text-paper-dim">
                {barber.current.serviceName} · desde {formatTime(barber.current.startedAt)}
              </p>
              <form action={finishService.bind(null, barber.current.entryId)} className="mt-3">
                <button
                  type="submit"
                  className="rounded-sm border border-ink-line px-2 py-1 text-xs text-paper transition-colors hover:border-gold hover:text-gold"
                >
                  Finalizar atendimento
                </button>
              </form>
            </div>
          ) : (
            <form action={callNextForBarber.bind(null, barber.barberId)} className="mt-4">
              <button
                type="submit"
                className="block w-full rounded-sm border border-dashed border-ink-line px-3 py-2 text-left text-sm text-paper-dim transition-colors hover:border-gold hover:text-gold"
              >
                Chamar próximo
              </button>
            </form>
          )}
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Write `QueueWaitingList.tsx`**

Create `components/admin/QueueWaitingList.tsx`:

```tsx
import { removeFromQueue } from "@/app/admin/fila/actions";
import type { QueueBoard as QueueBoardData } from "@/lib/queue-server";

export function QueueWaitingList({ waiting }: { waiting: QueueBoardData["waiting"] }) {
  if (waiting.length === 0) {
    return <p className="mt-4 text-sm text-paper-dim">Nenhum cliente esperando.</p>;
  }

  return (
    <ul className="mt-4 divide-y divide-ink-line border-t border-ink-line">
      {waiting.map((item, index) => (
        <li key={item.entryId} className="flex items-center gap-x-4 gap-y-1 py-3 text-sm">
          <span className="w-8 shrink-0 text-paper-dim">{index + 1}º</span>
          <span className="flex-1 text-paper">{item.clientName}</span>
          <span className="w-32 shrink-0 text-paper-dim">{item.serviceName}</span>
          <span className="w-28 shrink-0 text-paper-dim">
            {item.preferredBarberName ?? "Qualquer"}
          </span>
          <span className="w-20 shrink-0 text-gold">
            {item.estimatedWaitMinutes !== null ? `~${item.estimatedWaitMinutes} min` : "—"}
          </span>
          <form action={removeFromQueue.bind(null, item.entryId)}>
            <button
              type="submit"
              className="text-xs text-danger transition-colors hover:text-danger"
            >
              Remover
            </button>
          </form>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 3: Write `app/admin/fila/page.tsx`**

Create `app/admin/fila/page.tsx`:

```tsx
import { createAdminClient } from "@/lib/supabase/admin";
import { getQueueBoard } from "@/lib/queue-server";
import { toggleQueueOpen } from "@/app/admin/fila/actions";
import { QueueBoard } from "@/components/admin/QueueBoard";
import { QueueWaitingList } from "@/components/admin/QueueWaitingList";
import { AutoRefresh } from "@/components/AutoRefresh";

export default async function AdminFilaPage() {
  const board = await getQueueBoard(createAdminClient());

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <AutoRefresh intervalMs={4000} />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-paper">Fila</h1>
          <p className="mt-1 text-sm text-paper-dim">Atendimento por ordem de chegada.</p>
        </div>
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

      <QueueBoard board={board} />

      <section>
        <h2 className="text-xs uppercase tracking-[0.2em] text-paper-dim">Aguardando</h2>
        <QueueWaitingList waiting={board.waiting} />
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Add the nav link**

In `app/admin/layout.tsx`, add a link between "Agenda" and "Sair":

```tsx
          <Link
            href="/admin/agenda"
            className="text-sm text-paper-dim transition-colors hover:text-paper"
          >
            Agenda
          </Link>
          <Link
            href="/admin/fila"
            className="text-sm text-paper-dim transition-colors hover:text-paper"
          >
            Fila
          </Link>
```

- [ ] **Step 5: Verify it compiles and builds**

```bash
npx tsc --noEmit
npm run build
```

Expected: no errors; build output lists `/admin/fila` as a route.

- [ ] **Step 6: Commit**

```bash
git add components/admin/QueueBoard.tsx components/admin/QueueWaitingList.tsx app/admin/fila/page.tsx app/admin/layout.tsx
git commit -m "feat: add admin queue board page"
```

---

### Task 12: Full test, build, and manual verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full unit test suite**

```bash
npx vitest run
```

Expected: all tests pass, including `lib/queue-wait.test.ts` (7 tests) alongside the existing suites.

- [ ] **Step 2: Run lint, typecheck, and build**

```bash
npm run lint
npx tsc --noEmit
npm run build
```

Expected: all three clean.

- [ ] **Step 3: Manual verification in the browser**

```bash
npm run dev -- --port 3000 &
```

Using the admin account and the seed data (at least one active barber and service):
1. In `/admin/fila`, click "Fila aberta · clique para abrir" to open the queue.
2. In a second tab, open `/fila`, join with a test phone/name, pick a service and "Qualquer disponível". Confirm it redirects to `/fila/status?phone=...` showing a position and an estimated wait.
3. Back in `/admin/fila` (wait up to ~4s or reload), confirm the new entry appears in "Aguardando" with an estimated wait, then click "Chamar próximo" on a barber's column — confirm it moves to that barber's "atendendo agora" slot.
4. In the `/fila/status` tab, confirm it now shows "Você está sendo atendido" within ~4s without a manual reload.
5. Open `/fila/tv` in a third tab and confirm it shows the same in-service client.
6. Back in `/admin/fila`, click "Finalizar atendimento" — confirm the column frees up, and check the Supabase Table Editor for a new `appointments` row with `origin = 'fila'` and `status = 'concluido'`.
7. Open `/admin` (dashboard) and confirm the new fila-origin appointment is reflected in the period's faturamento/counts.
8. Join the queue again with a second test phone, then use `/fila/status`'s "Saí da fila" button — confirm the entry disappears from `/admin/fila`'s waiting list.

Stop the dev server afterward (`kill %1`).

- [ ] **Step 4: Commit (only if fixes were needed)**

```bash
git add -A
git commit -m "fix: address issues found in full verification pass"
```

If nothing needed fixing, skip this step.

---

## Self-Review Notes

- **Spec coverage:** entrada pública por link com telefone-primeiro-e-autofill ✅ (Task 7, reusing Task 2/3's lookup); serviço e barbeiro (ou "qualquer") escolhidos ao entrar ✅ (Task 7); fila aberta/fechada via toggle manual ✅ (Tasks 10/11); status por telefone com posição + tempo estimado + saída própria ✅ (Task 8); tempo estimado por simulação multi-barbeiro ✅ (Task 4, consumed by Tasks 5/10); painel admin por colunas de barbeiro com chamar/finalizar automático (sem toggle de status manual) ✅ (Tasks 10/11); fila finalizada gera `appointments` origin `'fila'` para reaproveitar faturamento/dashboard existente sem lógica nova ✅ (Task 10); modo TV público somente leitura ✅ (Task 9); atualização entre dispositivos via polling leve + revalidation, sem afetar a página de cadastro ✅ (Task 6 used only by read-only pages, never by `/fila`'s join form); fila e agendamento mutuamente exclusivos — nenhuma lógica de cruzamento de disponibilidade foi adicionada ✅.
- **Placeholder scan:** no TBD/TODO. The only angle-bracket placeholder (`<PROJECT_REF>` in Task 1) matches this repo's own established convention from `docs/superpowers/plans/2026-10-05-01-fundacao.md` for a value the engineer fills in from their own Supabase project, not an unresolved design decision.
- **Type consistency:** `QueueBoard`/`QueueBoardBarberColumn`/`QueueBoardWaitingItem` (Task 5) are the exact types extended in Task 10 and consumed verbatim in Task 11's `QueueBoard.tsx`/`QueueWaitingList.tsx` (`QueueBoardData["waiting"]`). `QueueStatus`'s three states (`none`/`waiting`/`in_service`) match exactly what Task 8's page destructures. `QueueBarberState`/`QueueWaitEntry` from Task 4 are the same shapes `WaitingRow` (Task 5) extends via intersection, so `estimateWaitMinutes` accepts `waitingRowsMapped` entries directly without remapping. `barberId: string` with `"any"` as a sentinel (not a real UUID) is used identically in `QueueJoinForm`, `joinQueue`, and `callNextForBarber`'s caller (`.bind(null, barber.barberId)` always passes a real id, never `"any"`, since it's bound per real barber column).
