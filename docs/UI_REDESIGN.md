# UI redesign — audit and plan

Goal: make LogiMind read as a finished enterprise logistics product inside Jira (quality bar: Linear,
Stripe Dashboard, Vercel, Ramp) without changing what it does. Backend, resolver contract
(`src/shared/api.ts`), manifest, storage, risk rules, import, Jira and Forge LLM features are untouched.

## Audit (before)

| Area | Finding |
|---|---|
| Shell | Plain text subtitle, text-only tabs, no product identity or page headers; content width unbounded on wide screens. |
| Palette | Raw Atlassian tokens only; dark mode is Jira's default grey with no hierarchy between page, card and table surfaces. Severity colours are bold Jira accents (neon in dark). |
| Type | One size for almost everything; KPI numbers do not stand out against labels; no type scale. |
| Dashboard | Five equal tiles, a bar list and a plain list; nothing tells the viewer what needs attention first. Hints are tiny grey lines, no explanation of how a KPI is computed. |
| Shipments | Checkbox "At risk only" instead of a risk filter; nine flat columns; ETA slip not visible without opening the drawer. |
| Drawer | One 12-field fact grid; no grouping, no timeline, related Jira issue mixed into the risk list. |
| Inventory | 14 columns of equal weight, horizontal scroll at laptop width; critical shortages look like every other row. |
| Risk Center | Cards list raw evidence; they do not say why it matters, the impact, or what to do next. |
| Import | Bare `<input type=file>`; no sense of the steps (upload → validate → map → results); rejected rows listed without guidance. Destructive "Delete all" confirmed inline next to other buttons. |
| States | Spinner + text for loading (layout jumps), plain boxes for empty/error. |
| A11y | Good base (tablist, inert drawer, focus return, glyph + label severity); keep all of it. |

## Plan

1. **Design system** (`styles/*.css`, `components.tsx`, `icons.tsx`): own token layer on top of `--ds-*`
   (light + `html[data-color-mode=dark]` graphite palette, electric-blue accent, muted severity scale),
   type scale 12/13/14/16/20/28, 4 px spacing, radii 6/10, cards, buttons, inputs, segmented controls,
   tables, badges, status dots, icons (inline SVG, no library), skeletons, empty/error/success
   callouts, modal confirmation dialog (native `<dialog>`), tooltips via info icons.
2. **Shell**: brand mark, page header per tab (title + one-line purpose), icon tabs with active
   indicator, max content width, EN/RU segmented switch.
3. **Dashboard**: attention banner from live risk counts, KPI cards with icon, value, hint and an
   explanation tooltip, risk distribution (stacked bar + legend), top risks list, recent imports.
   No trend arrows: the app keeps no KPI history, so none are shown.
4. **Shipments**: search with icon, status + risk-level filters, two-line cells, ETA slip computed
   from planned vs ETA, drawer with sections Overview / Supplier & carrier / Delivery timeline /
   Warehouse & inventory impact / Related risks & Jira issues.
5. **Inventory**: summary chips, SKU + product cell, available with on hand / reserved underneath,
   projected vs safety with coverage bar, days of cover, calm left accent for critical rows.
6. **Risk Center**: severity filter chips with counts; each card answers *what happened* (title),
   *why it matters* and *business impact* (sentences built only from the rule's own evidence),
   *next step* (by risk type, naming supplier / SKU / inbound shipments from evidence), evidence
   behind a disclosure, actions View shipment / View inventory / Create Jira issue.
7. **Import & Settings**: drag-and-drop zone, step indicator that follows the real flow, AI mapping
   step kept, results with "how to fix" guidance, delete-all in a modal confirmation.
8. **What-if, Copilot, issue sidebar, Jira settings** restyled on the same components.
9. Verify: tests, build, `forge lint`, deploy to development, check EN/RU and light/dark in Jira,
   React and accessibility reviews, screenshots in `docs/screenshots/`.

Every new string is added to both `en.ts` and `ru.ts` (the i18n test enforces identical shape).
