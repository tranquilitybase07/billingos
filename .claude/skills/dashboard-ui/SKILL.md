---
name: dashboard-ui
description: >-
  Design conventions and component vocabulary for building or revamping any
  dashboard UI in the BillingOS web app (apps/web). Use this WHENEVER the work
  touches a dashboard page, form, settings panel, table, card layout, tabs, or
  any merchant-facing screen under /dashboard — including new pages, redesigns,
  "make this look better / less cluttered", or "this form looks weird". Covers
  which repo components to reach for (PillTabs, CardFlat, the shared Input),
  elevation/border rules, progressive disclosure, empty states, and the
  popover/modal/toast decision. Reach for it even when the user doesn't say
  "design" — if you're about to add or restyle dashboard UI, read this first so
  the result matches the rest of the app instead of drifting.
---

# Dashboard UI

How dashboard screens in `apps/web` are meant to look and behave. The goal is an
*orchestration* of data — primary task forward, everything else deferred — not a
pile of bordered boxes. When you add or revamp a dashboard surface, follow these
so it matches the existing app instead of becoming a one-off.

Two hard repo rules that override taste:
- **Never hand-roll primitives.** Add shadcn components via the CLI:
  `pnpm dlx shadcn@latest add <name>`. (See `[[feedback_shadcn_ui]]` in memory.)
- **Match the surrounding code** — its component choices, spacing scale, and
  comment density. The churn section (`churn/ChurnSection.tsx`,
  `churn/ChurnBuilderPage.tsx`) is the current reference implementation of
  everything below; read it when in doubt.

## Component vocabulary — reach for these first

Use the repo's existing component for the job before inventing markup. The
common mistakes are using a heavier primitive than needed, or a generic one
where a purpose-built one exists.

| Need | Use | Not |
|------|-----|-----|
| Tabs / view-switch in a page | `PillTabs` / `PillTabsList` / `PillTabsTrigger` from `@/components/atoms/PillTabs` (pair with `TabsContent` from `@/components/ui/tabs` for panels) | raw shadcn `Tabs` — its `TabsList` is the unstyled default and won't match settings/products |
| Pick-one selector (offer type, mode) | `PillTabs` (segmented look, animated active state) | N `<Button>`s toggling `variant="default"/"outline"` — reads as amateur and the active state is invisible on dark |
| Stacked / nested panels inside a page | `CardFlat` (`bg-card`, no border, no shadow) | `Card` — its border + shadow stack into visible nested strokes |
| Standalone hero card on a plain bg | `Card` (border earns its keep here) | — |
| Text / number entry | shared `Input` / `Textarea` from `@/components/ui/*` (transparent fill, faint hairline border) | custom input markup, or any dark "well" background |
| Single-task overlay | see *Interaction surfaces* below | a modal for everything |

`PillTabs` requires a unique `layoutId` per instance (it drives the sliding
indicator). When you render one per list item, key it: `layoutId={`offer-kind-${item.key}`}`.

## One container cue per nesting level

The most common reason a dashboard "looks weird" is **stacked borders** — a card
border around a row border around an input border. Each nesting level should be
distinguished by exactly one cue, and prefer a **background-shade change over a
stroke**. The "Midnight Slate" dark theme ships tokens for exactly this ladder:

| Level | Cue | Dark token |
|-------|-----|-----------|
| Page | background only | `oklch(0.125 …)` |
| Card / panel | `bg-card`, no border (use `CardFlat`) | `oklch(0.165 …)` |
| Row inside a list | divider (`divide-y`) or spacing — **no box** | — |
| Recessed sub-panel (e.g. expanded config) | a faint fill, `bg-muted/40` | — |
| Input | transparent + faint hairline border, blue on focus | border `white/8%` |

Do **not** wrap each repeating item (a reason, a member, a webhook) in its own
`border` box. Separate them with `divide-y divide-border/60` rows. The only
"edge" the user should see going down a level is a shade change, not a new line.

Inputs specifically: transparent fill, a *faint* border (fainter than the old
`oklch(0.32)` stroke), blue border + ring on focus. Avoid darker-than-card
"wells" — on a near-black theme they read as holes. The shared `Input` already
encodes this; just use it.

## Principle 1 — let the data drive the UI

Don't force data into generic containers. The shape of the data should pick the
control.

- **Categorical → chips/badges**, not plain text. Time-ordered → a timeline, not
  time-sorted rows.
- **Numbers right-aligned by place value** with **unit adornments** (`%`, `mo`,
  `$`) so they're scannable and comparable. A bare number field with the unit
  smuggled into the label is a smell.
- **Don't encode logic in labels.** `Months (0 = once)` means the control can't
  express the data — replace with a real control (segmented *Once / N months /
  Forever*) or at least a clear field + short helper, not a magic value.
- **Color is functional, not decorative.** Reserve red/amber for urgent or
  destructive states so it actually directs attention; don't paint chips for
  decoration. Truncate long text to hold the layout.

## Principle 2 — progressive disclosure

Showing every control at once signals inexperience. Spread actions across a
spectrum of explicitness:

- **Primary action front and center** (search, the main CTA). **Secondary
  actions deferred** behind hover, a popover, or a `…` menu.
- **Collapse repeating detail.** A list of N configurable items should read as N
  compact summary rows (`Too expensive · 20% off for 3mo`) that expand on edit —
  not N fully-expanded forms stacked 300px tall.
- **Move explanatory paragraphs into tooltips** (`InformationCircleIcon` +
  `Tooltip`). They're a safety net for newcomers and clutter for experts; a
  tooltip serves both.
- **Sequence onboarding** — introduce features as the user reaches them
  (tooltips, a checklist), don't dump a giant modal on first load.

## Principle 3 — the "invisible" UI

A finished screen leans on states the user doesn't see until they interact.

- **Hover-reveal secondary/destructive controls.** A per-row delete is a trash
  icon that fades in on `group-hover`, not a permanent "Remove" text button ×N.
  Reorder handles, copy-to-clipboard, and row actions follow the same rule.
  (Caveat: never hide the *primary* action behind hover, and remember hover
  doesn't exist on touch — hide only what's safe to discover late.)
- **Tooltips for ambiguous labels/icons.** If a label needs a sentence of
  explanation, that sentence belongs in a tooltip, not inline.

## Dashboard structure

- **Sidebar = the spine.** Group related links; one nav entry per *concept*. If
  two entries point at the same concept (e.g. a builder + its analytics), merge
  them into one section with tabs rather than two sidebar items. Park rarely-used
  items (settings) at the bottom. Nav lives in
  `components/Layout/DashboardSidebar.tsx`.
- **Dashboard-first.** Land on the thing the user checks often (the data/overview),
  with configuration one click away — a tab or a header button, not the default
  view. The primary metric/status goes top and prominent.
- **Tabs over sidebar clutter.** Different views of the *same* concept belong in
  in-page `PillTabs` (Overview / Save flow), not extra sidebar entries.
- **Empty & off states are part of the design.** No data yet → a focused
  null-state with a single CTA, never an empty chart grid. A feature that's
  configured-but-inactive → a status pill plus a banner that makes the
  consequence and the fix obvious ("Your save flow is off — customers won't see
  it. [Turn it on]").

## Interaction surfaces

Pick the lightest surface that fits the task:

- **Popover** — simple, non-blocking tweaks (display settings, a quick picker).
- **Modal / Dialog** — a complex, focused, blocking task (create a resource,
  destructive confirm). Don't reach for it for small things.
- **Toast** — confirmations and errors that shouldn't interrupt. Use the repo's
  `useToast`.

**Optimistic UI** makes things feel snappy *for cheap, reversible toggles* —
update immediately, revert on error (see `handleToggleEnabled` in
`ChurnBuilderPage.tsx`). Do **not** apply it to money-moving billing actions
(creating coupons, pauses, cancellations): show real pending/confirmed state,
because an instant "success" that later rolls back is dangerous messaging. This
mirrors the Stripe-is-authoritative rule in `.claude/rules/backend.md`.

## Revamp checklist / smell tests

When a screen "looks weird," scan for these — each maps to a fix above:

- Borders inside borders inside borders → collapse to one cue per level; use
  `CardFlat` + `divide-y` rows.
- Inputs with a dark fill or heavy outline → use the shared transparent `Input`.
- A row of buttons flipping `default`/`outline` for one choice → `PillTabs`.
- A label like `0 = indefinite` → wrong control; add a real selector + adornment.
- Always-visible per-row "Remove"/"Edit" text → hover-reveal icon.
- Every item expanded at once → summary rows that expand on demand.
- Two sidebar entries for one concept → merge into a tabbed section.
- Empty charts on first visit → a null-state CTA instead.

## Worked example

The churn section is the canonical application of all of the above:
- `app/dashboard/[organization]/(header)/churn/ChurnSection.tsx` — dashboard-first
  landing, `PillTabs`, status pill, null state, off-banner, merged nav.
- `app/dashboard/[organization]/(header)/churn/ChurnBuilderPage.tsx` — `CardFlat`
  panels, `divide-y` reason rows, `PillTabs` offer selector, hover-reveal delete,
  unit adornments, transparent inputs.

Read those two files before starting a new dashboard surface — copying their
structure is the fastest way to stay consistent.
