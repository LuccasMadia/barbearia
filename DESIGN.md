---
name: Barbearia Template
description: A dark, gold-accented barbershop template — private-club restraint over bright booking-app cheer.
colors:
  ink: "#0b0b0c"
  ink-raised: "#151513"
  ink-line: "rgba(201, 162, 75, 0.16)"
  ink-line-strong: "rgba(201, 162, 75, 0.32)"
  paper: "#f3efe6"
  paper-dim: "#c9c2b2"
  gold: "#c9a24b"
  gold-bright: "#e4c479"
  gold-ink: "#1a1408"
  danger: "#d9705a"
typography:
  display:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "clamp(1.875rem, 4vw, 3.75rem)"
    fontWeight: 400
    lineHeight: 1.05
    letterSpacing: "normal"
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.2em"
rounded:
  sm: "2px"
spacing:
  section-y: "6rem"
  section-y-tight: "4rem"
  stack: "1.25rem"
components:
  button-primary:
    backgroundColor: "{colors.gold}"
    textColor: "{colors.gold-ink}"
    rounded: "{rounded.sm}"
    padding: "14px 28px"
  button-primary-hover:
    backgroundColor: "{colors.gold-bright}"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.gold}"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
  option-row:
    backgroundColor: "transparent"
    textColor: "{colors.paper}"
    rounded: "{rounded.sm}"
    padding: "12px 16px"
  option-row-selected:
    backgroundColor: "{colors.ink-raised}"
    textColor: "{colors.paper}"
---

# Design System: Barbearia Template

## Overview

**Creative North Star: "The Private Club Ledger"**

The template reads as a members' barbershop that keeps its own leather-bound ledger, not a bright SaaS booking widget. A near-black charcoal ground carries everything; a single warm brass/gold accent is spent deliberately, never scattered. A serif display face gives headlines the weight of a letterpress sign, while a plain geometric sans keeps the working parts — nav, forms, booking controls — legible and quiet. Separation comes from thin gold hairlines and negative space, not boxes or shadows: the page is flat by design, closer to an engraved program than a dashboard. The explicit rejection is the cheerful, stock-photo booking-app look (bright neutrals, rounded cards, a saturated single-hue CTA on white) — this system is confident enough to stay dark and quiet.

**Key Characteristics:**
- Near-black ground, one gold accent, nothing else competes for attention
- Serif display (Fraunces) for headlines, geometric sans (Inter) everywhere functional
- Hairline rules and whitespace replace cards and shadows as the separation device
- Flat throughout — no elevation, no blur, no gradients beyond the hero photo's darkening overlay
- The hero carries the template's one real photograph, desaturated and darkened into the palette rather than shown at full color

## Colors

A one-accent system: charcoal does the work of structure, gold does the work of emphasis.

### Primary
- **Brass Gold** (`#c9a24b`): the only accent. Carries every primary CTA, active/selected state, price figures, and the signature scissors mark. Its hover state, **Bright Gold** (`#e4c479`), lightens it for interactive feedback without introducing a second hue.

### Neutral
- **Charcoal Ink** (`#0b0b0c`): the page ground, used everywhere as `background`.
- **Raised Ink** (`#151513`): a barely-lighter charcoal for selected rows and the barbers' band — never a shadow, a step in tone.
- **Paper** (`#f3efe6`): primary text, a warm off-white rather than pure white, read against the ink ground.
- **Paper Dim** (`#c9c2b2`): secondary text, labels, metadata — never a desaturated gray.
- **Gold Hairline** (`rgba(201,162,75,0.16)`) / **Gold Hairline Strong** (`rgba(201,162,75,0.32)`): the two border weights used for every divider, card edge, and input outline. Both are gold-tinted, never neutral gray, so even the quietest line still belongs to the palette.
- **Signal Red** (`#d9705a`): form errors only.

### Named Rules
**The One Accent Rule.** Gold is the only saturated color in the system. If a new element needs emphasis, it earns gold or it stays in paper/paper-dim — never a second hue.

## Typography

**Display Font:** Fraunces (with Georgia, serif fallback)
**Body Font:** Inter (with ui-sans-serif, system-ui fallback)

**Character:** Fraunces' soft-but-confident serif forms give headlines and prices a hand-set, letterpress quality against the flat charcoal ground; Inter stays out of the way for everything a visitor has to read quickly or interact with.

### Hierarchy
- **Display** (400, `clamp(1.875rem, 4vw, 3.75rem)`, 1.05 line-height): page and section headings (`h1`, `h2`), and every price figure. Always set in Fraunces.
- **Body** (400, 1rem, 1.6 line-height): paragraph copy, descriptions, option-row labels.
- **Label** (500, 0.75rem, 0.2em tracking, uppercase): field labels in the contact definition list and the booking columns' eyebrow headings (`SERVIÇO`, `BARBEIRO`, `RESUMO`).

### Named Rules
**The No-Kicker Rule.** No eyebrow or kicker line ever sits above a heading — the heading carries its own weight. Uppercase tracked labels are used only as field/column labels inside data, never as a prefix to a headline.

## Layout

Two container widths: `max-w-4xl` for editorial reading sections (Services, Barbers, Contact) and `max-w-6xl` for the header, footer, and the four-column booking surface. Section rhythm is generous and consistent — `py-24` between major home sections, more space above a heading than below it. The booking page (`/agendar`) is an Operate surface: service, barber, date/time, and a running summary sit as four simultaneous columns on desktop (`lg:grid-cols-[1fr_1fr_1.2fr_1fr]`), collapsing to a single stacked column below `lg`, with a numbered progress rail (filled gold per completed step) above the grid rather than a full-screen step-by-step wizard.

## Elevation & Depth

Flat by design — no shadows anywhere in the system. Depth and separation come entirely from the gold hairline border system (`ink-line` / `ink-line-strong`) and from tonal steps between `ink` and `ink-raised`, never from `box-shadow` or blur.

### Named Rules
**The Flat-By-Default Rule.** Surfaces never lift. A selected or active element gets a gold border and/or the `ink-raised` fill, never a shadow.

## Shapes

Corners are barely softened (`2px` radius) rather than fully square or rounded — closer to a printed card's trimmed edge than an app's pill button. Every container, button, and input shares the same `2px` radius; nothing in the system uses a larger radius or a fully circular shape except avatars (barber photo/initials circles) and the calendar's day-selection marker, both intentionally circular as a deliberate exception for "a person" and "a single point in time."

## Components

### Buttons
- **Shape:** `2px` radius, no shadow.
- **Primary:** solid Brass Gold background, Gold Ink (`#1a1408`) text, `14px 28px` padding — used for the one primary action per screen (Agendar horário, Confirmar agendamento).
- **Outline:** transparent background, gold border and text — used in the header's secondary "Agendar" entry point.
- **Hover:** background steps to Bright Gold; outline buttons fill solid gold with gold-ink text.

### Option rows (booking)
Selectable list rows for service/barber choice: `2px`-radius bordered rows, `ink-line` border at rest, Gold border + `ink-raised` fill when selected. No radio/checkbox control — the row itself is the control.

### Inputs
Bordered text fields (name, phone), transparent background, `ink-line` border, Gold border on focus. Placeholder text in Paper Dim.

### Navigation
Sticky, translucent-blurred charcoal header with a gold hairline bottom border. Links in Paper Dim, Bright Gold on hover, no underline. Collapses to wordmark + primary CTA only below `md` — anchor links are a desktop convenience, not required for mobile since every section is reachable by scrolling.

### Hero Photo (signature treatment)
The home hero carries one real photograph, right-weighted behind the headline (`object-[72%_30%]`), pulled into the palette rather than shown at full color: `grayscale(0.25) brightness(0.8) saturate(0.9)`, a left-to-right ink gradient for text legibility, and a subtle top/bottom vignette. On hover over the hero band, the image scales to `105%` over 700ms as the one cinematic micro-interaction on the page — every other hover in the system is a flat color/border change.

### Month Calendar (signature component)
A hand-built month grid replacing a native date input, in service of the Operate direction's single-screen booking: circular day cells, Gold fill for the selected day, dimmed/disabled past dates, plain prev/next month arrows. Pairs with a 3-column grid of time-slot chips below it (Gold fill when selected).

### Summary panel (signature component)
The booking page's right-hand column: a definition list of Serviço/Barbeiro/Data/Horário divided by hairlines, a Gold total price in display type, then the name/phone form and confirm button inline — the "running total" that makes the booking flow read as one working screen rather than a multi-page wizard.

## Do's and Don'ts

### Do:
- **Do** spend gold on exactly one thing per view: the primary action, the active state, or the price.
- **Do** separate content with gold-tinted hairlines (`ink-line`) and whitespace, not boxes or shadows.
- **Do** keep all business content (shop name, colors, hours, services, barbers) sourced from `site_config`/`services`/`barbers` — never hardcode a specific shop's identity into a component.

### Don't:
- **Don't** add a kicker/eyebrow line above any heading.
- **Don't** introduce a second accent hue, a card-grid scaffold, or any `box-shadow`.
- **Don't** invent customer-facing claims (ratings, testimonials, "X years of experience") that aren't backed by real data — this is a template with no real client content yet.
