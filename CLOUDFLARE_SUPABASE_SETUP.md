# Cloudflare Pages + Supabase Setup

This project supports collaborative timetable sync through Supabase Realtime.

## 1) Supabase project setup

1. Create a Supabase project.
2. Open SQL Editor.
3. Run `supabase/schema.sql`.
4. In Project Settings > API, copy:
- Project URL
- anon public key

## 2) Local environment

Create `.env` from `.env.example`.

```bash
cp .env.example .env
```

Set:

```bash
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

Run locally:

```bash
npm install --no-bin-links
npm run dev
```

## 3) Cloudflare Pages deploy

1. Push this folder to GitHub.
2. Cloudflare Dashboard > Workers & Pages > Create > Pages > Connect to Git.
3. Build settings:
- Framework preset: `Vite`
- Build command: `npm run build`
- Build output directory: `dist`

4. Environment Variables (Production and Preview):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

5. Deploy.

## 4) How sync works in this app

- The app stores one shared row (`id = 'main'`) in `public.timetable_state`.
- Every change to timetable/standard-hours/teacher-config and class settings (`classCount`, `subjects`) is upserted.
- Other connected clients receive updates via Realtime and apply them immediately.

## 5) Important limits and caution

- Supabase Free has limits (db size, bandwidth, realtime connections/messages).
- Current RLS policy in `supabase/schema.sql` allows anon read/write for quick start.
- For stricter security, add auth and tighten policies before public launch.
