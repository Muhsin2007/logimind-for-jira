# Security Review

Last updated: 2026-11-03 (Roadmap week 1, Forge LLM). Reviewer: `ecc:security-reviewer`, plus `ecc:typescript-reviewer` and `ecc:react-reviewer` for related correctness issues.

## Threat model
- Any Jira user who can open the LogiMind global page can call its resolvers.
- Imported CSV content is untrusted and stored in app-level Forge KVS, shared across the site.
- Jira issue creation (`asUser`) and a Rovo agent read this data, so CSV text reaches an LLM.
- Since week 1 the app itself calls Atlassian-hosted Forge LLMs (`llm` module): uploaded headers and three sample rows (column mapping, admins only) and read-only tool results (Copilot, any page viewer). The model has no write tools, and its output is shown as plain React text.

## Findings and status

| # | Severity | Finding | Status |
|---|---|---|---|
| 1 | High | Import / demo load / delete open to every user | **Fixed** — server-side check before every write; since the roles change (#32–#38) this is `RoleService.requireDataManager` (owner / manager, or Jira `ADMINISTER` while no owner is set); UI disables the controls for viewers |
| 2 | High | Prompt-injection surface: CSV free text (supplier, product, carrier…) reaches the Rovo agent and the Forge LLM | **Mitigated** — structured DTOs, free text cleaned and isolated under `importedText`, read-only tools only, issue text from templates; AI answers are verified against structured fields only (week 1, #24–#26) |
| 3 | Medium | Unbounded full scans / O(n²) per read; concurrent imports racing | **Fixed** — inbound index (linear), risk map, 2,000-row cap, atomic write lock with TTL, bounded-parallel batches |
| 4 | Medium | Failed import leaves mixed dataset | **Fixed** — added keys rolled back on write failure; stale keys removed only after a full write |
| 5 | Low | `Math.random` batch IDs | **Fixed** — `crypto.randomUUID()` |
| 6 | Info | KVS key injection | Not exploitable — IDs validated, key parts base64url-encoded |
| 7 | Info | XSS | No sink — values rendered as React text; no `dangerouslySetInnerHTML`, no data-built links |
| 8 | Info | CSV formula injection | No export exists; escape `= + - @` if an export is added |
| 9 | Info | Scopes | Least privilege: `storage:app`, `read:jira-work` (permission check, projects, status), `write:jira-work` (issue creation, Phase 3); `read:jira-user` (roles: user search and names/avatars, asUser only) |
| 10 | Info | `prosemirror-view` XSS advisory via `@forge/bridge` transitive deps | Not in the built bundle (tree-shaken); re-check when `@forge/bridge` updates |
| 11 | Info | Secrets | None in source; app ID is not a secret |

## Phase 3 additions (Jira issue creation)

| # | Severity | Finding | Status |
|---|---|---|---|
| 12 | Medium | Issue created but link save fails → retry creates a duplicate | **Fixed** — 3 save attempts, then `LINK_FAILED` with the created key; per-risk label for recovery |
| 13 | Medium | Lock acquisition errors reported as "busy"; expired lock released by the wrong holder | **Fixed** — shared token-owned `withKvsLock` for both locks |
| 14 | Medium | Viewers could see creator account IDs and keys of issues they cannot access | **Fixed** — `createdBy` stripped; hidden duplicates reported without the key. Residual: a link's last-known key is still listed when the viewer cannot see the issue (status shows "unavailable") |
| 15 | Medium | Links break when an issue moves project | **Fixed** — status and sidebar look up by issue ID |
| 16 | Info | JQL / markup injection | Not exploitable — only numeric IDs reach JQL; CSV values are ADF text nodes |
| 17 | Info | Who may create issues | Any page viewer, but only once per active risk and only where Jira lets *them* create (asUser) |

## Phase 5 additions (Rovo agent)

| # | Severity | Finding | Status |
|---|---|---|---|
| 18 | High | Warehouse text embedded in LOW_STOCK risk IDs reached the agent unsanitised (indirect prompt injection) | **Fixed** — IDs cleaned in DTOs; warehouse names restricted at import; prompt treats IDs as opaque |
| 19 | Medium | Zero-width / bidi characters in CSV text | **Fixed** — stripped by `cleanText` |
| 20 | Medium | Model-supplied `riskId` echoed back into model context | **Fixed** — not echoed |
| 21 | Medium | Issue key returned for issues the user cannot see | **Fixed** — key only when the live (asUser) status is visible |
| 22 | Info | Agent actions | All `GET`, no write tools; inputs validated; failures never fall back to memory |
| 23 | Info | Data scope | Logistics data is app-wide: any page/agent user on the site can read it (by design) |

## Week 1 additions (Forge LLM)

| # | Severity | Finding | Status |
|---|---|---|---|
| 24 | Medium | Any viewer could use the whole daily AI budget (denial of service for admins' column mapping); the cap failed open on KVS errors | **Fixed** — copilot limited to 120 of 150 daily calls and 40 per person; counters fail closed. Residual: non-atomic counters may overshoot by a few under parallel calls |
| 25 | Medium | IDs or numbers inside CSV free text (or typed in the question) could make a fabricated claim pass verification | **Fixed** — evidence only from identifier and numeric fields of tool results; `importedText` and the question never count (user-typed IDs only as "not found") |
| 26 | Medium | Verification checks values, not meaning: a wrong conclusion from correct numbers is shown as AI mode | **Accepted, disclosed** — the Copilot notice (shortened to one line on 2026-11-03 at the author's request) and every answer's mode line say that IDs, numbers and dates are checked; README "Known limitations" states that reasoning is not; computed numbers are rejected |
| 27 | Low-Medium | Header rewrite toggled quotes differently from the parser (stray `"` could swallow rows) | **Fixed** — shared `scanHeader` follows the parser; tests for stray quotes and leading blank lines |
| 28 | Low-Medium | A hostile header could steer the model to a plausible but wrong mapping | **Mitigated** — admin confirms every mapping with first values shown; type warnings when samples do not fit a field; every row is still validated |
| 29 | Low | Logs contained model / CSV text and raw API errors | **Fixed** — trimmed and cleaned; API message kept (≤ 200 chars) because it is the only diagnostic for request bugs; logs are developer-only |
| 30 | Low | Truncated tool results counted as evidence | **Fixed** — oversized results are withheld and not counted |
| 31 | Info | Data residency | Forge LLMs are Atlassian-hosted; no external AI provider or egress; Runs on Atlassian eligibility kept (verified by `forge deploy`) |

## Roles additions (owner / managers / viewers)

| # | Severity | Finding | Status |
|---|---|---|---|
| 32 | High | Role bypass: a viewer calls a mutating resolver directly | **Mitigated** — every data and role resolver checks the caller's role server-side from `context.accountId`; the payload never names the actor. Tests: `role-service.test.ts` |
| 33 | High | Race: two admins claim ownership, or the owner removes a manager while ownership is handed over | **Mitigated** — every role change runs under the `lock:roles` KVS lock and re-reads state and re-checks the actor inside it; a held lock returns BUSY. Tests: `kvs-role-store.test.ts`, `roles.test.ts` |
| 34 | Medium | Lock-out when the owner leaves the company | **Mitigated** — any Jira site admin (checked asUser via `mypermissions`) can take over; the takeover is logged |
| 35 | Medium | Adding an arbitrary or forged account ID | **Mitigated** — IDs must match `^[A-Za-z0-9:_-]{1,128}$` and be returned by Jira `user/bulk` asUser as an active user before they are stored |
| 36 | Medium | User enumeration / profile data leaks | **Mitigated** — search is owner-only, 2–50 characters, max 10 results, asUser (Jira's visibility rules apply); only account IDs are stored; avatars only from `https://` URLs |
| 37 | Low | Unbounded growth | **Mitigated** — max 20 managers, role log capped at 50 entries |
| 38 | Info | Avatars are external images | No `external.images` permission was added; if the Custom UI CSP blocks them, initials are shown instead |
| 39 | Info | Jira admin rights while no owner exists | Accepted — keeps the old behaviour (D7) until someone claims ownership |
| 40 | Info | "Create Jira issue" for a risk is open to viewers | Accepted (open question for the author) — it runs asUser, so Jira's own project permissions decide; it is not a LogiMind role right (D21) |

## Known limitations (accepted for now)
- "Today" is evaluated in UTC, so users far from UTC may see a risk change day a few hours early or late.
- A file where most rows are invalid still replaces the dataset with its valid rows; the import result lists every rejected row.
- Resolver responses return full lists (bounded by the 2,000-row cap); no server-side pagination.
- Theme tokens load after first paint, so there can be a brief light flash in dark mode.
