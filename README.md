# Private training plan on GitHub Pages + Supabase

This repository publishes a public **sign-in shell** through GitHub Pages. The personalized plan HTML and saved progress live in Supabase Postgres with row-level security. Do not commit the local `marathon-muscle-plan.html`, progress exports, CSV files, scan images, or any Supabase secret/service-role key.

## Deployed infrastructure

- GitHub Pages: <https://sanathboddhula.github.io/lanzarote-half-plan/>
- Supabase project: `ywfunoilcmukceknkwtx`
- [The SQL migration](supabase/migrations/20260929000000_private_training.sql) has been applied; it creates the private tables, RLS policies, and Storage bucket.
- `config.js` contains only the project URL and **publishable** browser key. Never add a secret or service-role key.
- Supabase Auth Site URL and redirect list point to the GitHub Pages URL.

## Finish personal setup

1. Create your account through the site's sign-up form and confirm your email.
2. After signing in, open **Data & setup** and select the local `marathon-muscle-plan.html` from the Codex outputs folder. The plan HTML is uploaded into your private Supabase row.
3. In the old local plan, select **Export progress for hosting** under Your profile. Import that JSON through **Data & setup** on the hosted site. This migration is required because browser storage under `file://` does not move to the new GitHub Pages URL.
4. Back up your original Strong CSV in **Data & setup**. You can add the Strava activities CSV there when it arrives. Both files are stored in a private Supabase Storage bucket under your user ID.
5. Disable new sign-ups in Supabase after your account exists if this will remain a personal app.

The Strong and Strava CSV importers in the plan still process raw files in the browser. Backups in Storage preserve the source files; the dashboard stores derived summaries and baseline values in Postgres. Live Strava OAuth sync is a separate feature.

## Data model

- `private_plan_html`: one authenticated owner's full personalized dashboard HTML.
- `training_state`: checkoffs, profile/baseline, illness return date, and Strong summary.
- `training-exports`: private original CSV backups in Supabase Storage.

Each table has owner-only select, insert, and update policies. Unauthenticated visitors cannot read either table.
