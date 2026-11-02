# Security Review

Last updated: 2026-11-02 (Phase 2). Reviewer: `ecc:security-reviewer`, plus `ecc:typescript-reviewer` and `ecc:react-reviewer` for related correctness issues.

## Threat model
- Any Jira user who can open the LogiMind global page can call its resolvers.
- Imported CSV content is untrusted and stored in app-level Forge KVS, shared across the site.
- Later phases: Jira issue creation (`asUser`) and a Rovo agent that reads this data, so CSV text may reach an LLM.

## Findings and status

| # | Severity | Finding | Status |
|---|---|---|---|
| 1 | High | Import / demo load / delete open to every user | **Fixed** — server-side Jira `ADMINISTER` check (`src/auth/access.ts`) before every write; UI disables the controls for non-admins |
| 2 | High | Prompt-injection surface: CSV free text (supplier, product, carrier…) will reach the Rovo agent | **Open — Phase 5 rule**: agent actions return structured fields, free text marked as untrusted data; agent stays read-only; issue text built from templates, never raw CSV |
| 3 | Medium | Unbounded full scans / O(n²) per read; concurrent imports racing | **Fixed** — inbound index (linear), risk map, 2,000-row cap, atomic write lock with TTL, bounded-parallel batches |
| 4 | Medium | Failed import leaves mixed dataset | **Fixed** — added keys rolled back on write failure; stale keys removed only after a full write |
| 5 | Low | `Math.random` batch IDs | **Fixed** — `crypto.randomUUID()` |
| 6 | Info | KVS key injection | Not exploitable — IDs validated, key parts base64url-encoded |
| 7 | Info | XSS | No sink — values rendered as React text; no `dangerouslySetInnerHTML`, no data-built links |
| 8 | Info | CSV formula injection | No export exists; escape `= + - @` if an export is added |
| 9 | Info | Scopes | Least privilege: `storage:app`, `read:jira-work` (permission check). `write:jira-work` only with Phase 3 |
| 10 | Info | `prosemirror-view` XSS advisory via `@forge/bridge` transitive deps | Not in the built bundle (tree-shaken); re-check when `@forge/bridge` updates |
| 11 | Info | Secrets | None in source; app ID is not a secret |

## Known limitations (accepted for now)
- "Today" is evaluated in UTC, so users far from UTC may see a risk change day a few hours early or late.
- A file where most rows are invalid still replaces the dataset with its valid rows; the import result lists every rejected row.
- Resolver responses return full lists (bounded by the 2,000-row cap); no server-side pagination.
- Theme tokens load after first paint, so there can be a brief light flash in dark mode.
