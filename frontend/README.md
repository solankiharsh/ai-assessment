# Deep Research Console — Frontend

Production-grade investigative intelligence UI for the [Deep Research Agent](../README.md) backend. Dark-first, high-density, 3-zone layout aligned with the API contract and data shapes from `docs/frontend-console-prompt.md`.

## Stack

- **Next.js** (App Router), **TypeScript**, **Tailwind**
- **TanStack Query** (React Query) for server state and polling
- **Zustand** for UI state (panels, tab, focus mode, confidence threshold)
- **@xyflow/react** (React Flow) for the identity graph
- **Framer Motion** available; **lucide-react** for icons

## Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Root redirects to `/cases`.

## API contract (BFF)

The app uses Next.js API routes that read from the backend output directory (default: `../outputs` from the frontend root). Set `OUTPUT_DIR` to point at your backend `outputs/` if different.

| Endpoint | Description |
|----------|-------------|
| `GET /api/cases` | List cases from `*_state.json` in output dir |
| `GET /api/cases/:id` | Full investigation (state + report + entities) |
| `GET /api/cases/:id/graph` | Graph nodes/edges from state |
| `POST /api/investigate` | Start investigation (spawns backend CLI; returns `case_id`) |

## UX decisions

- **Dark-first**: True dark (`#0c0c0e`), not gray; minimal color; risk/amber highlights.
- **3-zone layout**: Left = case navigator (collapsible). Center = tabbed workspace. Right = risk, confidence, hypotheses, timeline, confidence threshold (collapsible).
- **Tabs**: Overview, Entities, Graph, Risk Analysis, Source Audit, Execution Trace. Compact tab bar; URL sync for `tab` and `entity` query params.
- **States**: Loading skeletons, error + retry, empty, partial data. Polling can be added for `status: "running"` cases.
- **Cmd+K**: Command palette to jump to entity (filters by name/type).
- **Focus mode**: Hides left/right panels; Escape restores.
- **Export**: “Export report” downloads `final_report` as markdown.
- **Graph**: React Flow with custom nodes, legend (entity type filter), edge confidence threshold from global slider.
- **No mock data in UI**: All content comes from API; use backend CLI to generate `outputs/` then refresh.

## Project structure

```
src/
  app/           # Routes, layout, API routes
  components/    # RiskMeter, EntityCard, Graph, CommandPalette, etc.
  components/layout/  # ConsoleLayout, LeftPanel, CenterPanel, RightPanel
  components/tabs/   # TabOverview, TabEntities, TabGraph, TabRisk, TabSources, TabTrace
  lib/           # types, api client, utils, output-dir helpers
  store/         # Zustand UI store
```

## Running the pipeline from the UI

1. Go to **Cases** and use the **New investigation** panel (right).
2. Enter **Subject name** (required), and optionally **Current role**, **Current organization**, and **Max iterations** (1–50).
3. Click **Run pipeline**. The app spawns the backend CLI in the background and redirects you to the case page.
4. The case page shows “Case not found or pipeline still running” and **polls every 3 seconds** until the backend writes `outputs/{case_id}_state.json`. Then the console loads with full data.

**Requirements:** Backend must be installed from the repo root (`make install`). To run the pipeline from the UI you must set in `frontend/.env.local`:

- **`REPO_ROOT`** — Absolute path to the repo (directory containing `src/main.py`). Example: `/Users/you/ai-assessment`
- **`BACKEND_PYTHON`** — Absolute path to the backend venv Python. Example: `/Users/you/ai-assessment/.venv/bin/python`

Optional:

- **`OUTPUT_DIR`** — Where the backend writes outputs (default: `../outputs` from the frontend root).

## Backend integration (CLI only)

1. Run investigations with the CLI:  
   `python -m src.main investigate "Subject Name" --role X --org Y [--output outputs]`
2. Ensure the frontend can read the same output directory (default: repo root `outputs/` when running from `frontend/`).
3. Optional: set `OUTPUT_DIR` in `.env.local` to an absolute path to `outputs/`.
