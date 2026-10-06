---
version: 1
slug: "app-agendar-page-tsx"
primary_target: "app/agendar/page.tsx"
related_targets: ["components/booking/BookingWizard.tsx"]
---

## Direction contract

THESIS: Booking is a single working screen, not a wizard the visitor marches through one full-page step at a time — the category default this refuses is the current one-question-per-screen flow with no sense of progress or total.

OWN-WORLD: Same dark charcoal ground and brass/gold accent as the home world, applied here as the shell's four contributions only (type, palette, density, one signature move — the running summary panel); every control stays a standard, familiar form element (radio-style option rows, a real calendar grid, time-slot chips, text inputs), never a costume of the world.

STORY: The visitor sees service → barber → date/time → live summary all at once, picks through each column left to right, watches the summary panel on the right fill in and total up, and confirms in place without losing context or feeling like they restarted.

FIRST VIEWPORT: A numbered 4-step progress rail across the top (Serviço / Barbeiro / Data e hora / Confirmar, current step filled gold); below it a 4-column grid on desktop — service list, barber list, a real month calendar + time-slot chips, and a sticky summary card (selected service/barber/date/time, total, confirm button) — collapsing to a single stacked column with the summary pinned at the bottom on mobile.

FORM: Brief-pinned via the user's reference screenshot (inline multi-column booking wizard with live sidebar summary); no concept-seed roll.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
