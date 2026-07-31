# Big Top Check-In on Vercel

The check-in UI is a normal Next.js route:

- Page: `/big-top`
- APIs: `/api/big-top/attendees`, `/api/big-top/check-in`, `/api/big-top/upload`

## Why Blob storage?

Vercel serverless functions **cannot keep check-ins on the local disk**.  
When `BLOB_READ_WRITE_TOKEN` is set, the app stores the attendee list + check-ins in **Vercel Blob** (private JSON). Locally, without that token, it still uses `data/tithely/big-top-store.json`.

## One-time setup in the Vercel project

1. Open your **apostoliclife-worship** (or apostolic-worship) project on [vercel.com](https://vercel.com).
2. Go to **Storage** → create **Blob** (if you don’t already have one) and connect it to this project.
3. Confirm env var **`BLOB_READ_WRITE_TOKEN`** is present for Production (and Preview if you want).
4. Add optional staff lock:
   - **`BIG_TOP_ACCESS_CODE`** = a password only volunteers know  
   (recommended: the page is public and lists attendee names).
5. Redeploy after env changes (Deployments → Redeploy, or push a commit).

## After deploy

1. Open `https://<your-domain>/big-top`
2. Enter the access code (if configured)
3. **Upload** `big-top-back-to-school-bash.csv` (or a fresh Tithely export)  
   - First upload seeds everyone  
   - Later uploads only add **new** confirmation codes and never wipe check-ins

## Git note

`data/tithely/` is gitignored on purpose (PII). Do not commit the CSV or store JSON. Always upload the CSV through the live page after deploy.

## Local vs Vercel

| | Local | Vercel |
|--|--------|--------|
| Store | `data/tithely/big-top-store.json` | Private Blob `big-top/store.json` |
| Seed CSV auto-load | Yes, if file is present | No — upload via UI |
| Access code | Optional | Strongly recommended |

## Mic board / PreSonus

PreSonus bridge still runs on a church Mac (`localhost:4310`). The Vercel site hosts the web UI and Big Top check-in; mixer signal status only works when the browser can reach the bridge (same LAN / tunnel).
