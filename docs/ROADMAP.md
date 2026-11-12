# Roadmap to the Codegeist 2026 deadline (2026-12-22 12:00 PT)

Agreed with the author on 2026-11-03. Goal: a top-3 finish in *Apps for Specialized Industries* plus one bonus prize.

## Why these changes
Judging criteria are equally weighted: Technological implementation, Design, Potential impact, Innovation, Presentation. Current gaps: no real AI, and the app *shows* risks but does not *act* on them. A submission can win at most one grand prize and one bonus.

## Decisions (author-approved)
- **Real AI via Forge LLMs** (`@forge/llm`, Claude Haiku 4.5 by default). Budget: up to about **$10** for the whole hackathon (about $0.005 per call). Adding the `llm` module is a major version upgrade. The rule-based copilot stays as the fallback whenever the LLM is unavailable or fails.
- **AI safety:** the LLM may only call the existing read-only tools. Every ID or number cited in an answer is validated against the data before display; invalid answers fall back to rules. CSV text stays untrusted.
- **Bonus:** keep the Rovo agent. If Rovo is still unavailable on the site, target **Best app with Atlassian MCP** (`rovo:mcp` exposing the same read-only tools) — verify first whether it works without Rovo.

## Plan
| Week | Work |
|---|---|
| 1 | Forge LLM: **AI column mapping for any supplier CSV/Excel** (AI proposes the mapping, the user confirms, the existing validator runs) and an **AI Copilot with tool calling** with cited-ID validation and rule-based fallback |
| 2 | **Days of cover + projected stock-out date** (optional `daily_usage` column, deterministic) and a **what-if delay simulator** (slider, live re-evaluation) |
| 3 | **Closed loop in Jira:** scheduled daily check (`scheduledTrigger`), optional auto-create issues for new critical risks (admin setting), comment "resolved in data" when a risk disappears, daily briefing; AI-drafted supplier follow-up message (copy only, never sent) |
| 4 | Bonus: live Rovo test if Rovo gets enabled, else `rovo:mcp` |
| 5 | Design: inbound timeline, stock chart per SKU, first-run onboarding |
| 6 | Full QA + ecc reviews, production deploy (author approval) |
| 7 | Video around three "wow" moments (messy CSV mapped by AI → what-if slider → Jira issue created automatically), Devpost texts, buffer |

## Progress
| Week | Status (2026-11-03) |
|---|---|
| 1 | ✅ Done — dev v6.6.0, production v3.0.0 |
| 2 | ✅ Done — dev v6.8.0, production v3.1.0: days of cover + projected stock-out, what-if delay simulator (UI, Copilot tool, Rovo action); plus EN/RU language switch (author request) |
| 3 | ✅ Done (2026-11-09) — dev v6.13.0, production v3.2.0 (deployed by the author): daily check (`scheduledTrigger` + admin "Run check now"), daily briefing, auto-create of issues (off by default, max 5/run), one "resolved in data" comment per linked issue, AI supplier follow-up draft (copy only, validated, template fallback), EN/RU |
| 4 | ✅ Done (2026-11-10) — dev v7.2.0: `rovo:mcp` module `logimind-mcp` exposes the same five read-only actions as MCP tools (no code duplication, no new scopes). **Verified live without Rovo:** Claude Code connected to `https://mcp.atlassian.com/forge/<appId>` via Atlassian OAuth and called the tools on utkirovm3 (risk summary, delay simulation, linked issue, invalid-ID refusal). production v4.1.0 (deployed 2026-11-10 with the author's approval) |
| 5 | ✅ Done (2026-11-10) — dev v7.3.0: inbound timeline on the dashboard (planned vs expected, slip and overdue marks, 12 rows), per-SKU stock chart on Inventory (same rules as days of cover, arrivals as jumps, stock-out mark, text summary), before/after chart in What-if, first-run welcome screen and a "Getting started" checklist; EN/RU, dark mode, narrow width. No new scopes. production v4.2.0 (deployed 2026-11-10 with the author's approval) |
| 6 | ✅ Feature added at the author's request (2026-11-11) — dev v7.4.0: **supplier reliability** (on-time rate, usual median delay, grade reliable / watch / unreliable / too little history, from delivered shipments) and a **history-based arrival forecast** (plan + the supplier's usual delay when that is later than the ETA). Shown as a suppliers panel on Shipments (click filters the table), a "likely <date>" line in the ETA cell, a Forecast step and delivery record in the shipment drawer, and an "if late as usual" dashed line on the Inventory stock chart. EN/RU. No new scopes. Also fixes overlapping labels in the shipment drawer's delivery timeline (week-5 CSS leak). production v4.3.0, then v4.4.0 with the same code (both deployed 2026-11-11 with the author's approval). **Full QA done (2026-11-12) — dev v7.7.0:** Rovo/MCP calls log the caller's account ID and are refused without platform account context; one hidden or deleted issue no longer fails a 50-ID status search; issue keys (also in the daily briefing) are shown only when the viewer can see the issue, and a 404 no longer lets a user overwrite a link to an issue hidden from them; role texts updated to owner/managers/viewers. 371 tests, both tsc, forge lint, UI build, ecc reviews, live check on the dev site. Production deploy waits for the author's approval |
| 7 | Not started |

## Presentation story
Persona: a purchasing lead at an auto-parts importer in Tashkent who spends an hour every morning in spreadsheets. Show before/after with concrete numbers from the demo data.

## Working rules
- Small commits, tests first for domain logic, ecc reviewers after each feature, docs updated per feature.
- Ask the author before: production deploys, any spend beyond the LLM budget, publishing anything new.
