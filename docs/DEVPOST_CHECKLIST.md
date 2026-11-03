# Devpost checklist — Codegeist 2026

Deadline: **2026-12-22 12:00 PT** (2026-12-23 01:00 Tashkent). Rules read 2026-11-03.

## Done (in this repository)
- [x] Forge app with Jira modules, Custom UI, KVS, Jira REST, Rovo agent — `manifest.yml`
- [x] README with judge install steps, permissions, limitations — `README.md`
- [x] Open-source license (MIT) — `LICENSE`
- [x] Architecture, decisions, test report, security review — `docs/`
- [x] Devpost texts, AI disclosure, third-party disclosure, bonus write-up — `docs/DEVPOST_SUBMISSION.md`
- [x] Demo video script (< 3 min) — `docs/DEMO_SCRIPT.md`
- [x] Pre-publication scan: PASS-WITH-WARNINGS (no secrets; see below)

## Needs the author (approval or action)
- [ ] **Decide commit e-mail before publishing** — history contains the personal address in commit metadata. Option: rewrite to a GitHub `noreply` address before the first push.
- [ ] **Optional:** replace the developer site name in `docs/` with `<your-site>`.
- [ ] **GitHub:** `gh auth login`, then approve creating a **public** repository and pushing.
- [ ] **Production deploy:** approve `forge deploy -e production` (judges should get the production environment).
- [ ] **Install link:** Developer console → app → *Distribution* → enable sharing → copy the installation link (requires completing the distribution details).
- [ ] **Rovo (bonus):** get a Rovo-enabled site (e.g. Jira Standard/Premium trial), install, and verify the agent live; otherwise do not select the bonus.
- [ ] **Manual QA:** the three checks in `docs/TEST_REPORT.md`.
- [ ] **Video:** record per script, upload to YouTube as **public**, add the link.
- [ ] **Devpost form:** register at codegeist2026.devpost.com, paste texts, choose category + bonus, add repo, video and install link, submit.
