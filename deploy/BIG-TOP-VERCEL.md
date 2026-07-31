# Big Top Check-In on Vercel + Supabase

Page: `/big-top`  
APIs: `/api/big-top/attendees`, `/api/big-top/check-in`, `/api/big-top/upload`

## Storage preference

1. **Supabase** (recommended) — when `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are set  
2. Vercel Blob — if only `BLOB_READ_WRITE_TOKEN` is set  
3. Local JSON — `data/tithely/big-top-store.json` for laptop dev without cloud

Use the **same Supabase project** as `apostolic-life-portal`.

## One-time: create tables

In the Supabase dashboard → **SQL Editor**, run:

`supabase/migrations/202607310001_big_top_checkin.sql`

That creates:

- `big_top_attendees` (one row per Tithely confirmation code)
- `big_top_check_ins` (per person per day: Aug 1 / Aug 2)

RLS is on with **no public policies** — only the service role (server) can read/write.

## Env vars (Vercel + local)

Copy from the portal project:

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Server API access (secret) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Optional; matches portal naming |
| `BIG_TOP_ACCESS_CODE` | Optional staff password for `/big-top` |

**Never** expose the service role key to the browser.

## After deploy

1. Open `https://<domain>/big-top`
2. Unlock with access code (if set)
3. Upload Tithely CSV — first upload seeds Supabase; later uploads only add **new** codes and never wipe check-ins

## Merge + check-in rules

- CSV upload: **insert new confirmation codes only**
- Check-in: separate rows for `2026-08-01` and `2026-08-02`
- Same person can check in both days
- Concurrent check-ins are safe (row upserts, not whole-file rewrites)

## Git

`data/tithely/` stays gitignored (PII). Do not commit CSVs or service role keys.
