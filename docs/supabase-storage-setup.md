# Supabase Storage for investigation cases

Use **Supabase Storage** (not tables) to persist investigation outputs so they survive Railway redeploys.

## 1. Create the bucket

1. In [Supabase Dashboard](https://supabase.com/dashboard) → your project → **Storage**.
2. **New bucket**: name `investigation-cases`, leave **Public** off (app uses service role).
3. Create the bucket.

No SQL or table setup required.

## 2. Environment variables

In Railway (or your app env), set:

- `SUPABASE_URL` — project URL (e.g. `https://xxxx.supabase.co`)
- `SUPABASE_SERVICE_ROLE_KEY` — project **Service role** key (Settings → API)

The app uses the service role to read/write the bucket; no RLS needed for server-only access.

## 3. Storage layout

The app stores one “folder” per case as objects with the same names as local files:

- `{case_id}_state.json`
- `{case_id}_report.md`
- `{case_id}_entities.json`
- `{case_id}_metadata.json`
- `{case_id}_progress.jsonl`
- `{case_id}_meta.json` (summary for listing: subject_name, risk_score, confidence, updated_at)

When a case is read from local disk (e.g. right after a run), the app uploads these files to Storage so the next deploy can load them from Supabase.

## 4. Local development: same data as deployed

The **Timeline** tab (and other full case data) comes from the **state** payload: `temporal_facts`, `temporal_contradictions`, etc. The API loads the case in this order:

1. **Supabase** — if `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set, it tries to load the case from the bucket.
2. **Local files** — if not in Supabase, it reads from `outputs/{case_id}_state.json` (and related files) on disk.

If you see **“Timeline analysis not available”** locally but the same case shows the timeline on deployed, the local app is using **local files** (no Supabase or case not in Supabase), and your local `_state.json` either doesn’t exist or is from an older/different run without temporal data.

**To see the same cases and timeline locally as on deployed:**

- In `frontend/.env.local`, set the **same** Supabase env vars as on Railway:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
- Restart the Next dev server. The API will then load cases from the same bucket as deployed, including full state (temporal facts, contradictions, etc.).

## 5. Backfilling temporal data (Timeline empty in Supabase)

If a case in Supabase has **no** `temporal_facts` / `temporal_contradictions` (e.g. the run completed with 0 temporal facts from the analyzer), you can backfill from a local state file and re-upload.

**Will this work in the deployed app?**

- **Read-through merge and backfill API** only work when the **server** can read local files (`outputs/` or `outputs_captured/`). In production (e.g. Railway), that directory is empty or missing, so the deployed app will **not** see Timeline data until the case in Supabase is updated.
- **To fix Timeline on production:** run the push script **from your machine** (where the merged state file exists) with **production** Supabase credentials. That updates the case in the bucket; the next time the deployed app loads the case, it will have temporal data.

**Option A – Push script (use for production)**

From your machine, with a state file that has temporal data and production Supabase env set:

```bash
cd frontend
# Set production Supabase (or use .env.production / export)
export SUPABASE_URL=https://your-project.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
node scripts/push-temporal-to-supabase.mjs timothy_overturf
```

The script reads `../outputs_captured/{id}_state.json` or `../outputs/{id}_state.json`, fetches the case from Supabase, merges temporal data, and re-uploads. After this, the deployed app will show the Timeline.

**Option B – API (local dev only)**

When the Next.js server runs locally and has access to the state file:

1. Ensure a state file with temporal data exists at:
   - `outputs_captured/{case_id}_state.json`, or
   - `outputs/{case_id}_state.json`
2. Call:
   ```bash
   curl -X POST http://localhost:3000/api/cases/timothy_overturf/backfill-temporal
   ```
3. Reload the case in the UI.

**Option C – Merge script (generate temporal from canonical narrative)**

From the repo root:

```bash
python scripts/merge_temporal_into_state.py --state outputs/timothy_overturf_state.json
```

This writes `temporal_facts` and `temporal_contradictions` into the state file and regenerates the report. Then use Option A to push that state to (production) Supabase, or Option B if you only need it in local dev.
