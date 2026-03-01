# Deploy Deep Research Agent (ai-assessment) to Railway

This app runs as **one Railway service**: the Next.js frontend serves the UI and API routes, and **spawns the Python backend** when you start an investigation. The repo includes a Dockerfile that installs both Node (Next.js) and Python (CLI agent) in a single image.

---

## 1. Create a Railway project and connect the repo

1. Go to [railway.app](https://railway.app) and create a **new project**.
2. **Add a service**: **Deploy from GitHub repo** → select your `ai-assessment` repo (or fork).
3. Railway will detect the **Dockerfile** at the repo root and use it for build and run. No need to set a "root directory" — the Dockerfile defines the layout.

---

## 2. Environment variables

Set these in **Service → Variables** (or in the Railway dashboard). All of these are used by either the Next.js server or the spawned Python process.

### Required (LLM and search)

| Variable | Description |
|----------|-------------|
| `LITELLM_API_KEY` | LiteLLM proxy API key (if you use a proxy for all models). |
| `LITELLM_API_BASE` | **Required when using LiteLLM in production.** Set to your proxy’s **public** URL (e.g. `https://your-proxy.up.railway.app/v1`). If unset or localhost, the app skips LiteLLM and uses direct provider keys instead. |
| **or** direct provider keys | If not using a remote proxy: set `OPENAI_API_KEY` (required for runs), and optionally `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`. Do **not** set `LITELLM_API_KEY`, or set `LITELLM_API_BASE` to a non-localhost URL. |
| `TAVILY_API_KEY` | Tavily search API key. |
| `BRAVE_SEARCH_API_KEY` | Brave Search API key (optional but recommended as fallback). |
| `SEC_CONTACT_EMAIL` | Email for SEC EDGAR User-Agent (e.g. your email). |

### Neo4j (optional)

| Variable | Description |
|----------|-------------|
| `NEO4J_URI` | e.g. `bolt://localhost:7687` or a hosted Neo4j (Aura, etc.). |
| `NEO4J_USERNAME` | Neo4j user. |
| `NEO4J_PASSWORD` | Neo4j password. |

If Neo4j is not set or unreachable, the agent still runs; graph persistence is skipped.

### Optional (tuning and observability)

| Variable | Description |
|----------|-------------|
| `COST_BUDGET_USD` | Max spend per investigation (default `5.0`). |
| `MAX_SEARCH_ITERATIONS` | Max Director iterations (default `8`). |
| `LOG_LEVEL` | e.g. `INFO` or `DEBUG`. |
| `LANGCHAIN_TRACING_V2` | Set to `true` if you use LangSmith. |
| `LANGCHAIN_API_KEY` | LangSmith API key. |
| `PROMETHEUS_METRICS_ENABLED` | Set to `true` to expose `/metrics`. |

### Built in the image (do not override unless needed)

- `REPO_ROOT=/app` — Backend and frontend expect the app at `/app`.
- `BACKEND_PYTHON=/app/.venv/bin/python` — Next.js uses this to spawn the agent.
- `OUTPUT_DIR=/app/outputs` — Case state and reports are written here (ephemeral unless you add a volume).

---

## 2b. “Connection error” on live runs

If every LLM call fails with **Connection error** and logs show `use_litellm=True`, the app is trying to reach a LiteLLM proxy at **localhost**, which is not available inside the Railway container.

**Fix (choose one):**

1. **Use direct provider keys (no proxy)**  
   In Railway variables: set `OPENAI_API_KEY` (and optionally `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`). Leave `LITELLM_API_KEY` unset, or delete it. The app will use OpenAI/Anthropic/Google APIs directly.

2. **Use a remote LiteLLM proxy**  
   Run LiteLLM somewhere reachable (e.g. another Railway service or your own server). In this app’s variables set `LITELLM_API_KEY` and `LITELLM_API_BASE` to that proxy’s **public** URL (e.g. `https://your-litellm.up.railway.app/v1`). The app only uses LiteLLM when `LITELLM_API_BASE` is a non-localhost URL.

---

## 3. Output persistence (optional)

By default, **outputs** (case state, reports, progress) live in `/app/outputs` inside the container and are **lost on redeploy**. To keep them, use one of:

### Option A: Supabase Storage (recommended)

If you have **Supabase** (e.g. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in your env):

1. Create a bucket named `investigation-cases` in the Supabase Dashboard → Storage.
2. Set in Railway: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
3. Completed cases are uploaded to Storage when a run finishes (or when you open a case). After a redeploy, the app lists and loads cases from Storage so they persist.

See [Supabase Storage setup](supabase-storage-setup.md) for details.

### Option B: Railway Volume

1. In Railway: **Service → Volumes** → **Add Volume**.
2. Mount path: `/app/outputs`.
3. Redeploy. The same directory will persist across deploys.

---

## 4. Neo4j on Railway (optional)

If you want a dedicated Neo4j instance:

1. In the same project: **+ New** → **Database** → **Neo4j** (if available) or use an external Neo4j (e.g. Neo4j Aura).
2. Copy the connection URI and credentials into the service variables: `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD`.

---

## 5. Deploy and open the app

1. Trigger a deploy (push to the linked branch or **Deploy** in the dashboard).
2. After the build finishes, open the **generated URL** (e.g. `https://your-app.up.railway.app`).
3. Start an investigation from the UI. The Next.js server will spawn `python -m src.main investigate ...`; the run will write to `OUTPUT_DIR` and the UI will list and stream the case.

---

## 6. What you need to provide

- **Railway account** and repo connected.
- **LLM access**: Either `LITELLM_API_KEY` (+ base URL if needed) or `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`.
- **Search**: `TAVILY_API_KEY` (and optionally `BRAVE_SEARCH_API_KEY`).
- **SEC**: `SEC_CONTACT_EMAIL` (any valid email for EDGAR compliance).
- **Optional**: Neo4j credentials, LangSmith keys, volume for `/app/outputs`.

---

## 7. Architecture summary

| Component | Role |
|-----------|------|
| **Next.js** | Serves the UI and `/api/cases`, `/api/investigate`, `/api/investigate/[id]/stream`, etc. |
| **Python backend** | No HTTP server. Started by the Next.js API route `POST /api/investigate` as a subprocess. |
| **Outputs** | Stored under `OUTPUT_DIR`; read by the cases API and stream route. |

The Dockerfile installs the backend at `/app` (venv, `src`, `config`) and the frontend at `/app/frontend`, then runs `npm run start` from `/app/frontend`. Railway sets `PORT`; Next.js binds to it automatically.
