# Captured investigations (deployed demo data)

This directory holds a fixed set of investigation outputs so the **deployed** app (e.g. Railway) can show sample cases without running the backend.

- **timothy_overturf** — CEO, Sisu Capital (assessment target)
- **jensen_huang** — CEO, NVIDIA
- **adam_neumann** — Co-founder, WeWork
- **sam_altman** — CEO, OpenAI

Each case includes `*_state.json`, `*_report.md`, `*_entities.json`, and `*_metadata.json`. Where available, `*_progress.jsonl` is included so the **Execution log** tab shows the same style of entries as for runs that have `state.logs` populated (e.g. adam_neumann). The Dockerfile copies this folder to `/app/outputs` so the UI and API can list and serve these investigations.

To refresh or add cases, run investigations locally then copy the desired files from `outputs/` into `outputs_captured/` (including `*_progress.jsonl` for the Log tab) and commit.
