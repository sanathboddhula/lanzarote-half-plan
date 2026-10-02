# Private training plan on GitHub Pages + Supabase

This repository publishes a public **sign-in shell** through GitHub Pages. The personalized plan HTML and saved progress live in Supabase Postgres with row-level security. Do not commit the local `marathon-muscle-plan.html`, progress exports, CSV files, scan images, or any Supabase secret/service-role key.

## Deployed infrastructure

- GitHub Pages: <https://sanathboddhula.github.io/lanzarote-half-plan/>
- Supabase project: `ywfunoilcmukceknkwtx`
- [The SQL migration](supabase/migrations/20260929000000_private_training.sql) has been applied; it creates the private tables, RLS policies, and Storage bucket.
- `config.js` contains only the project URL and **publishable** browser key. Never add a secret or service-role key.
- Supabase Auth Site URL and redirect list point to the GitHub Pages URL. Passkeys are enabled for the `sanathboddhula.github.io` relying party and its HTTPS origin.

## Finish personal setup

1. Enter your email and request a one-time sign-in link. Opening it establishes a confirmed account without a site password. A passkey still needs this owner identity in Supabase.
2. Select **Set up Face ID / passkey** while signed in. The device chooses Face ID, Touch ID, PIN, or a security key. Future visits can use the passkey button; email links remain a recovery path.
3. After signing in, open **Data & setup** and select the local `marathon-muscle-plan.html` from the Codex outputs folder. The plan HTML is uploaded into your private Supabase row.
4. In the old local plan, select **Export progress for hosting** under Your profile. Import that JSON through **Data & setup** on the hosted site. This migration is required because browser storage under `file://` does not move to the new GitHub Pages URL.
5. Back up your original Strong CSV in **Data & setup**. You can add the Strava activities CSV there when it arrives. Both files are stored in a private Supabase Storage bucket under your user ID.
6. Disable new sign-ups in Supabase after your account exists if this will remain a personal app.

The Strong and Strava CSV importers in the plan still process raw files in the browser. Backups in Storage preserve the source files; the dashboard stores derived summaries and baseline values in Postgres. Live Strava OAuth sync is a separate feature.

## Data model

- `private_plan_html`: one authenticated owner's full personalized dashboard HTML.
- `training_state`: checkoffs, profile/baseline, illness return date, and Strong summary.
- `agent_checkins`: short, unverified daily notes submitted through a public insert-only inbox and read by the signed-in owner.
- `training-exports`: private original CSV backups in Supabase Storage.

The plan and state tables have owner-only read/write policies. Unauthenticated visitors cannot read any private table. The separate `agent_checkins` table grants anonymous callers only `INSERT` on `checkin_date` and `body`; the signed-in owner can read and remove entries. The database assigns each entry to the sole user with a private plan. Inserts fail if there is no plan owner or more than one.

## External agent check-ins

The live Supabase project applied [`20261002000000_agent_checkins.sql`](supabase/migrations/20261002000000_agent_checkins.sql) on October 2, 2026. Apply it before publishing this frontend in any other project. Give the agent this request format; the publishable key is already public in [`config.js`](config.js), so no owner session or service-role key needs to be shared:

```http
POST https://ywfunoilcmukceknkwtx.supabase.co/rest/v1/agent_checkins
apikey: <publishable key from config.js>
Content-Type: application/json
Prefer: return=minimal

{"checkin_date":"2026-10-02","body":"Easy run completed. Legs felt good; no pain."}
```

A successful insert returns HTTP 201 with no row body. The agent can submit one note per day, or multiple notes for the same date; it cannot read, update, or delete them. The signed-in site shows the latest 100 under **Check-ins**. It renders notes as text, not HTML.

This endpoint has no caller authentication. Anyone who knows the public site can submit forged notes or spam the inbox. Treat entries as unverified, and remove unwanted ones from the Check-ins drawer. If that exposure is unacceptable, use an authenticated Edge Function with a dedicated token provisioned outside chat instead.

The live project also has an older owner-only migration that is intentionally absent from this public repository because it contains personal owner details. For future CLI pushes, fetch remote migration history into a private working directory and leave that file out of Git.
