# Implementation Status

Last updated: 2026-11-03

| Phase | Status |
|---|---|
| 0 — Documentation and planning | ✅ Done — `docs/PROJECT_PLAN.md` |
| 1 — Environment and Hello World | ✅ Done — verified inside Jira |
| 2 — Core application | ✅ Done — verified inside Jira (dev environment, app v4.0.0) |
| 3 — Jira integration | ✅ Done — verified inside Jira (app v5.2.0) |
| 4 — AI Logistics Copilot | ✅ Done — **AI mode via Forge LLM** with rule-based fallback (Roadmap week 1), verified in Jira on the dev environment (v6.6.0); answers in EN or RU and can run the what-if tool (v6.7.0) |
| 5 — Rovo agent (bonus) | 🟡 Built, lint-clean and deployed (v5.8.0); **not verified live** — Rovo/Agent Studio is not available on the dev site |
| 6 — Quality assurance | ✅ Done — see `docs/TEST_REPORT.md` (110 tests, 81 % coverage, v5.9.0); 3 manual checks left for the user |
| 7 — Submission prep | 🟡 Repository ready (README, MIT LICENSE, ARCHITECTURE, DECISIONS, Devpost texts, demo script, checklist; sanitizer PASS-WITH-WARNINGS). Publishing, production deploy, install link and video need the author — see `docs/DEVPOST_CHECKLIST.md` |

## Roadmap week 2 — days of cover, what-if simulator; EN/RU language switch (2026-11-03)

**Decisions:** D17 (EN/RU), D18 (days of cover is a projection, no new risk, `RULE_VERSION` stays 1.2.0), D19 (what-if in the browser + read-only tools).

**Built**
- **Copilot notice** shortened to one line with a check glyph; the per-answer mode line and the rule-based fallback notice are unchanged.
- **EN/RU** — `static/app/src/i18n/{en,ru}.ts` + `I18nProvider`/`useI18n` (text, locale number/date formatting, switch). `ru` is typed as `Messages = typeof en`, and `tests/ui/i18n.test.ts` checks keys, function arity, empty strings and untranslated text. Every view, empty/error state, the column-mapping step and the issue sidebar are translated; risk titles are rebuilt in Russian from evidence. `askCopilot` takes `locale`; the system prompt asks for natural Russian with IDs, ISO dates and plain digits, so verification is unchanged. Server text stays English (D17).
- **Days of cover** — optional `daily_usage` (decimal, 0–1e9) in import, AI column mapping and demo data; `src/domain/cover.ts` (`projectCover`, `buildPipelineIndex`, `coverFor`); `InventoryRow.cover`; Inventory columns "Use / day" and "Days of cover", drawer facts; Copilot/Rovo `get_inventory`/`get_shipment` include `daysOfCover`, `stockOutDate`, `belowSafetyStockFrom`. Rows imported before the column existed show "—".
- **What-if** — `src/domain/what-if.ts` (`simulateDelay`, `delayCandidates`): one shipment or a supplier's upcoming shipments, delay 0–30 days, before/after low-stock severity (7-day rule), days of cover, stock-out and safety dates, "worse" flag, untracked locations. New **What-if** tab (radio + select + slider, live results), "Simulate a delay" in the drawer. Read-only tool `simulate_delay` for the AI Copilot and Rovo action `simulate-delay` (manifest + prompt).

**Verified**
- `npx vitest run`: **195 passed** (159 → 195); coverage of `src/` 84.5 %. `npm run build`, `forge lint` clean.
- Dev deployed **v6.7.0**, then **v6.8.0** with the review fixes (minor; no new scopes; What-if and Inventory re-checked live). In Jira (Claude in Chrome): English by default; RU switch on Dashboard, Shipments, Inventory, What-if, drawer, Copilot; choice survives reload. Demo data reloaded so it has `daily_usage`. What-if slider updates live; drawer → What-if preselects SHP-1001 (27 d → 12 d). Copilot in Russian answered a what-if question in AI mode using `simulate_delay`, values verified (1 question ≈ 3 model calls).

**ecc review** (`ecc:typescript-reviewer`, `ecc:react-reviewer`, no critical/high) — fixed: `simulate_delay` with both shipmentId and supplier delayed the whole supplier (shipment now wins), the verifier read "1,50" as 150 (a comma is now only a thousands separator), unbounded supplier-wide tool results (capped at 15 + totals, unknown supplier lists the valid ones), NaN usage looking "safe", stale What-if preselect on later visits, a silent fallback when the preselected shipment is no longer upcoming (notice), lost focus after "Simulate a delay", per-tick slider work (`useDeferredValue`), screen-reader names for the EN/RU buttons and the "no usage" dash, `lang` set before first paint. Deferred: language switch outside the drawer's inert region; 7-day colour threshold not a shared constant; duplicate shipment IDs (prevented by the importer).

**Not verified / open**
- Issue sidebar and column-mapping step in Russian were not opened live; Rovo action not testable (no Rovo).
- Production deployed as **v3.1.0** (commit `07ad3ef`, author-approved 2026-11-03; minor, no new scopes). It has no installations, so week 2 was verified on the development install only; judges get v3.1.0 through the install link.

## Roadmap week 1 — Forge LLM: AI column mapping and AI Copilot (2026-11-03)

**Decision:** D15/D16 (supersede D9). Model `claude-haiku-4-5-20251001` (listed ACTIVE on the Forge LLM models page on 2026-11-03; its earliest retirement date, 2026-10-15, has passed — keep an eye on the page). `llm` module added: major version upgrade, approved on **development only**.

**Built**
- `src/llm/` — `LlmPort` (mockable) and `ForgeLlm` (`@forge/llm` `chat`, temperature 0, ≤ 1,200 output tokens, usage logged per call). Budget: 150 calls/day app-wide, the copilot stops at 120 (30 kept for admin column mapping) and at 40 calls per person; counters fail closed if KVS cannot be read or written.
- **AI column mapping** — `src/domain/column-mapping.ts` (schema, name matching, header-only rewrite that follows the parser's quoting), `src/ai/column-mapper.ts` (name match first; otherwise the model gets headers + 3 cleaned, 40-char samples and must answer through a forced `propose_mapping` tool; invented fields, duplicates and bad indexes are dropped), `LogisticsService.importCsvWithMapping`, admin-only resolvers `proposeColumnMapping` / `importCsvWithMapping`. CSV parser accepts comma, semicolon (Excel) and tab (cells pasted from Excel). UI: mapping table with first values, file-type switch, required-field check, type warnings; new **"Paste rows copied from Excel"** box. Fixture `tests/fixtures/supplier-export-messy.csv`.
- **AI Copilot** — `src/copilot/llm-copilot.ts`: the model may call only the four read-only agent actions (same DTOs as Rovo, CSV text under `importedText`) and must answer through `submit_answer`; ≤ 4 model calls and a 14 s deadline per question; every ID, number and date in the answer must come from structured tool fields of this request (never CSV free text or the question); one correction round names the rejected value; otherwise the rule-based answer is shown with `fallbackReason`. UI notice explains AI mode, verification and that reasoning is not verified.

**Verified**
- `npx vitest run`: **159 passed** (110 → 159), coverage 83 % statements. `npm run build` and `forge lint` clean.
- Dev environment v6.0.0 → v6.6.0 (Runs on Atlassian eligible), installed on `utkirovm3.atlassian.net`. In Jira (Claude in Chrome):
  - Copilot "Why is SHP-1004 a problem and what should I do?" and "Which delays hurt stock the most?" → AI answers with cited, verified IDs; "Where is SHP-9999?" → AI says no such shipment, nothing invented; footer "mode: AI (Forge LLM), IDs and numbers verified".
  - Messy supplier export pasted into the new box → AI mapped all 13 columns correctly (Notes column with an injected instruction ignored) → admin confirmed → 3 of 4 rows imported, line 5 rejected ("abc" is not a whole number). Demo data reloaded afterwards.
- Live findings fixed: empty assistant text blocks are rejected by the API (HTTP 400); the verifier caught a computed number (140 − 50) → added a correction round; tool-call arguments must be sent back as JSON strings although the SDK types say object.
- **LLM usage on 2026-11-03 (dev):** 23 calls (21 OK, 2 HTTP 400 from the bugs above), 45.3 k input + 5.0 k output tokens ≈ **$0.07** at Haiku list prices ($1 / $5 per M tokens; Forge's own price may differ). A Copilot question takes 3–4 calls (≈ 1–1.5 ¢), a column mapping 1 call.

**ecc review** (`ecc:typescript-reviewer`, `ecc:security-reviewer`) — fixed: fail-open budget and single shared cap, CSV free text / question numbers counting as evidence, too-broad ID pattern, missing date whitelist (today), truncated tool results counted as evidence, no deadline / `finish_reason: length` handling, header rewrite vs. parser quoting (stray quote, leading blank lines), pending mapping keyed by filename, one failing file hiding the others, silent mapping errors, `as Prompt` cast hiding a type mismatch, untrimmed log text.

**Open / not verified**
- File-picker upload of the messy CSV was not driven in the browser (cross-origin Forge iframe; native file dialog); the same server path was verified through the paste box and by tests.
- Verification checks values, not reasoning: an AI recommendation once concluded "projected 140 will be below safety stock 50" from correct numbers. The UI says so; consider a deterministic check of comparisons later.
- Usage counters are best effort (no atomic increment in KVS): parallel calls can overshoot a cap by a few.
- Production deployed as **v3.0.0** (commit `5f086ea`, author-approved 2026-11-03; major version for the `llm` module, Runs on Atlassian eligible). It has no installations yet, so the AI features were verified on the development install only; judges get v3.0.0 through the install link.

## Phase 5 — Rovo agent

**Codegeist rules (read 2026-11-03 in the user's browser):** submissions until **2026-12-22 12:00 PT**; video < 5 min (judges watch 3), public on YouTube; judge install link; English. Bonus "Best Agents – Rovo/Assignable agents": a Forge app using `rovo:agent`, `rovo:agentConnector`, or reusable `rovo:skill`/`rovo:action`. Judging: Technological implementation, Design, Potential impact, Innovation, Presentation (equal weight).

**Built**
- `rovo:agent` **LogiMind** with instructions in `static/agent/prompt.txt`: data-only answers, cited IDs, Facts / Interpretation / Next steps / Unknowns, no predictions, read-only (never claims writes), CSV text and IDs treated as opaque data, stale-data warning.
- Four `action` modules, all `actionVerb: GET`, backed by the copilot toolbox (one storage read per call): `get-risk-summary` (severity / riskType / limit), `get-shipment`, `get-inventory`, `get-linked-jira-issue`.
- `src/agent/actions.ts`: LLM inputs validated (ID regexes, enums, clamped limit); unknown IDs → `found:false` + "do not guess"; failures → explicit "data unavailable"; trimmed DTOs (no unit cost), CSV text only under `importedText` and cleaned (control, zero-width, bidi, 100 chars); risk IDs cleaned; a linked issue is named only if the user can see it.
- Import now restricts warehouse names (they appear inside risk IDs) to letters, digits and basic punctuation.

**Verified**
- `npx vitest run`: **84 passed** (+ agent actions 10, importer +1).
- `forge lint`: no issues; deployed v5.7.0 → v5.8.0 (still eligible for Runs on Atlassian).
- Atlassian Administration (read-only check): Rovo access allows all apps, but Agent Studio offers **no site** ("No options") and Jira shows no Rovo entry point → Rovo is not provisioned on `utkirovm3.atlassian.net` (Free plan). **The agent could not be tested in Rovo chat.**

**ecc review** (`ecc:security-reviewer`) — fixed: warehouse text inside risk IDs reaching the model unsanitised, zero-width/bidi characters, echoing model-supplied risk IDs, issue keys of hidden issues, no way to list low-stock SKUs (added `riskType`), prompt gaps (stale data, opaque IDs, never claim writes).

**Open**
- Live Rovo verification needs a Rovo-enabled site (e.g. a Jira Standard/Premium trial on the dev site, or another Atlassian developer site with Rovo). Decision for the user.
- Logistics data is app-wide: any user who can use the agent or open the page can read it (documented, by design for this app).

## Phase 4 — Logistics Copilot

**Decision (user, 2026-11-03):** Forge LLMs are billed to the app developer with no free quota (~$0.005/question on Haiku 4.5, ~$0.02 on Sonnet). The user chose **"no LLM for now"**. The copilot is therefore built so a model can be plugged in later, and today runs honestly labelled as *rule-based, no AI*.

**Built**
- `src/copilot/tools.ts` — read-only `CopilotToolbox`: `getRiskSummary`, `getShipment`, `getInventory`, `getLinkedJiraIssue`, `getDataFreshness`, `listKnownIds`. Same tools planned for the Rovo agent actions.
- `src/copilot/rule-based-copilot.ts` — recognises known shipment IDs / SKUs (only IDs present in the data) or summary questions (EN/RU keywords); IDs that look real but do not exist are reported as unknown, never answered.
- `src/copilot/recommendations.ts` — deterministic, evidence-cited next steps: contact supplier/carrier (late), check dependent orders (ETA slip), request ETA (missing), prioritise inbound, transfer only from a warehouse that stays above its own safety stock, replenish.
- Answer contract: verified facts with cited IDs, recommendations (priority, evidence, confidence), unknowns (missing ETA/carrier/inventory/unit cost, stale or missing imports), data freshness, `mode: 'rules'`.
- Copilot tab with example questions; resolver `askCopilot` (≤500 chars).

**Verified**
- `npx vitest run`: **71 passed** (+ copilot 8, run against the real demo dataset).
- In Jira: "Status of SHP-1004" (facts, SCRUM-5 link + status, destination stock-out, recommendations), "Where is SHP-9999?" (nothing invented, reported as unknown), a Russian-language summary request (summary + top risks; Russian keywords are still accepted as input, the UI is English-only).

**ecc review** (`ecc:code-reviewer`) — fixed: ~10 storage snapshots and one Jira call per risk per question (now one snapshot + one link lookup via a request-scoped toolbox), transfer suggestions over-promising across donors and hiding the remaining gap, substring ID matches (`SKU-1` in `SKU-1-BLUE`), shipment questions ignoring SKUs, silent truncation to 3 records / top 5 risks, pruned import history reported as "no data", dropped Jira status errors, unclamped `limit`, case-sensitive IDs. Re-verified in Jira on v5.6.0 ("Stock of SKU-10" → transfer exactly 100 units). Tests: **74 passed**.
- Deferred to Phase 5 (Rovo): tools return free-text CSV fields verbatim; Rovo actions must return trimmed DTOs and mark free text as untrusted data.

**Limitations**
- No natural-language understanding beyond IDs and summary keywords; answers are in English.
- To enable AI later: add the `llm` module (major version upgrade), a Forge LLM provider that may only call the same tools, and validate every cited ID against the data before showing an answer.

## Phase 3 — Jira integration

**Built**
- Settings (admin only): target project + issue type, validated against the admin's Jira access; only standard-level types (no Epics/sub-tasks); localized Task default (`Task|Задача|vazifa`).
- "Create Jira issue" on Risk Center cards and in the shipment drawer, with an inline confirmation naming the project. Created **as the clicking user** (`POST /rest/api/3/issue`), so Jira's own create permission applies.
- Issue content from a fixed ADF template (no markup from CSV): `[Severity] risk title`, evidence list, risk ID, rule version; labels `logimind`, `logimind-<risk-type>`, `logimind-risk-<hash>` (per-risk, searchable).
- Duplicate prevention: token-owned per-risk KVS lock + one link record per risk; existing issue (visible or hidden) blocks a new one; re-create only if the linked issue was deleted (404). Link save retried 3×; on failure the user gets the created key instead of a silent orphan.
- Live key + status by **issue ID** (`POST /rest/api/3/search/jql`, `id in (…)`), so moved/renamed issues stay linked. Fresh issues show "just created" while Jira indexes them.
- `jira:issueContext` sidebar on every issue: the source risk (still active or resolved in current data) and the shipment facts; matched by the server-side issue ID.
- Error mapping for 400/401/403/404/429 into actionable messages; viewers never receive `createdBy` account IDs.
- Scopes: `storage:app`, `read:jira-work`, `write:jira-work`.

**Verified**
- `npx vitest run`: **63 passed** (+ `issue-service` 11, `jira-issue` 4).
- Build, `forge lint` (one expected major-version approval for `write:jira-work`), deploys v5.0.0 → v5.2.0, `forge install --upgrade`.
- In Jira (user's Chrome): saved SCRUM / Задача; created **SCRUM-5** from `LATE_SHIPMENT:SHP-1004`; issue has correct summary, ADF evidence and labels; Risk Center shows `SCRUM-5 · К выполнению`; SCRUM-5 sidebar shows the risk and shipment; re-checked after the ID-based change.

**Not verified live**
- Clicking create twice / concurrent creates (covered by unit tests; the UI hides the button once linked).
- A user without create permission in SCRUM, and the hidden-duplicate path (needs a second account).

**ecc review** (`ecc:code-reviewer`) — fixed: orphan issue on failed link save, lock errors misreported as busy, lock released by the wrong holder, `createdBy` and hidden issue keys leaking to viewers, links breaking when an issue moves (now by ID), JiraSettings pre-selection bugs, surrogate-pair truncation.

**Commits:** `5c4160b` Phase 3 · (this) review fixes

## Phase 2 — Core application

**Built**
- Domain (`src/domain`, no Forge imports): RFC 4180 CSV parser; importer with row-level validation (IDs, dates, enums, ranges, column count, duplicate rows/columns, 2,000-row and 1 MB limits); deterministic risk engine v1.2.0 (`LATE_SHIPMENT`, `ETA_SLIP`, `MISSING_ETA`, `LOW_STOCK` incl. stock-out); KPIs; date-relative synthetic demo dataset (30 shipments, 12 stock positions).
- Storage: `@forge/kvs` repository behind a `LogisticsRepository` port — base64url keys, batched + bounded-parallel writes, rollback of added keys on failed import, atomic write lock (`FAIL_IF_EXISTS` + 2 min TTL), last 10 import batches with `importedBy` audit.
- Service + resolvers: reads open to page viewers; `importCsv`, `loadDemoData`, `clearData` require Jira **ADMINISTER**, checked server-side via `asUser` `GET /rest/api/3/mypermissions`.
- UI (Custom UI, React): Dashboard, Shipments, Inventory, Risk Center, Import & Settings, Shipment detail drawer. Atlassian design tokens (light/dark), severity as glyph + label, keyboard tabs, focus-trapped drawer, empty/loading/error states.
- Scopes: `storage:app`, `read:jira-work` (permission check only).

**Verified**
- `npx vitest run`: **48 passed** (importer 19, risk engine 19, service 10 with mocked repository).
- `npm run build` (backend typecheck + UI typecheck + Vite build): pass. `forge lint`: no issues.
- Deployed v3.0.0 and v4.0.0 to development; `forge install --upgrade` on `utkirovm3.atlassian.net`.
- In Jira (user's Chrome): empty state → Load demo data → dashboard KPIs (21 open, 6 late, 38% on time, 4/12 SKUs at risk); Shipments table + drawer (SHP-1004); Inventory; Risk Center; Import & Settings with admin check passing; demo re-import recorded in history.

**Not verified in the browser**
- Uploading a real CSV file with invalid rows through the file picker (covered by unit tests, not clicked through).
- Behaviour for a non-admin user (needs a second Jira account).

**ecc reviews** (`ecc:typescript-reviewer`, `ecc:react-reviewer`, `ecc:security-reviewer`) — fixed: missing authorization, concurrent/failed import mixing data, O(n²) risk evaluation, KPI/risk mismatch, stock-out false positive at safety 0, stale-ETA inbound, CSV column shifts and duplicate headers, unbounded numbers, case-sensitive warehouse matching, unsorted batch history, `Math.random` IDs, `useAsync` flicker/memoization, drawer focus return/trap, tabs ARIA, clickable-row a11y, meter labelling, `[object Object]` errors. Deferred items: see `docs/SECURITY_REVIEW.md`.

**Commits:** `f93841e` domain/storage · `9e443e4` UI · (this phase) review fixes

## Phase 1 — Environment and Hello World

**Done (verified by command output)**
- Node.js 22.22.2 → 22.23.4 (`winget upgrade OpenJS.NodeJS.22`); meets the Forge CLI minimum.
- Forge CLI 14.2.0 → 15.0.0. `forge whoami` confirms login.
- App scaffold: `manifest.yml` (`jira:globalPage` + `getHealth` resolver, `nodejs24.x`, no scopes), React + Vite Custom UI in `static/app`.
- `npm run build` (typecheck + Vite build): pass.
- `forge lint`: no issues.
- `forge deploy -e development`: deployed v2.0.0; reported eligible for Runs on Atlassian.
- `forge install` on `utkirovm3.atlassian.net` (Jira, development): complete.

- **In-Jira check (user's Chrome):** Apps → LogiMind (Среда разработки) renders the Custom UI and shows "Backend status: ok · 2026-11-02T17:03:51Z" — the `getHealth` resolver round-trip works.

**Findings for later phases**
- **Rovo appears NOT enabled** on `utkirovm3.atlassian.net`: no Rovo entry in the app switcher and no Rovo/Ask Rovo button in the top bar; `/rovo` is a 404. The site shows a "view plans" upsell, so it is likely on a Free plan. Must be resolved before Phase 5 (site admin action).
- Jira is in dark theme while the Custom UI page renders white — Phase 2 must use Atlassian design tokens / theme support.

**Issues found**
| Issue | Resolution |
|---|---|
| `~/.npmrc` contains placeholder proxy `http://user:password@proxy-url:port`; all npm downloads fail | Not edited; npm commands run with `--proxy=false --https-proxy=false`. User to remove the lines if unintended. |
| `forge` not on PATH inside `cmd /c` | Call `%APPDATA%\npm\forge.cmd` directly. |
| Root `tsconfig.json` `noEmit` broke Forge `ts-loader` bundling | Removed; `typecheck` script passes `--noEmit` itself. |
| `npm audit`: high-severity advisories (e.g. `prosemirror-view` XSS) via `@forge/bridge` transitive deps; `npm audit fix` does not clear them | Deferred to Phase 6 security review. |
| `forge create -y` would accept developer terms on the user's behalf | App files written by hand; user registered the app in the developer console. |

**Commits:** `dcd9936` scaffold · `6bf32eb` app id + bundling fix

**Agents used:** `ecc:planner`, `ecc:architect`, `ecc:docs-lookup` (Phase 0 analysis; docs-lookup had no Context7 access, Forge docs checked via WebFetch).
