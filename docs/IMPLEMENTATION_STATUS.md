# Implementation Status

Last updated: 2026-11-02

| Phase | Status |
|---|---|
| 0 — Documentation and planning | ✅ Done — `docs/PROJECT_PLAN.md` |
| 1 — Environment and Hello World | ✅ Done — verified inside Jira |
| 2 — Core application | ✅ Done — verified inside Jira (dev environment, app v4.0.0) |
| 3 — Jira integration | ✅ Done — verified inside Jira (app v5.2.0) |
| 4–7 | ⏳ Not started |

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
