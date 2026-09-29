# Private training plan on GitHub Pages + Supabase

This repository publishes a public **sign-in shell** through GitHub Pages. The personalized plan HTML and saved progress live in Supabase Postgres with row-level security. Do not commit the local `marathon-muscle-plan.html`, progress exports, CSV files, scan images, or any Supabase secret/service-role key.

## Setup

1. Create a dedicated Supabase project and apply [the SQL migration](supabase/migrations/20260929000000_private_training.sql) in its SQL Editor.
2. Copy the project URL and **publishable** key from Supabase into `config.js`. The publishable key is designed for browser use; RLS protects the data. Never use a secret or service-role key here.
3. Set the Supabase Auth Site URL to `https://sanathboddhula.github.io/lanzarote-half-plan/` and add that URL to Redirect URLs. Create your account through the site's sign-up form, confirm your email, and then disable new sign-ups in Supabase if this will remain a personal app.
4. Publish this repository with the included GitHub Pages workflow. In repository Settings → Pages, use **GitHub Actions** as the source.
5. After signing in, open **Data & setup** and select the local `marathon-muscle-plan.html` from the Codex outputs folder. The plan HTML is uploaded into your private Supabase row.
6. In the old local plan, select **Export progress for hosting** under Your profile. Import that JSON through **Data & setup** on the hosted site. This migration is required because browser storage under `file://` does not move to the new GitHub Pages URL.
7. Back up your original Strong CSV in **Data & setup**. You can add the Strava activities CSV there when it arrives. Both files are stored in a private Supabase Storage bucket under your user ID.

The Strong and Strava CSV importers in the plan still process raw files in the browser. Backups in Storage preserve the source files; the dashboard stores derived summaries and baseline values in Postgres. Live Strava OAuth sync is a separate feature.

## Data model

- `private_plan_html`: one authenticated owner's full personalized dashboard HTML.
- `training_state`: checkoffs, profile/baseline, illness return date, and Strong summary.
- `training-exports`: private original CSV backups in Supabase Storage.

Each table has owner-only select, insert, and update policies. Unauthenticated visitors cannot read either table.
