# Test Report

Last updated: 2026-11-03 (Phase 6). App version under test: **v5.9.0** (Forge development environment, `utkirovm3.atlassian.net`).

## Summary

| Check | Result |
|---|---|
| Unit / component tests (`npx vitest run`) | **110 passed, 0 failed** (10 files) |
| Statement coverage of `src/` (`vitest --coverage`) | **81.1 %** (was 66.6 % before Phase 6). Domain, copilot, agent, auth, lock: 93–100 %. Untested: `index.ts` wiring, `kvs-issue-links.ts` |
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

## Defect found and fixed during QA
- **Shifted-column noise (importer):** a row with an unquoted comma (e.g. `Acme, Inc`) reported the column-count error *plus* three misleading field errors. Now only the cause is reported. Pinned by `fixtures.test.ts` (line 8).

## Manual checks for the user (≈5 minutes)

1. **CSV upload with errors** — Import & Settings → choose `tests/fixtures/shipments-with-errors.csv`. Expected: "2 of 9 shipments rows imported, 7 rejected", with errors on lines 3 (supplier), 4 (planned_arrival), 5 (qty), 6 (status), 7 (duplicate QA-001), 8 (column count), 9 (actual_arrival). *This replaces the shipment data — click **Load demo data** afterwards to restore it.*
2. **Wrong file** — upload `tests/fixtures/not-a-logistics-file.csv`. Expected: "File was not imported. Unrecognised header…", data unchanged.
3. **Phone width** — open LogiMind in Jira on a phone (or a narrow window). Expected: tabs scroll horizontally, KPI tiles stack, tables scroll inside their panel, the shipment drawer fills the width.
4. **Non-admin** *(optional, needs a second account)* — Import & Settings shows the "Only Jira administrators…" note and disabled buttons; Copilot and Risk Center still work.
