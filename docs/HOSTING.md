# Putting OmniDnD online with accounts

Accounts are optional. Without the two settings in step 3, the app builds as a guest-only site and works exactly as it does locally.

## 1. Create the account database (Supabase, free tier)

1. Sign up at supabase.com and create a project. Pick a region near your players.
2. Open **SQL Editor** and run each file in `supabase/migrations/` once, oldest first: `20261106120000_sync_entities.sql`, `20261109150000_profiles.sql` (display names), `20261109160000_delete_account.sql` (delete account), `20261109170000_party.sql` (shared campaigns), then `20261117110000_join_requests.sql` (join approval and private journals). Already set up? Run only the files you have not run.
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

In **Authentication → URL Configuration**, set **Site URL** to your published address so confirmation emails link back to the app. Under **Redirect URLs**, add `https://<your address>/reset-password` (and `http://localhost:5173/reset-password` for local work) so password reset emails open the app.

## Checking it works

Sign in on two devices, change a character on one, press **Sync now** on both, and confirm the change arrives. Change the same character on both before syncing to see the "which version to keep" prompt.

For M40, use a second account to request a campaign ID, approve it in Campaign Settings → Party, and bring an existing character. Confirm that the other account can read that character but cannot edit it, including as DM.

The M40 migration is additive: existing invites still work, and rolling back the app does not require dropping the request table. Close old app windows, reopen the updated app and have owners sync to replace older shared snapshots with versions that omit journals and Undo patches; this migration does not rewrite old snapshots by itself.

`npm run check:party` verifies live database permissions using disposable accounts in a **throwaway Supabase project only**. Browser checks use a fake backend and do not prove deployed row-level security.
