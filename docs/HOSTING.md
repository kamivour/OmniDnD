# Putting OmniDnD online with accounts

Accounts are optional. Without the two settings in step 3, the app builds as a guest-only site and works exactly as it does locally.

## 1. Create the account database (Supabase, free tier)

2. Open **SQL Editor** and run each file in `supabase/migrations/` once, oldest first: `20261106120000_sync_entities.sql`, then `20261109150000_profiles.sql` (display names). Already set up? Run only the files you have not run.
2. Open **SQL Editor**, paste the contents of `supabase/migrations/20261106120000_sync_entities.sql`, and run it once.
3. Open **Authentication → Sign In / Providers** and keep **Email** enabled. "Confirm email" on is safer; players then click a link before their first sign-in.

## 2. Copy the public connection values

Open **Project Settings → API** (or **Data API**) and copy:

- the **Project URL** (`https://<project>.supabase.co`)
- the **anon / publishable** key

The anon key is meant to be public. The database rules from step 1 stop anyone from reading or changing another person's rows. Never put the **service_role / secret** key in the app.

## 3. Build with accounts turned on

Create `.env.local` in the project folder (it is ignored by git):

```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

Run `npm run dev` to try sign-in locally, or `npm run build` to produce `dist/`.

## 4. Publish the static site

The app is a static site: upload `dist/`. It currently expects to live at the site root (`/`) and needs every unknown path to serve `index.html`.

- **Netlify or Cloudflare Pages (easiest):** connect the GitHub repo, build command `npm run build`, output folder `dist`, and add the two `VITE_…` values as build environment variables. Add an SPA fallback (Netlify: a `_redirects` file with `/* /index.html 200`; Cloudflare Pages does this automatically).
- **GitHub Pages:** works with a custom domain or a `<name>.github.io` user site. A project page (`<name>.github.io/OmniDnD/`) needs a base-path change in the app first; ask for it before publishing there.

## 5. Tell Supabase where the site lives

In **Authentication → URL Configuration**, set **Site URL** to your published address so confirmation emails link back to the app.

## Checking it works

Sign in on two devices, change a character on one, press **Sync now** on both, and confirm the change arrives. Change the same character on both before syncing to see the "which version to keep" prompt.
