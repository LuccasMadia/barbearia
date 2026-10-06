# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two audiences, config-driven per deployment:
- **Shop owner (admin)** — the barbershop's owner/manager, logs into `/admin` to manage services, barbers, schedules, appointments, clients, plans, and site branding. Not technical; expects a simple back-office, not a SaaS dashboard.
- **End customer (public visitor)** — a walk-in-equivalent booking online, no account, no password. Identified only by phone number. Books or cancels an appointment in a few taps, usually on mobile, often while deciding in the moment ("can I get a haircut today?").

## Product Purpose

A self-serve booking and light business-management system for small independent barbershops: lets customers book/cancel appointments online without an account, and lets the owner run day-to-day operations (agenda, billing from completed appointments, manual subscription-plan tracking) from one admin panel. Replaces a barbershop's reliance on phone calls/WhatsApp-only booking and spreadsheets.

## Positioning

Not a multi-tenant SaaS — it's a **reusable template product** Lucca (the developer) clones per barbershop client: each shop gets its own Supabase project and Vercel deploy, with all branding and business data (name, logo, colors, hours, contact) stored in an editable `site_config` singleton rather than hardcoded. This keeps cost near-zero per client (free-tier hosting) while giving each shop a fully custom-feeling site, which a generic multi-tenant SaaS booking product (e.g. Booksy-style) could not offer at this price point for a single small shop.

## Operating Context

- Public site: `/` (marketing/info), `/agendar` (booking, no login), `/cancelar` (cancellation by phone, no login).
- Admin panel: `/admin/*`, single owner login via Supabase Auth (no per-barber login in this phase).
- Booking writes go through Next.js Server Actions using the Supabase service role — the public browser never writes sensitive tables directly; availability is computed server-side by crossing barber weekly schedules, time off, and existing appointments.
- Cancellation is allowed only more than 3 hours before the appointment, enforced server-side.
- No automated WhatsApp/SMS notifications in this phase; confirmation is on-screen only.
- Billing is computed automatically from completed appointments (price × count); monthly plans are tracked but payment is recorded manually by the owner, not processed online.

## Capabilities and Constraints

- Stack: Next.js (App Router) + Supabase (Postgres/Auth) + Tailwind CSS v4, deployed on Vercel. Already established in the codebase — not an open decision.
- Each deployment serves exactly one barbershop; isolation between clients comes from separate infra, not app-level tenancy logic.
- No client accounts/passwords by design — phone number is the client identity key.
- No online payment processing for plans in this phase.
- Undecided/explicitly out of scope for Phase 1: automated notifications, per-barber login, online recurring billing, full financial/cash module, a scaffolding CLI to spin up new client clones.

## Brand Commitments

None fixed yet — this is a template. Current seed/placeholder content uses a generic name ("Minha Barbearia") that a real client overwrites via the admin panel on their own clone. The visual *language* (palette, typography, component style) can and should be opinionated and polished as the template's default; copy and business-specific content must stay generic/placeholder.

## Evidence on Hand

No real client photos, logo, or copy exist yet (template, not a live client site). Any imagery used for the default/template state must read as a tasteful generic placeholder, not a specific shop's real asset, and must not be presented as real customer proof (testimonials, review counts, etc.).

## Product Principles

1. Config over code — anything a shop owner would reasonably want to change (name, colors, hours, services, prices) lives in editable data, not hardcoded markup.
2. No-friction booking — the public flow needs zero account creation and should resolve to a confirmed appointment in the fewest steps that still feel trustworthy.
3. Server is the source of truth for business rules — availability, cancellation windows, and double-booking prevention are enforced server-side, never trusted from the client alone.
4. Own the whole lifecycle cheaply — favor free/near-free infra tiers and a clone-per-client model over a shared multi-tenant platform, since each client is a small, price-sensitive local business.
5. Template-first craft — design and code quality should be high enough to hand to any future barbershop client with minimal rework, not just good enough for one deployment.

## Accessibility & Inclusion

No specific standard mandated yet; given the end-customer audience skews toward quick mobile use in varied lighting/contexts, legible contrast and comfortable tap targets matter more than typical for this product's success.
