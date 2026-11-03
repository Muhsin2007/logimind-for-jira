# Demo video script (target 2:45, hard limit < 5:00; judges watch 3:00)

Record on the developer site after **Load demo data** (dates are relative to the recording day). English narration; 1080p; no copyrighted music.

| Time | Screen | Narration (key points) |
|---|---|---|
| 0:00–0:15 | Title card → Jira home | "Importers run their work in Jira but track shipments in spreadsheets. Late containers and stock-outs surface too late. LogiMind brings that picture into Jira." |
| 0:15–0:40 | Import & Settings → upload `tests/fixtures/shipments-with-errors.csv` | "Every row is validated. 7 of 9 rows are rejected — each with its line and reason. Nothing is used silently." Then **Load demo data**. |
| 0:40–1:05 | Dashboard | "Six late shipments, three SKUs below safety stock, and the value at risk. Every risk comes from transparent rules — not a black-box prediction." |
| 1:05–1:35 | Risk Center → SHP-1004 card → **Create Jira issue** → open the issue | "One click creates a Jira issue as me, with the evidence. It can't be duplicated, its status comes back live, and the issue itself shows the LogiMind panel with the shipment." |
| 1:35–2:10 | Copilot → "Status of SHP-1004", "Stock of SKU-10", "Where is SHP-9999?" | "Answers cite their sources, suggest concrete steps — transfer exactly 100 units from Tashkent — and say what is unknown. An unknown ID is reported, never invented." |
| 2:10–2:35 | Rovo chat → LogiMind agent → "Give me today's logistics risk summary" | "The same read-only tools power a Rovo agent, so the answers in Rovo match the app." *(Only if recorded on a Rovo-enabled site; otherwise show the manifest and say it is available on Rovo-enabled sites.)* |
| 2:35–2:45 | Architecture slide | "Built on Forge with Custom UI, KVS, Jira REST and Rovo — no external backend, Runs on Atlassian." |

Checklist before recording: dark/light theme consistent, browser zoom 100 %, notifications off, no personal data on screen.
