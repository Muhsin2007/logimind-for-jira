# Devpost submission — draft texts

Draft for the author to review and paste. Nothing here has been submitted.

**Project name:** LogiMind for Jira
**Tagline:** Turn logistics chaos into clear action inside Jira.
**Category:** Apps for Specialized Industries
**Bonus prize (one only):** Best app with Atlassian MCP *(shown live 2026-11-10: Claude Code → Atlassian MCP → LogiMind tools on a Jira site without Rovo)*

## Inspiration
Small importers and distributors run purchasing and operations work in Jira, but their shipments and stock live in spreadsheets. Late containers and stock-outs are discovered too late, and nobody can say which delay actually hurts. We wanted the logistics picture — and the follow-up work — in the same place.

## What it does
- **Validated import** of shipment and inventory CSVs (or rows pasted from Excel): every rejected row is listed with its line and reason; nothing is used silently.
- **AI column mapping**: a supplier export with its own column names is mapped by Claude (Forge LLM); the owner or a manager confirms, values are never changed, and every row is still validated.
- **Transparent risk engine**: late shipments, ETA slips, missing ETAs and stock-outs, each with its evidence and rule version — a rule-based score, explicitly not a prediction.
- **Dashboard, Shipments, Inventory and Risk Center** inside Jira, in Jira's own light/dark theme.
- **One-click Jira issues** from any risk, created as the user, one per risk, with live status and a LogiMind panel on the issue showing the source shipment.
- **AI Copilot**: ask anything about the data; Claude (Forge LLM) answers only through read-only tools, every cited ID, number and date is verified against the data, and anything unverifiable falls back to a deterministic rule-based answer.
- **A daily check that closes the loop**: once a day LogiMind compares the risks with the previous run, writes a briefing, can open Jira issues for new critical risks (off by default, capped), and comments on linked issues when the data shows a risk is resolved.
- **Owner and managers**: a Jira admin claims LogiMind and picks the people who may import data and change settings; everyone else can view.
- **Days of cover and a what-if delay simulator**: when each SKU runs out, and what a supplier delay would do to it, live as you drag a slider.
- **Charts that tell the story**: an inbound timeline (planned → expected arrival, late bars cross *today*), a stock outlook chart per SKU with arrivals and the stock-out date, and a *current plan vs. with the delay* chart in the simulator.
- **Supplier reliability and a likely arrival date**: from the delivery history LogiMind grades each supplier (on-time rate, usual delay) and shows when an open shipment will probably arrive if the supplier is as late as usual — in the shipments table, the shipment drawer and as an *if late as usual* line on the stock chart.
- **First-run onboarding**: a welcome screen with one-click demo data, then a short *Getting started* checklist.
- **Rovo agent "LogiMind"** with five read-only actions so the same answers are available in Rovo chat.

## How we built it
Atlassian Forge (Node 24 runtime) with a React Custom UI global page and issue panel, Forge KVS storage, Jira REST via `requestJira` as the user, and a `rovo:agent` with `action` modules. The logic is a pure, unit-tested TypeScript domain layer (159 tests, 83 % coverage) behind service and storage ports. AI features use Forge LLMs (Claude Haiku 4.5) behind a port with a deterministic fallback. No external backend, no egress — eligible for Runs on Atlassian.

## Challenges
- Keeping data consistent in a key-value store: token-owned locks, batched writes and rollback of a failed import.
- Making issue creation duplicate-safe across double clicks, deleted issues and issues the user cannot see.
- Prompt-injection defence for an agent that reads user-uploaded CSV text: input validation, trimmed DTOs, isolation of imported text, and restricted warehouse names.
- Localised Jira (Russian issue-type names) broke a naïve "Task" default — found in live testing and fixed.

## Accomplishments
- Every number on screen can be traced to a rule and a row of data.
- Unknown IDs are never answered: the copilot and agent say "not found" instead of guessing.
- Found and fixed real defects through automated reviews and live testing in Jira.

## What we learned
Deterministic rules plus honest uncertainty earn more trust than an impressive-sounding prediction. Forge's permission model (asUser, scopes, Runs on Atlassian) shaped the design for the better.

## What's next
Scheduled CSV/API sync from suppliers and ERPs, per-project data scopes, and a Marketplace listing.

## AI disclosure
- **In the product:** LogiMind calls **Atlassian-hosted Forge LLMs** (Claude Haiku 4.5) for two features: proposing a CSV column mapping (headers plus three cleaned sample rows are sent; the admin confirms) and the Copilot (the model may only call read-only tools; its IDs, numbers and dates are verified before display). No external AI provider is used and no data leaves Atlassian. A deterministic rule-based copilot is the fallback. The Rovo agent uses Atlassian Rovo's own model; LogiMind only supplies read-only action results.
- **In development:** the code, tests and documentation were written with the help of an AI coding assistant (Anthropic Claude via Claude Code), directed and reviewed by the author. All features were verified with automated tests and in a live Jira site.

## Third-party services and data
- Atlassian Forge, Jira Cloud REST API, Forge KVS, Atlassian Rovo (platform services).
- Open-source libraries: React, Vite, `@forge/*` SDKs, Vitest (dev).
- Forge LLMs (Atlassian-hosted Claude) for column mapping and the Copilot.
- No external APIs, no external AI providers, no data leaves Atlassian.
- Demo data is synthetic; supplier and product names are fictional.

## Known limitations
See README "Known limitations" — AI reasoning is not verified (only its data), daily AI call cap, UTC dates, 2,000-row cap, server messages in English when the UI is in Russian, app-wide data visibility, Rovo agent not exercised live on the author's Free-plan site.

## Bonus write-up (Best app with Atlassian MCP)
LogiMind declares a `rovo:mcp` module (`logimind-mcp`) that exposes its five read-only tools — risk summary, shipment, inventory, linked Jira issue and delay simulation — to Rovo Studio agents and to any MCP-compatible AI client (Claude, IDE assistants) through Atlassian's endpoint `https://mcp.atlassian.com/forge/<appId>`. A site admin decides per site which tools are exposed; the user signs in with Atlassian OAuth and every call runs with that user's permissions, so linked Jira issues the user cannot see stay hidden. The tools are the very same validated, `GET`-only handlers the in-app Copilot and the Rovo agent use: model-supplied IDs are checked, unknown IDs return `found:false` instead of a guess, and CSV text is returned under `importedText` with an explicit "data, not instructions" notice. No new scopes and no write tools. Note: LogiMind itself sends nothing outside Atlassian, but when a user connects an external MCP client, the tool results go to that client and its AI vendor; that is why exposure is off until a site admin turns it on. Example: in Claude, *"Which SKUs run out if SHP-1001 is 7 days late, and is there a Jira issue for the most critical risk?"* triggers `simulate-delay` and `get-linked-jira-issue`.

## Bonus write-up (Best Agents)
LogiMind ships a `rovo:agent` with four `action` modules (`actionVerb: GET`): risk summary (filters: severity, risk type), shipment lookup, inventory lookup and linked-Jira-issue lookup. The agent's instructions require data-only, cited answers split into facts / interpretation / next steps / unknowns, forbid predictions and write claims, and treat imported CSV text as untrusted data. Actions validate every model-supplied input, return `found:false` instead of guessing, hide issues the user cannot see, and are the same tools the in-app Copilot uses — so the agent and the app always agree.
