# Decisions

| # | Date | Decision | Why |
|---|---|---|---|
| D1 | 2026-11-02 | Forge only — no Spring Boot, PostgreSQL or external hosting (the RU guide's stack) | The RU guide was written for a different hackathon; Codegeist requires Forge, and Runs on Atlassian keeps data in Atlassian |
| D2 | 2026-11-02 | Rovo guide is primary; RU guide used only for domain rules, CSV format and AI safety rules | Conflict resolution recorded in PROJECT_PLAN.md |
| D3 | 2026-11-02 | Node 22 minor upgrade (22.22.2 → 22.23.4) instead of Node 24 | Meets the Forge CLI minimum without disturbing other global tools |
| D4 | 2026-11-02 | App files written by hand; the user registered the app and accepted Atlassian's terms | Accepting terms is the user's action |
| D5 | 2026-11-02 | Deterministic, versioned risk rules; risks recomputed on read | Explainable, testable, never stale; honest "rule-based, not a prediction" |
| D6 | 2026-11-02 | `@forge/kvs` behind a repository port; 2,000-row import cap | Recommended storage; keeps every resolver response well inside Forge limits |
| D7 | 2026-11-02 | Data-changing actions require Jira ADMINISTER (server-side, asUser) | Data is site-wide; any viewer could otherwise wipe or replace it |
| D8 | 2026-11-02 | Issues created asUser from a fixed ADF template; one per risk; status by issue ID | Jira permissions apply; no markup injection; links survive issue moves |
| D9 | 2026-11-03 | No AI provider (user declined paid Forge LLMs); Copilot runs in rule-based mode, clearly labelled | Forge LLMs are billed to the developer with no free quota |
| D10 | 2026-11-03 | Rovo agent with read-only `GET` actions over the same toolbox; CSV text isolated as untrusted | Bonus eligibility with minimal risk; prompt-injection defence |
| D11 | 2026-11-03 | Live Rovo verification deferred; QA continued | Rovo/Agent Studio not provisioned on the Free-plan developer site; enabling a paid trial is the user's decision |
| D13 | 2026-11-03 | Keep the author's e-mail in commit history when publishing | Author's choice after the pre-publication scan flagged it |
| D12 | 2026-11-03 | MIT license | Codegeist asks for an open-source license; MIT is the simplest permissive choice (author may change it) |
