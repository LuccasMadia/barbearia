# Site Público (Plano 2/6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder home page with the real public marketing site — hero, services, about, hours, contact, location, social links — reading everything from `site_config`/`services` (seeded in Plan 1), plus minimal placeholder pages for `/agendar` and `/cancelar` so the nav doesn't link to 404s before Plans 3–4 build those flows for real.

**Architecture:** Server Components only (no client JS needed for static marketing content). Each home section is its own component under `components/site/`, composed by `app/page.tsx`. Data access goes through a small `lib/site-data.ts` layer on top of the existing `lib/supabase/server.ts` client, relying on the anon-read RLS policies on `site_config`/`services`/`barbers` already in place from Plan 1 — no admin client, no auth needed for any of this.

**Tech Stack:** Next.js (App Router, Server Components), TypeScript, Tailwind CSS v4, Supabase (anon read via existing server client).

## Global Constraints

- Repo is config-driven and reused per client: no hardcoded barbershop name/branding in code — everything business-specific comes from the `site_config` row fetched at request time.
- Single-tenant per deployment. No tenant_id columns anywhere.
- `site_config` has exactly one row (seeded in Plan 1), but code must not crash if it's ever empty — fall back to sensible defaults rather than throwing.
- Public pages must not use the admin (service-role) client — only anon reads through `lib/supabase/server.ts`.

---

## File Structure

```
barbearia/
  app/
    page.tsx                      # rewritten: composes home sections with real data
    agendar/
      page.tsx                    # placeholder, real flow built in Plan 3
    cancelar/
      page.tsx                    # placeholder, real flow built in Plan 4
  components/
    site/
      Header.tsx
      Hero.tsx
      ServicesSection.tsx
      AboutSection.tsx
      ContactSection.tsx
      Footer.tsx
  lib/
    site-data.ts                  # getSiteConfig / getActiveServices
    format.ts                     # formatPriceBRL, formatDuration
```

---

### Task 1: Public data-access and formatting helpers

**Files:**
- Create: `lib/site-data.ts`
- Create: `lib/format.ts`

**Interfaces:**
- Consumes: `createClient()` from `lib/supabase/server.ts`; `Tables<'site_config'>`, `Tables<'services'>` from `lib/database.types.ts`.
- Produces:
  - `getSiteConfig(): Promise<Tables<'site_config'>>` — always returns an object (falls back to defaults if the table is empty), used by every section below.
  - `getActiveServices(): Promise<Tables<'services'>[]>` — services where `active = true`, ordered by `name`.
  - `formatPriceBRL(cents: number): string` — e.g. `4000` → `"R$ 40,00"`.
  - `formatDuration(minutes: number): string` — e.g. `30` → `"30 min"`, `90` → `"1h30"`.

- [ ] **Step 1: Write the formatting helpers**

Create `lib/format.ts`:

```ts
export function formatPriceBRL(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h${rest}`;
}
```

- [ ] **Step 2: Write the data-access helpers**

Create `lib/site-data.ts`:

```ts
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/database.types";

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
  created_at: new Date(0).toISOString(),
  updated_at: new Date(0).toISOString(),
};

export async function getSiteConfig(): Promise<Tables<"site_config">> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("site_config")
    .select("*")
    .limit(1)
    .maybeSingle();

  return data ?? DEFAULT_SITE_CONFIG;
}

export async function getActiveServices(): Promise<Tables<"services">[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("services")
    .select("*")
    .eq("active", true)
    .order("name");

  return data ?? [];
}
```

- [ ] **Step 3: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/site-data.ts lib/format.ts
git commit -m "feat: add public site data-access and formatting helpers"
```

---

### Task 2: Header and Footer components

**Files:**
- Create: `components/site/Header.tsx`
- Create: `components/site/Footer.tsx`

**Interfaces:**
- Consumes: `Tables<'site_config'>` (passed as a `siteConfig` prop — fetched once in `app/page.tsx` and threaded down, not re-fetched per component).
- Produces: `<Header siteConfig={...} />`, `<Footer siteConfig={...} />`.

- [ ] **Step 1: Write the header**

Create `components/site/Header.tsx`:

```tsx
import Link from "next/link";
import type { Tables } from "@/lib/database.types";

export function Header({ siteConfig }: { siteConfig: Tables<"site_config"> }) {
  return (
    <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-4">
      <span className="text-lg font-semibold">{siteConfig.name}</span>
      <nav className="flex gap-6 text-sm text-neutral-600">
        <Link href="/agendar" className="hover:text-neutral-900">
          Agendar
        </Link>
        <Link href="/cancelar" className="hover:text-neutral-900">
          Cancelar agendamento
        </Link>
      </nav>
    </header>
  );
}
```

- [ ] **Step 2: Write the footer**

Create `components/site/Footer.tsx`:

```tsx
import type { Tables } from "@/lib/database.types";

export function Footer({ siteConfig }: { siteConfig: Tables<"site_config"> }) {
  return (
    <footer className="border-t border-neutral-200 bg-neutral-50 px-6 py-8 text-sm text-neutral-500">
      <p>{siteConfig.name}</p>
      {siteConfig.address && <p>{siteConfig.address}</p>}
      {siteConfig.phone && <p>{siteConfig.phone}</p>}
    </footer>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add components/site/Header.tsx components/site/Footer.tsx
git commit -m "feat: add site header and footer components"
```

---

### Task 3: Hero section

**Files:**
- Create: `components/site/Hero.tsx`

**Interfaces:**
- Consumes: `Tables<'site_config'>` as a `siteConfig` prop.
- Produces: `<Hero siteConfig={...} />` — headline with the business name, CTA linking to `/agendar`.

- [ ] **Step 1: Write the hero section**

Create `components/site/Hero.tsx`:

```tsx
import Link from "next/link";
import type { Tables } from "@/lib/database.types";

export function Hero({ siteConfig }: { siteConfig: Tables<"site_config"> }) {
  return (
    <section
      className="flex flex-col items-center gap-6 px-6 py-24 text-center text-white"
      style={{ backgroundColor: siteConfig.primary_color }}
    >
      <h1 className="text-3xl font-bold sm:text-5xl">{siteConfig.name}</h1>
      {siteConfig.about && (
        <p className="max-w-xl text-white/80">{siteConfig.about}</p>
      )}
      <Link
        href="/agendar"
        className="rounded bg-white px-6 py-3 font-semibold text-neutral-900 hover:bg-white/90"
      >
        Agendar horário
      </Link>
    </section>
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
git add components/site/Hero.tsx
git commit -m "feat: add hero section"
```

---

### Task 4: Services section

**Files:**
- Create: `components/site/ServicesSection.tsx`

**Interfaces:**
- Consumes: `Tables<'services'>[]` as a `services` prop; `formatPriceBRL`, `formatDuration` from `lib/format.ts`.
- Produces: `<ServicesSection services={...} />` — list of active services with name, duration, and price. Renders nothing (returns `null`) when the list is empty, so an unconfigured instance doesn't show an awkward empty section.

- [ ] **Step 1: Write the services section**

Create `components/site/ServicesSection.tsx`:

```tsx
import type { Tables } from "@/lib/database.types";
import { formatPriceBRL, formatDuration } from "@/lib/format";

export function ServicesSection({
  services,
}: {
  services: Tables<"services">[];
}) {
  if (services.length === 0) return null;

  return (
    <section className="px-6 py-16">
      <h2 className="mb-8 text-center text-2xl font-semibold">Serviços</h2>
      <ul className="mx-auto grid max-w-2xl gap-4">
        {services.map((service) => (
          <li
            key={service.id}
            className="flex items-center justify-between rounded-lg border border-neutral-200 px-5 py-4"
          >
            <div>
              <p className="font-medium">{service.name}</p>
              <p className="text-sm text-neutral-500">
                {formatDuration(service.duration_minutes)}
              </p>
            </div>
            <p className="font-semibold">
              {formatPriceBRL(service.price_cents)}
            </p>
          </li>
        ))}
      </ul>
    </section>
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
git add components/site/ServicesSection.tsx
git commit -m "feat: add services section"
```

---

### Task 5: About, contact/location, and social sections

**Files:**
- Create: `components/site/AboutSection.tsx`
- Create: `components/site/ContactSection.tsx`

**Interfaces:**
- Consumes: `Tables<'site_config'>` as a `siteConfig` prop.
- Produces: `<AboutSection siteConfig={...} />` (about text + opening hours, renders `null` if both are empty), `<ContactSection siteConfig={...} />` (address with embedded Google Maps iframe, phone, whatsapp, instagram — each rendered only if present; renders `null` if all are empty).

- [ ] **Step 1: Write the about section**

Create `components/site/AboutSection.tsx`:

```tsx
import type { Tables } from "@/lib/database.types";

export function AboutSection({
  siteConfig,
}: {
  siteConfig: Tables<"site_config">;
}) {
  if (!siteConfig.about && !siteConfig.opening_hours) return null;

  return (
    <section className="mx-auto max-w-2xl px-6 py-16 text-center">
      {siteConfig.about && (
        <p className="text-neutral-700">{siteConfig.about}</p>
      )}
      {siteConfig.opening_hours && (
        <p className="mt-4 font-medium">{siteConfig.opening_hours}</p>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Write the contact/location section**

Create `components/site/ContactSection.tsx`:

```tsx
import type { Tables } from "@/lib/database.types";

export function ContactSection({
  siteConfig,
}: {
  siteConfig: Tables<"site_config">;
}) {
  const hasContact =
    siteConfig.address ||
    siteConfig.phone ||
    siteConfig.whatsapp ||
    siteConfig.instagram;

  if (!hasContact) return null;

  return (
    <section className="grid gap-8 bg-neutral-50 px-6 py-16 sm:grid-cols-2">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">Contato</h2>
        {siteConfig.address && <p>{siteConfig.address}</p>}
        {siteConfig.phone && <p>{siteConfig.phone}</p>}
        {siteConfig.whatsapp && <p>WhatsApp: {siteConfig.whatsapp}</p>}
        {siteConfig.instagram && <p>Instagram: {siteConfig.instagram}</p>}
      </div>
      {siteConfig.address && (
        <iframe
          title="Localização"
          className="h-64 w-full rounded-lg border-0"
          loading="lazy"
          src={`https://www.google.com/maps?q=${encodeURIComponent(
            siteConfig.address
          )}&output=embed`}
        />
      )}
    </section>
  );
}
```

- [ ] **Step 3: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/site/AboutSection.tsx components/site/ContactSection.tsx
git commit -m "feat: add about and contact/location sections"
```

---

### Task 6: Compose the home page

**Files:**
- Modify: `app/page.tsx` (replace the Plan 1 placeholder)

**Interfaces:**
- Consumes: `getSiteConfig`, `getActiveServices` from `lib/site-data.ts`; all components from Task 2–5.
- Produces: the real home page at `/`.

- [ ] **Step 1: Rewrite the home page**

Replace `app/page.tsx`:

```tsx
import { getSiteConfig, getActiveServices } from "@/lib/site-data";
import { Header } from "@/components/site/Header";
import { Hero } from "@/components/site/Hero";
import { ServicesSection } from "@/components/site/ServicesSection";
import { AboutSection } from "@/components/site/AboutSection";
import { ContactSection } from "@/components/site/ContactSection";
import { Footer } from "@/components/site/Footer";

export default async function Home() {
  const [siteConfig, services] = await Promise.all([
    getSiteConfig(),
    getActiveServices(),
  ]);

  return (
    <>
      <Header siteConfig={siteConfig} />
      <main>
        <Hero siteConfig={siteConfig} />
        <ServicesSection services={services} />
        <AboutSection siteConfig={siteConfig} />
        <ContactSection siteConfig={siteConfig} />
      </main>
      <Footer siteConfig={siteConfig} />
    </>
  );
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Verify the seeded data renders**

```bash
npm run dev -- --port 3000 &
sleep 3
curl -sf http://localhost:3000 | grep -o "Minha Barbearia"
curl -sf http://localhost:3000 | grep -o "Corte de Cabelo"
curl -sf http://localhost:3000 | grep -o "R\$&nbsp;40,00\|R\$ 40,00"
```

Expected: all three greps print a match (the seed data from Plan 1: business name, service name, formatted price). Stop the dev server afterward (`kill %1`).

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "feat: compose real home page from site_config and services"
```

---

### Task 7: Placeholder pages for `/agendar` and `/cancelar`

**Files:**
- Create: `app/agendar/page.tsx`
- Create: `app/cancelar/page.tsx`

**Interfaces:**
- Produces: two static placeholder pages so Header links resolve instead of 404ing. Both are replaced with real flows in Plans 3 and 4 respectively — this task does not implement any booking/cancellation logic.

- [ ] **Step 1: Write the `/agendar` placeholder**

Create `app/agendar/page.tsx`:

```tsx
export default function AgendarPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 px-6 text-center">
      <h1 className="text-xl font-semibold">Agendamento online</h1>
      <p className="text-neutral-500">
        Em breve você poderá agendar seu horário diretamente por aqui.
      </p>
    </main>
  );
}
```

- [ ] **Step 2: Write the `/cancelar` placeholder**

Create `app/cancelar/page.tsx`:

```tsx
export default function CancelarPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 px-6 text-center">
      <h1 className="text-xl font-semibold">Cancelamento de agendamento</h1>
      <p className="text-neutral-500">
        Em breve você poderá cancelar seu agendamento diretamente por aqui.
      </p>
    </main>
  );
}
```

- [ ] **Step 3: Verify it compiles and builds**

```bash
npx tsc --noEmit
npm run build
```

Expected: no errors; build output lists `/agendar` and `/cancelar` as static routes.

- [ ] **Step 4: Commit**

```bash
git add app/agendar app/cancelar
git commit -m "feat: add placeholder pages for agendar and cancelar routes"
```

---

## Self-Review Notes

- **Spec coverage for this plan's slice:** hero with CTA ✅, services with price ✅, about ✅, horário de funcionamento ✅, localização (map embed) ✅, redes sociais ✅, all config-driven from `site_config`/`services` ✅. Explicitly deferred: photo gallery (spec mentions it, but no schema/table for photos exists yet — it belongs to the Storage-backed "Configurações do site" work in the admin panel plan, not invented here), booking (Plan 3), cancellation (Plan 4).
- **Placeholder scan:** no TBD/TODO. `/agendar` and `/cancelar` pages are intentionally static "em breve" placeholders, explicitly scoped as such in Task 7's Interfaces — not vague stand-ins for unfinished work in *this* plan.
- **Type consistency:** `siteConfig` prop is the same `Tables<"site_config">` shape across `Header`, `Footer`, `Hero`, `AboutSection`, `ContactSection` — fetched once in `app/page.tsx` (Task 6) and passed down, never re-fetched per component.
