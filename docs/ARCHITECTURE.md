# Architecture

LogiMind is a single Forge app (runtime `nodejs24.x`) with no external backend or egress.

## Modules (manifest.yml)

| Module | Purpose |
|---|---|
| `jira:globalPage` `logimind-global-page` | Main Custom UI app (Dashboard, Shipments, Inventory, Risk Center, Copilot, Import & Settings) |
| `jira:issueContext` `logimind-issue-context` | Sidebar on every Jira issue: the LogiMind risk and shipment an issue was created from |
| `rovo:agent` `logimind-agent` | Rovo agent; instructions in `static/agent/prompt.txt` |
| `action` × 4 (`GET`) | `get-risk-summary`, `get-shipment`, `get-inventory`, `get-linked-jira-issue` |
| `function` | `resolver` (UI resolvers) and one handler per agent action |

Both Custom UI modules use one bundle (`static/app/build`); `main.tsx` picks the view from the module key.

## Layers (`src/`)

```
index.ts            resolvers + agent handlers: input checks, admin guard, wiring
agent/actions.ts    Rovo actions → trimmed DTOs, CSV text isolated under importedText
copilot/            CopilotToolbox (read-only, one snapshot per request), RuleBasedCopilot, recommendations
services/           LogisticsService (import, views), IssueService (Jira issues, links)
domain/             pure: CSV parser, importer/validation, risk engine, KPIs, demo data, issue template
storage/            ports + Forge KVS adapters (base64url keys, batched writes, rollback, token-owned locks)
jira/               JiraGateway port + Forge adapter (requestJira asUser, error mapping)
auth/access.ts      Jira ADMINISTER check via /rest/api/3/mypermissions (asUser)
shared/api.ts       resolver contract shared with the UI (types only)
```

Domain code has no Forge imports and is unit-tested directly; services are tested against mocked ports (London school); adapters are tested with mocked `@forge/kvs` / `@forge/api`.

## Data (Forge KVS, app-level)

| Key prefix | Value |
|---|---|
| `shp:<b64 id>` | Shipment |
| `inv:<b64 sku>.<b64 warehouse>` | Inventory item |
| `batch:<timestamp>.<uuid>` | Import batch (last 10, with `importedBy`) |
| `cfg:jira` | Target project / issue type |
| `lnk:<b64 riskId>` | Risk → Jira issue link (issue ID is the stable reference) |
| `lock:write`, `lnklock:<b64 riskId>` | Token-owned locks with TTL |

Risks are **not stored**: they are recomputed deterministically from the data on every read (rule version `1.2.0`), so they never go stale.

## Key flows

- **Import** (admin): parse → validate per row → write new keys (bounded-parallel batches) → delete stale keys; on failure, roll back added keys. Serialised by a write lock.
- **Create issue** (any user, Jira permission applies): config + active risk → per-risk lock → existing link check (`exists`/`hidden`/`missing`) → `POST /rest/api/3/issue` as user → save link (retried).
- **Status**: `POST /rest/api/3/search/jql` with `id in (…)` as the viewer → current key + status.
- **Copilot / agent**: one data snapshot per request → read-only tools → cited, structured answer.
