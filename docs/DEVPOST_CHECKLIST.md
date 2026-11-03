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
- [x] **Commit e-mail** — author decided (2026-11-03) to keep the personal address in commit metadata; history is not rewritten.
- [ ] **Optional:** replace the developer site name in `docs/` with `<your-site>`.
- [x] **GitHub:** public repository https://github.com/Muhsin2007/logimind-for-jira (MIT detected, `main`), created 2026-11-03 with the author's approval.
- [x] **Production deploy:** `forge deploy -e production` → production v2.0.0 (commit `910e376`), then **v2.1.0** (commit `ccad0e7`, English-only UI), then **v3.0.0** (commit `5f086ea`, Forge LLM AI features, major version: `llm` module), all 2026-11-03, approved by the author. Not installed on the author's site (the development version is installed there). Redeploy after any later change.
- [x] **Install link:** sharing enabled for Jira (production) on 2026-11-03; link is in `README.md` → Install. Paste the same link into the Devpost form. It points at the latest production deployment, so redeploy production after any change.
- [ ] **Rovo (bonus):** get a Rovo-enabled site (e.g. Jira Standard/Premium trial), install, and verify the agent live; otherwise do not select the bonus.
- [ ] **Manual QA:** the three checks in `docs/TEST_REPORT.md`.
- [ ] **Video:** record per script, upload to YouTube as **public**, add the link.
- [ ] **Devpost form:** register at codegeist2026.devpost.com, paste texts, choose category + bonus, add repo, video and install link, submit.
