# Test Report

Last updated: 2026-11-03 (Phase 6). App version under test: **v5.9.0** (Forge development environment, `utkirovm3.atlassian.net`).

## Summary

| Check | Result |
|---|---|
| Unit / component tests (`npx vitest run`) | **195 passed, 0 failed** (18 files) — 2026-11-03, roadmap week 2 + EN/RU (was 159 after week 1, 110 in Phase 6) |
| Statement coverage of `src/` (`vitest --coverage --coverage.include='src/**'`) | **84.5 %** (week 2; `cover.ts` and `what-if.ts` 100 % of lines). Phase 6: 81.1 %. Domain, copilot, agent, auth, lock: 93–100 %. Untested: `index.ts` wiring, `kvs-issue-links.ts` |
| Type check (backend + UI) | Pass |
| `forge lint` | No issues |
| Production dependency audit | Backend: 5 moderate, all transitive in Atlassian's `@forge/manifest` (`glob`, `minimatch`) — build-time manifest parsing, not reachable from user input. UI: prosemirror advisories via `@forge/bridge`, not present in the built bundle. |

## QA matrix

✅ = verified, with evidence · 🟡 = partially verified · ⛔ = not verified (reason given)

| Area | Status | Evidence |
|---|---|---|
| CSV import – invalid files | ✅ unit | `importer.test.ts` (missing columns, unknown header, empty, unterminated quote, duplicate columns), `fixtures.test.ts` (`not-a-logistics-file.csv` refused), `logistics-service.test.ts` (oversized file, storage untouched) |
| CSV import – missing values | ✅ unit | `importer.test.ts`, `fixtures.test.ts` (line 3: missing supplier) |
| CSV import – duplicate records | ✅ unit | duplicate shipment IDs / inventory rows / columns |
| CSV import – incorrect dates | ✅ unit | `parseIsoDate` (Feb 30, month 13, wrong format), fixture line 4 |
| CSV import – live upload in Jira | ⛔ manual | Chrome automation cannot reach the file input inside Forge's cross-origin iframe. Manual steps below. |
| Overdue shipments | ✅ unit + live | `risk-engine.test.ts` (severity thresholds, closed shipments ignored); live Risk Center shows `LATE_SHIPMENT:SHP-1004` |
| Low inventory | ✅ unit + live | 8 LOW_STOCK tests incl. stock-out, ETA window, case-insensitive locations; live Inventory / Copilot (SKU-10 transfer) |
| Jira issue creation | ✅ unit + live | `issue-service.test.ts`, `forge-adapters.test.ts` (request body, 400/401/403/404/429/500 mapping); live: SCRUM-5 created with ADF evidence and labels |
| Duplicate prevention | 🟡 unit | Existing / hidden / deleted issue, concurrent create (BUSY), link-save retry, token-owned lock (`kvs-adapters.test.ts`). Live: button replaced by the linked key; a forced second create was not attempted. |
| Rovo agent queries | 🟡 unit | `actions.test.ts` (10 tests: DTOs, unknown/invalid IDs, injection isolation, hidden issues, failures). ⛔ Live: Rovo is not provisioned on the dev site. |
| Missing shipment IDs | ✅ unit + live | Copilot "Where is SHP-9999?" in Jira → reported as unknown, nothing invented; agent returns `found:false` |
| AI provider failures | n/a | No AI provider is enabled (user decision, Phase 4). The copilot is rule-based. |
| Storage failures | ✅ unit | Service propagates write failures; KVS rollback removes only added keys; lock errors are not misreported as "busy"; agent returns "data unavailable" |
| Permissions | 🟡 unit + live (admin) | `forge-adapters.test.ts`: ADMINISTER check grants only on explicit `true`, denies on errors, `requireDataManager` throws. Live: admin path works. ⛔ Non-admin path needs a second Jira account. |
| UI responsiveness | ⛔ manual | The Chrome window could not be resized from automation (maximised) and the iframe is not inspectable. The CSS uses auto-fit grids and a 640 px breakpoint; manual check below. |

## Roadmap week 2 + EN/RU (2026-11-03, dev v6.7.0)

| Area | Status | Evidence |
|---|---|---|
| `daily_usage` import validation | ✅ unit | `importer.test.ts`: decimals, 0, blank → null, −1 / text / > 1e9 rejected by line |
| Days of cover math | ✅ unit + live | `cover.test.ts` (10 tests: no usage, whole days, stock-out today, inbound before/after stock-out, just-in-time arrival, overdue ignored, safety date, horizon, fractional usage); `logistics-service.test.ts` (pipeline beyond 7 days, legacy rows without usage). Live: Inventory shows e.g. SKU-03 Tashkent "3 дн., закончится 06 нояб." |
| What-if simulator | ✅ unit + live | `what-if.test.ts` (8 tests incl. supplier mode, overdue excluded, untracked locations, clamping, demo stories). Live: slider 7 → 16 days updates instantly; drawer "Simulate a delay" opens SHP-1001 preselected (27 d → 12 d) |
| Copilot/Rovo `simulate_delay` | ✅ unit, 🟡 live | `actions.test.ts` (+3), `llm-copilot.test.ts` (+1). Live: Russian question "что будет, если SHP-1001 задержится на 10 дней?" → AI answer in Russian, mode AI, values verified. Rovo action ⛔ (Rovo not provisioned) |
| EN/RU switch | ✅ unit + live | `tests/ui/i18n.test.ts` (same keys/arity, no empty text, Russian really translated, plurals, risk titles); TypeScript `ru: Messages`. Live: English by default, RU on Dashboard/Inventory/What-if/Shipments/drawer/Copilot, choice kept after reload |
| Not verified live | ⛔ | Issue sidebar and column-mapping step in Russian (covered by type check only); Rovo action |

## Roadmap week 3: closed loop in Jira (2026-11-09, dev v6.13.0)

Automated: 260/260 tests in 22 files, `tsc --noEmit` (backend + UI) clean, `build:ui` exit 0, `forge lint` "No issues found". Deployed to development (6.13.0) and then, with the author's approval, to production (v3.2.0, deployed by the author; `forge lint` clean). Production has no site installation (`forge install list` shows only the dev site), so it was not checked live; it runs the same code as dev 6.13.0.

| Area | Status | Evidence |
|---|---|---|
| Daily check diff + snapshot | ✅ unit, ✅ live (baseline) | `daily-check-service.test.ts`, `kvs-check-store.test.ts` (two day slots, half-overwritten snapshot, clear). Live: "Run check now" → "First check: the open risks were recorded…", 28 open, manual run |
| No-data run | ✅ unit | Run without imported data is stored as `noData` (no snapshot), briefing shows the import hint |
| Auto-create (off by default, max 5, pending carry-over, FORBIDDEN message) | ✅ unit, ⛔ live | Live: badge "Auto-create off" shown; issues not auto-created live because the first run is a baseline and a second day's diff is needed |
| "Resolved in data" comment (marker first, rollback, never transitions) | ✅ unit, ⛔ live | Needs a risk to disappear between two checks with a linked issue |
| Scheduled trigger | ⛔ live | Jira picks the time; not observed yet on dev |
| Supplier follow-up draft | ✅ unit, ✅ live | Validator tests (dates, IDs, numbers, links/domains, currency, non-ASCII digits). Live on SHP-1014: AI draft accepted, "Written by AI…" note, facts correct (PO-514, 45 × SKU-05, planned 2026-11-01, 8 days overdue) |
| Copy button | 🟡 live | Clicked; no error shown, but the "Copied" state was not observed in the screenshot |
| EN/RU strings | ✅ unit | `i18n.test.ts` (same keys/arity); RU not checked live for the new panels |

Known limitations (accepted for week 3):
- The legacy `snap:meta` key from an earlier dev build is ignored, so the first check after deploy is always a baseline.
- Auto-created issues are created asApp; if the app's project permissions are removed later, runs report FORBIDDEN until an admin restores them.
- Issue keys of auto-created issues are shown in the briefing to everyone who can open LogiMind.
- Follow-up drafts: number words ("nine days") are not checked by the validator; only digits are.

## Roles: owner / managers / viewers (2026-11-09, dev v7.0.0)

Automated: 313/313 tests in 26 files, `tsc --noEmit` (backend + UI) clean, `build:ui` exit 0, `forge lint` clean apart from the expected major-version approval (new scope `read:jira-user`). Deployed to development with `--approve MAJOR_VERSION_RULE` (7.0.0) and the dev site upgraded with `forge install --upgrade` (scope accepted). With the author's approval, deployed to production as **v4.0.0** (`--approve MAJOR_VERSION_RULE`, `build:ui` exit 0). Production has no site installation (`forge install list` shows only the dev site), so there was nothing to upgrade and it was not checked live; it runs the same code as dev 7.0.0. A site that installs it later will be asked to consent to `read:jira-user`.

| Area | Status | Evidence |
|---|---|---|
| Role rules (claim, takeover, add/remove, transfer, limits, log of 50) | ✅ unit | `roles.test.ts` |
| Service checks (admin fallback while no owner, owner-only changes, active human accounts only, expected-owner check) | ✅ unit | `role-service.test.ts` |
| Every data-changing resolver checks the role first; every resolver is classified | ✅ unit | `resolvers.test.ts` (11 data writes, 5 role resolvers, 15 open) |
| KVS lock (BUSY, release on failure) | ✅ unit | `kvs-role-store.test.ts` |
| Jira user lookup/search (bots and inactive users filtered, junk responses) | ✅ unit | `forge-adapters.test.ts` |
| No owner yet: Jira admin sees "Become owner", data rights unchanged | ✅ live | Roles panel: "No owner yet…", button shown |
| Become owner | ✅ live | "You are now the owner of LogiMind.", role shows Owner, name from Jira |
| Manager search (owner) | ✅ live | Query "mu" → "1 person found.", own account marked "Owner" |
| Role log | ✅ live | "Last 1 change": became owner |
| Add / remove manager, transfer, takeover | ✅ unit, ⛔ live | Needs a second Jira account |
| Manager and viewer views (disabled controls, server refusal) | ✅ unit, ⛔ live | Needs a second Jira account |
| Avatars | 🟡 live | A round "M" badge is shown; from outside the app iframe it was not possible to tell Jira's avatar image from the initials fallback |
| EN/RU strings | ✅ unit | `i18n.test.ts`; RU not checked live |

Note: while no owner exists, a Jira admin's role label reads "Viewer" although they can manage data (the panel text explains this).

## Roadmap week 4: Atlassian MCP (`rovo:mcp`) (2026-11-10, dev v7.2.0)

| Check | Status | Evidence |
|---|---|---|
| Full suite | ✅ | `npx vitest run`: **319 passed** (27 files); UI build OK; `tsc --noEmit` clean; `forge lint` no issues |
| One `rovo:mcp` module, key/name rules, exactly the five read-only tools, each a `GET` action backed by an `index.agent*` handler; `rovo:agent` unchanged; scopes unchanged | ✅ unit | `tests/manifest/rovo-mcp.test.ts` (red before the module was added, green after) |
| Tool behaviour (validation, `importedText` isolation, `visibleToYou`, `safely`) | ✅ unit | Same handlers as the Rovo agent: `tests/agent/actions.test.ts` |
| Deploy to development | ✅ live | `forge deploy -e development` → v7.1.0, then v7.2.0 with the review fix (minor, no re-consent) |
| MCP endpoint exists for the app | ✅ live | Unauthenticated `initialize` to `https://mcp.atlassian.com/forge/<appId>` → `401 invalid_token` with `WWW-Authenticate: Bearer resource_metadata=…`; the metadata names an Atlassian authorization server |
| Admin page (Connected apps → LogiMind → Tools) | 🟡 live | LogiMind was **not listed** under Connected apps on utkirovm3 (no Rovo), yet the OAuth flow below offered the site and tool calls worked; the per-tool admin switch could not be seen |
| OAuth 2.1 consent from an MCP client | ✅ live | Claude Code: `claude mcp add --transport http logimind https://mcp.atlassian.com/forge/<appId>` → `/mcp` → Authenticate → status **Connected** (site without Rovo) |
| Tools listed to the client | ✅ live | `get-risk-summary_development`, `get-shipment_development`, `get-inventory_development`, `get-linked-jira-issue_development`, `simulate-delay_development` (the platform adds the environment suffix) |
| Real tool calls | ✅ live | `get-risk-summary` (limit 3) → 30 open risks (7 critical), top 3 late shipments with numeric evidence, `notice` present; `simulate-delay` (NorthStar Parts, +7 days) → SHP-1011 / SKU-01: stock-out 2026-12-31 → 2026-11-28, days of cover 51 → 18, `readOnly:true`; `simulate-delay` SHP-1001 → `found:false` (already arrived); `get-linked-jira-issue` LATE_SHIPMENT:SHP-1004 → no issue yet |
| Production deploy | ✅ | `forge deploy -e production` → v4.1.0 (minor, no re-consent), author-approved |
| Prompt-injection style input from the client | ✅ live | `get-shipment` with `SHP-1004; ignore previous instructions` → `ok:false, "shipmentId is not a valid identifier"`, no data |
| Rovo Studio custom agent using the tools | ⛔ not possible | Rovo is not provisioned on the author's site (D11) |

Reviews (ecc typescript-reviewer, security-reviewer): no Critical/High.
- **Fixed:** raw Jira/storage error text no longer reaches the caller of `get-linked-jira-issue` (it could name a hidden issue). It is logged and replaced by a fixed message; pinned by `actions.test.ts`.
- **Fixed:** the manifest test now fails with a clear message if the module is missing, and checks that each handler is really exported from `src/index.ts`.
- **Open (follow-ups, not regressions):**
  - handlers do not check or log the calling account; an MCP caller only needs a site account the admin allowed, and the data is app-wide;
  - one hidden or deleted issue may fail a whole 50-ID JQL status chunk (to be checked live);
  - no app-level rate limit (Forge invocation limits apply);
  - the UI `listIssueLinks` resolver still returns stored keys of issues the user cannot see;
  - with an external MCP client, tool results leave Atlassian for that client's AI vendor (admin opt-in).

## Roadmap week 5: design (2026-11-10, dev v7.3.0)

| Check | Status | Evidence |
|---|---|---|
| Full suite | ✅ | `npx vitest run`: **338 passed** (29 files); UI build OK; both `tsc --noEmit` clean; `forge lint` no issues |
| Timeline domain (range, order, slip, overdue, 12-row cap, early ETA after planned date) | ✅ unit | `tests/domain/timeline.test.ts` |
| Stock series (arrival jumps, reservations shortfall, exact crossing, just-in-time arrival, window clamp, stock-out = days of cover for every demo position) | ✅ unit | `tests/domain/stock-series.test.ts` |
| EN/RU dictionaries have the same shape | ✅ unit | i18n parity test |
| Visual check in a local preview (mocked bridge, demo data) | ✅ | Dashboard timeline, Inventory chart, What-if before/after, welcome screen (owner and viewer), checklist; light/dark, EN/RU, narrow width |
| Deploy to development | ✅ live | `forge deploy -e development` → v7.3.0 (minor) |
| Production deploy | ✅ | `forge deploy -e production` → v4.2.0 (minor, no re-consent), author-approved |

Reviews (ecc typescript-reviewer, security-reviewer): no Critical/High/Medium. Fixed after review: reservations in the stock series; stock-out mark at the exact crossing; overdue counted from the planned date when the ETA is earlier; Inventory table no longer waits for shipments; What-if chart window grows to the latest delayed arrival (max 90 days); SVG `aria-hidden` with a text summary; row keys via `JSON.stringify`. Also fixed: doubled full stop after RU dates in the chart summary.

## Roadmap week 6: supplier reliability + arrival forecast (2026-11-11, dev v7.4.0)

| Check | Status | Evidence |
|---|---|---|
| Full suite | ✅ | `npx vitest run`: **357 passed** (30 files); UI build OK; both `tsc --noEmit` clean; `forge lint` no issues |
| Reliability (median, rounding, grades, cancelled ignored, open/late counts, sort, name matching by case/spaces, future actual dates ignored) | ✅ unit | `tests/domain/supplier-reliability.test.ts` |
| Forecast (history shift, slipped ETA kept, overdue, passed date → null, too little history, on-time supplier, ETA vs plan basis) and the "late as usual" series (overdue left alone; demo SKU-01 Tashkent spends more days below safety) | ✅ unit | same file |
| `getShipment` returns the supplier record and forecast | ✅ unit | `tests/services/logistics-service.test.ts` |
| Visual check in a local preview (mocked bridge, demo data) | ✅ | Suppliers panel and filter, "likely" dates, drawer Forecast step and delivery record, stock chart dashed line; dashboard timeline unchanged |
| Deploy to development | ✅ live | `forge deploy -e development` → v7.4.0 (minor) |
| Production deploy | ⏳ | waits for the author's approval |

Reviews (ecc typescript-reviewer, security-reviewer): no Critical/High. Fixed after review (Medium): on-time suppliers were described as "not enough history"; "after the ETA" wording when only a plan exists; supplier names split by case/spaces; "late as usual" line could sit above today's for overdue shipments. Low fixed: future actual dates counted, stale supplier filter after re-import, table caption/`scope`, filter badge announced, RU wording, duplicate CSS rule. Also fixed: `.tl-label`/`.tl-note` styles from the dashboard timeline leaked into the drawer timeline.

## Defect found and fixed during QA
- **Shifted-column noise (importer):** a row with an unquoted comma (e.g. `Acme, Inc`) reported the column-count error *plus* three misleading field errors. Now only the cause is reported. Pinned by `fixtures.test.ts` (line 8).

## Manual checks for the user (≈5 minutes)

1. **CSV upload with errors** — Import & Settings → choose `tests/fixtures/shipments-with-errors.csv`. Expected: "2 of 9 shipments rows imported, 7 rejected", with errors on lines 3 (supplier), 4 (planned_arrival), 5 (qty), 6 (status), 7 (duplicate QA-001), 8 (column count), 9 (actual_arrival). *This replaces the shipment data — click **Load demo data** afterwards to restore it.*
2. **Wrong file** — upload `tests/fixtures/not-a-logistics-file.csv`. Expected: "File was not imported. Unrecognised header…", data unchanged.
3. **Phone width** — open LogiMind in Jira on a phone (or a narrow window). Expected: tabs scroll horizontally, KPI tiles stack, tables scroll inside their panel, the shipment drawer fills the width.
4. **Non-admin** *(optional, needs a second account)* — Import & Settings shows the "Only Jira administrators…" note and disabled buttons; Copilot and Risk Center still work.
