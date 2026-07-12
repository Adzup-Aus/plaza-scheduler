# Going live — the 3 steps I need you for

Everything is built and tested. These are the live steps that need your login or a
secret key, which I can't do myself. Each is spelled out so you can hand it to me
(with the Chrome plugin on) or do it yourself. Do them in order.

## Step 1 — Create the schedule tables in Supabase

1. Go to https://supabase.com/dashboard → project **plaza-central**.
2. Left sidebar → **SQL Editor** → **New query**.
3. Open the file `supabase/stage-3-work-schedule.sql` (in this folder), copy all of it,
   paste it into the editor, and click **Run**.
4. You should see "Success. No rows returned." That created five empty tables. It is
   safe to run again — it never overwrites data.

## Step 2 — Deploy the app to Netlify

Option A (drag-and-drop, simplest): I run `npm install && npm run build` here, which
makes a `dist/` folder, and we drop the built site onto Netlify. But this app also has
serverless functions, so the connected-repo route (Option B) is better.

Option B (recommended, connected repo):
1. Put this folder in a Git repo (I can do this once you point me at the GitHub account,
   or you create an empty repo and paste me the URL).
2. On https://app.netlify.com → **Add new site → Import an existing project** → pick the
   repo. Netlify reads `netlify.toml` automatically (build `npm run build`, publish
   `dist`, functions `netlify/functions`).
3. Give the site a name, e.g. `plaza-scheduler`. Confirm the name with me before deploy.

## Step 3 — Set the secret keys (Netlify → Site settings → Environment variables)

Add these four. The first two you already have from earlier stages; the Anthropic key is
the same one Stage 1B is waiting on.

| Key | Where to find it | Notes |
|---|---|---|
| `SUPABASE_URL` | `https://wpktjjjowwiiawxlqhng.supabase.co` | already known |
| `SUPABASE_SERVICE_KEY` | Supabase → plaza-central → Project Settings → API → `service_role` key | **server-side only, never the front end** |
| `ANTHROPIC_API_KEY` | https://console.anthropic.com → API keys | same key Stage 1B needs |
| `SCHEDULER_PASSCODE` | you choose it | the office passcode to open the board |

Optional: `ANTHROPIC_MODEL` (defaults to `claude-sonnet-5`; set it if the model name has
changed), and `SESSION_SECRET` (any long random string; defaults to the passcode).

After saving the variables, trigger a redeploy so they take effect.

## Step 4 — The live end-to-end test (I run this once the above is done)

1. Open the site, enter the passcode.
2. Pick a real job that has an accepted quote linked, click **Generate**, set a start date.
3. Confirm the board fills with the day plan; edit a cell; slip a date and accept the reflow.
4. Confirm the milestone-release days and trade-days show the dates the money apps (8a, 09)
   will read.

## Two decisions I made for you (flagged, easy to change)

1. **Trade order source conflict.** Two framework files disagree on whether carpentry or
   the plumbing rough-in comes first. I followed `Trade_Sequence_and_Logic.md` (rough-ins
   before timber) because that file is the designated source of truth for order. If you
   want the other order, it's a one-line change in `scheduleEngine.js`.
2. **Where the calendar date lives.** Plaza's `job_work_days` has no date column (it's
   positional), so I put the dates on `schedule_entries` (which does), one per work day.
   The link between a day and its dated entry is by convention (a `[wd:N]` tag in the
   entry note), not a hard database link, because Plaza's table has no column for it.
   Worth a look at assimilation.
