# Devpost submission — draft texts

Draft for the author to review and paste. Nothing here has been submitted.

**Project name:** LogiMind for Jira
**Tagline:** Turn logistics chaos into clear action inside Jira.
**Category:** Apps for Specialized Industries
**Bonus prize:** Best Agents – Rovo/Assignable agents *(select only once the agent has been shown working on a Rovo-enabled site — see checklist)*

## Inspiration
Small importers and distributors run purchasing and operations work in Jira, but their shipments and stock live in spreadsheets. Late containers and stock-outs are discovered too late, and nobody can say which delay actually hurts. We wanted the logistics picture — and the follow-up work — in the same place.

## What it does
- **Validated import** of shipment and inventory CSVs: every rejected row is listed with its line and reason; nothing is used silently.
- **Transparent risk engine**: late shipments, ETA slips, missing ETAs and stock-outs, each with its evidence and rule version — a rule-based score, explicitly not a prediction.
- **Dashboard, Shipments, Inventory and Risk Center** inside Jira, in Jira's own light/dark theme.
- **One-click Jira issues** from any risk, created as the user, one per risk, with live status and a LogiMind panel on the issue showing the source shipment.
- **Copilot**: ask "status of SHP-1004" or "today's risk summary" and get cited facts, evidence-based next steps (e.g. transfer exactly the missing units from a warehouse with surplus) and an explicit list of unknowns.
- **Rovo agent "LogiMind"** with four read-only actions so the same answers are available in Rovo chat.

## How we built it
Atlassian Forge (Node 24 runtime) with a React Custom UI global page and issue panel, Forge KVS storage, Jira REST via `requestJira` as the user, and a `rovo:agent` with `action` modules. The logic is a pure, unit-tested TypeScript domain layer (110 tests, 81 % coverage) behind service and storage ports. No external backend, no egress — eligible for Runs on Atlassian.

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
Optional Forge LLM provider behind the same read-only tools, scheduled CSV/API sync, per-project data scopes, and Marketplace listing.

## AI disclosure
- **In the product:** no AI model is called. The Copilot is rule-based. The Rovo agent uses Atlassian Rovo's own model; LogiMind only supplies read-only action results.
- **In development:** the code, tests and documentation were written with the help of an AI coding assistant (Anthropic Claude via Claude Code), directed and reviewed by the author. All features were verified with automated tests and in a live Jira site.

## Third-party services and data
- Atlassian Forge, Jira Cloud REST API, Forge KVS, Atlassian Rovo (platform services).
- Open-source libraries: React, Vite, `@forge/*` SDKs, Vitest (dev).
- No external APIs, no external AI providers, no data leaves Atlassian.
- Demo data is synthetic; supplier and product names are fictional.

## Known limitations
See README "Known limitations" — rule-based copilot, UTC dates, 2,000-row cap, English UI, app-wide data visibility, Rovo agent not exercised live on the author's Free-plan site.

## Bonus write-up (Best Agents)
LogiMind ships a `rovo:agent` with four `action` modules (`actionVerb: GET`): risk summary (filters: severity, risk type), shipment lookup, inventory lookup and linked-Jira-issue lookup. The agent's instructions require data-only, cited answers split into facts / interpretation / next steps / unknowns, forbid predictions and write claims, and treat imported CSV text as untrusted data. Actions validate every model-supplied input, return `found:false` instead of guessing, hide issues the user cannot see, and are the same tools the in-app Copilot uses — so the agent and the app always agree.
