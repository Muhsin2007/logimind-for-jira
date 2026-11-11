# LogiMind for Jira

> Turn logistics chaos into clear action inside Jira.

LogiMind is an [Atlassian Forge](https://developer.atlassian.com/platform/forge/) app for importers, distributors and operations teams who track shipments and stock in spreadsheets but run their work in Jira. Upload a shipments CSV and an inventory CSV; LogiMind validates every row, finds late shipments, slipping ETAs, missing ETAs and stock-outs with transparent rules, and lets the team turn any risk into a tracked Jira issue in one click. A Copilot tab and a **Rovo agent** answer questions like *"what is at risk today?"* or *"status of SHP-1004?"* strictly from that data.

Built for **Codegeist 2026** — category *Apps for Specialized Industries*, bonus *Best Agents (Rovo)*.

## Features

| | |
|---|---|
| **Validated CSV import** | Shipments and inventory files (comma, semicolon or tab separated, as exported or copied from Excel), detected by header. Row-level errors (bad dates, unknown status, duplicates, shifted columns, out-of-range numbers) are listed by line — invalid rows are never used silently. Admin-only, with an import history. |
| **AI column mapping** | A supplier file with its own column names ("Shipment #", "Vendor", "Expected Date"…) gets a mapping proposed by Claude (Atlassian-hosted Forge LLM) from the headers and the first three rows. The admin checks and edits it; only the header is mapped, values are never changed, and every row is still validated. |
| **Deterministic risk engine** | `LATE_SHIPMENT`, `ETA_SLIP`, `MISSING_ETA`, `LOW_STOCK` (incl. stock-out). Every risk carries its evidence and rule version. It is a *rule-based* score, not a prediction. |
| **Days of cover** | Optional `daily_usage` column: each stock position shows how many days it lasts and the projected stock-out date, counting every open inbound shipment on its expected arrival date. A deterministic projection, shown on Inventory and in the shipment drawer. |
| **What-if delay simulator** | Pick a shipment (or all upcoming shipments of a supplier) and drag a 0–30 day slider: see live which SKUs/warehouses would go below safety stock or run out, and when, compared with today. Read-only; also available to the AI Copilot and the Rovo agent. |
| **English / Russian** | Compact EN / RU switch in the app header (English by default, remembered per person). The AI Copilot answers in the chosen language. |
| **Dashboard & screens** | KPIs (late shipments, on-time rate, SKUs below safety stock, value at risk), Shipments, Inventory, Risk Center, shipment drawer. Follows Jira's light/dark theme. |
| **Supplier reliability & likely arrival** | From delivered shipments: each supplier's on-time rate, usual (median) delay and a grade (reliable / watch / unreliable; at least 3 deliveries). Open shipments get a **likely arrival date** = planned date + the supplier's usual delay when that is later than the ETA — shown in the Shipments table (a suppliers panel filters it), the shipment drawer, and as an *if late as usual* line on the Inventory stock chart. Deterministic, not a prediction model. |
| **Charts & first run** | An **inbound timeline** on the Dashboard (each open shipment from planned to expected arrival; overdue bars cross the today line; a row opens the shipment). A **stock outlook chart** per SKU and warehouse on Inventory (projected units, safety stock, arrivals, stock-out date), and a *current plan vs. with the delay* chart in the what-if simulator. An empty site opens on a **welcome screen** with one-click demo data, then a short *Getting started* checklist (remembered per person, can be hidden). Charts have text summaries for screen readers. |
| **Jira integration** | "Create Jira issue" from any risk, created **as the user** in an admin-chosen project. One issue per risk (duplicate-safe), live status, and a **LogiMind panel on the Jira issue** showing the source shipment. |
| **AI Copilot** | Free-form questions ("which delays hurt stock the most?") answered by Claude (Forge LLM) that may only call LogiMind's read-only tools. Every ID, number and date in the answer is checked against the data; an unverifiable answer, a model error or an unavailable model falls back to the deterministic rule-based copilot, and the answer says so. Facts with cited IDs, next steps, and an explicit list of unknowns. |
| **Rovo agent** | `LogiMind` agent with five read-only actions (risk summary, shipment, inventory, linked Jira issue, delay simulation). Imported text is isolated and treated as untrusted data. |
| **Atlassian MCP** | The same five read-only tools as an MCP server (`rovo:mcp`, Preview) for Rovo Studio agents and MCP clients such as Claude, at `https://mcp.atlassian.com/forge/0c416234-e118-4454-907e-04c39eaa2c70`. A site admin turns the tools on in Administration → Apps → Sites → Connected apps → LogiMind → Tools; users sign in with Atlassian OAuth and calls run with their own Jira permissions. |

Data never leaves Atlassian: the app runs on Forge with Forge Storage and is eligible for **Runs on Atlassian**.

## Architecture

```
Jira ── Custom UI (React) ──invoke──► Forge resolvers ─┐
     └─ Issue panel (Custom UI) ───────────────────────┤
Rovo ── LogiMind agent ──actions (GET)─────────────────┤
                                                      ▼
   LogisticsService · IssueService · LlmCopilot (→ RuleBasedCopilot) · ColumnMapper
                 │                 │               │
                 │                 │        Forge LLM (Claude Haiku, Atlassian-hosted)
        domain/ (CSV, rules,   Jira REST (asUser):
        KPIs — pure, tested)   permissions, create issue, status
                 │
           Forge KVS (app storage)
```

Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · decisions: [docs/DECISIONS.md](docs/DECISIONS.md).

## Install (judges / evaluators)

1. Open the **[installation link](https://developer.atlassian.com/console/install/0c416234-e118-4454-907e-04c39eaa2c70?signature=AYABeOdM00yEjZpC8sLuuaXTfPsAAAADAAdhd3Mta21zAEthcm46YXdzOmttczp1cy13ZXN0LTI6NzA5NTg3ODM1MjQzOmtleS83MDVlZDY3MC1mNTdjLTQxYjUtOWY5Yi1lM2YyZGNjMTQ2ZTcAuAECAQB4CxqLTo9l4lqXuFjNim1xJM%2Bp%2F3TVP9xHS2BrU5DRRucBFTBtVY8D0sqSbd3OiGRhlQAAAH4wfAYJKoZIhvcNAQcGoG8wbQIBADBoBgkqhkiG9w0BBwEwHgYJYIZIAWUDBAEuMBEEDFXtRhtBLq0qyj1MVgIBEIA7SBZteGCe4%2BGOfU7xmVCQXaCMCAaBvmSGKjnnR%2FWuTfXpagTlQw9gWkuyk2cR2xB%2FoTisEyWiDIENJFwAB2F3cy1rbXMAS2Fybjphd3M6a21zOmV1LXdlc3QtMTo3MDk1ODc4MzUyNDM6a2V5LzQ2MzBjZTZiLTAwYzMtNGRlMi04NzdiLTYyN2UyMDYwZTVjYwC4AQICAHi9bVMAkme4qVQX1fQHo6ePw3H40A7cGfz7yrmSfBWMXgGYSYl9W1%2Frqe3VC8SlBgR%2BAAAAfjB8BgkqhkiG9w0BBwagbzBtAgEAMGgGCSqGSIb3DQEHATAeBglghkgBZQMEAS4wEQQMt4rZ9mPNuBJfjshHAgEQgDutfvDrbH%2F5TsBedEv7PZiuUsLfXca%2Fc4t8GTKe0R%2FemhKhbBhA2kcVphIwp%2BQv8%2FZstKyeQzVIDIRixwAHYXdzLWttcwBLYXJuOmF3czprbXM6dXMtZWFzdC0xOjcwOTU4NzgzNTI0MzprZXkvNmMxMjBiYTAtNGNkNS00OTg1LWI4MmUtNDBhMDQ5NTJjYzU3ALgBAgIAeDYASx0XCjkny4iLV6vz%2BKtEGSGT6kdt0QRpkn6D%2FlVEATMx3FzfyiMWBs7ZFYKsMNwAAAB%2BMHwGCSqGSIb3DQEHBqBvMG0CAQAwaAYJKoZIhvcNAQcBMB4GCWCGSAFlAwQBLjARBAwQ2z5vU1X%2FGj1t8c8CARCAOwCnBQZ0Q4RNCWrwFlVgUfiH%2Bt98gI5084XJY0MEKoGpTPiTvkohT5L6ne4HjeLUbz18FvKTz8ao6bWxAgAAAAAMAAAQAAAAAAAAAAAAAAAAAEPXtc0c4sUZwWYFqdjTboj%2F%2F%2F%2F%2FAAAAAQAAAAAAAAAAAAAAAQAAADIL72U29emarWsfE%2FZ2U9RPKC7EqoFhrPKFlFnppV6xiJAUSkDw7yS9FQfeLnJ1Bjayv0lTgDwKqPb4gX41w6WvEvg%3D&product=jira)** and install LogiMind on your Jira Cloud site (Rovo-enabled site recommended for the agent). You need to be a site admin.
2. In Jira, open **Apps → LogiMind**. Approve access if prompted ("Allow access" — needed for permission checks and issue creation as you).
3. As a **Jira administrator**, go to **Import & Settings → Load demo data** (30 shipments, 12 stock positions with dates relative to today).
4. In **Import & Settings → Jira integration**, choose a project and issue type for risk issues.
5. Explore **Dashboard → Risk Center → Create Jira issue**, open the created issue to see the LogiMind panel, and try the **Copilot** examples.
6. Rovo: open Rovo chat, pick the **LogiMind** agent and try *"Give me today's logistics risk summary"*.

CSV formats are shown in the app; sample files with deliberate errors are in [`tests/fixtures/`](tests/fixtures/).

## Development

Requires Node.js ≥ 22.23 and the Forge CLI (`npm i -g @forge/cli`).

```bash
npm install && npm --prefix static/app install
npm test                 # 110 unit tests (vitest)
npm run build            # type-check backend + build Custom UI
forge lint
forge deploy -e development
forge install --site <your-site>.atlassian.net --product jira -e development
```

Project layout: `src/domain` (pure logic), `src/services`, `src/storage` (Forge KVS), `src/jira` (Jira REST), `src/copilot`, `src/agent` (Rovo actions), `static/app` (React UI), `static/agent/prompt.txt` (agent instructions), `tests/`.

## Permissions (scopes)

| Scope | Why |
|---|---|
| `storage:app` | Store imported shipments, inventory, import history and issue links |
| `read:jira-work` | Admin check (`mypermissions`), project / issue-type lists, live issue status |
| `write:jira-work` | Create an issue from a risk, as the clicking user |

The `llm` module uses Atlassian-hosted Forge LLMs (Claude). No external egress and no external AI provider: data stays in Atlassian.

## Known limitations

- The AI checks IDs, numbers and dates, not reasoning: a suggestion can still draw a wrong conclusion from correct values, so the UI asks users to review it. Answers that compute new numbers are rejected and fall back to rules.
- AI usage is capped per site per day (150 model calls; the Copilot stops at 120 and at 40 per person, keeping the rest for admins' column mapping); above that the rule-based copilot and name-only column matching are used.
- "Today" is evaluated in UTC; up to 2,000 rows per CSV file.
- In Russian, import validation messages, rule-based copilot answers and Jira issue text stay in English (the AI Copilot answers in Russian).
- Days of cover and the what-if simulator use an average daily usage from the file: they are projections, not forecasts, and do not create risks.
- The Rovo agent requires Rovo on the site; it could not be exercised live on the author's Free-plan developer site (see [docs/TEST_REPORT.md](docs/TEST_REPORT.md)).
- Logistics data is app-wide on a site: anyone who can open LogiMind or use the agent can read it; only the LogiMind owner and managers (or Jira administrators, until an owner is set) can change it.

## Docs

[Project plan](docs/PROJECT_PLAN.md) · [Implementation status](docs/IMPLEMENTATION_STATUS.md) · [Test report](docs/TEST_REPORT.md) · [Security review](docs/SECURITY_REVIEW.md) · [Devpost checklist](docs/DEVPOST_CHECKLIST.md)

## Privacy, terms and support

- Privacy policy: [PRIVACY.md](PRIVACY.md)
- Terms: provided under the [MIT License](LICENSE), "as is", without warranty.
- Support: [GitHub issues](https://github.com/Muhsin2007/logimind-for-jira/issues)

## License

[MIT](LICENSE)
