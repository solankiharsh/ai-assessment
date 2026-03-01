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
