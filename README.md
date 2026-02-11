# nostop.app

Trading signals and position analysis app with Supabase and Vercel.

## Vercel deployment

1. **Framework**: Ensure "Framework Preset" is **Next.js** (Vercel usually auto-detects).
2. **Output Directory**: Leave **empty** – do not set to "public" (Next.js uses `.next`).
3. **Environment Variables**: Add these in Vercel → Settings → Environment Variables:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Supabase transaction pooler (port 6543) + `?pgbouncer=true` |
| `DIRECT_URL` | Supabase session pooler (port 5432) |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://YOUR_PROJECT_REF.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `ENCRYPTION_KEY` | 64 hex chars (`openssl rand -hex 32`) |
| `NEXT_PUBLIC_APP_URL` | Your Vercel URL or custom domain |

Copy values from your local `.env` and enable for **Production** (and Preview if needed).
