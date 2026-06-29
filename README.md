# Ledger — Expense Tracker

A personal and shared expense tracker: track income from multiple streams,
expenses by category, investments, and split costs with friends — with simple
rule-based suggestions, no AI API key required.

Built with **Next.js 16 (App Router)**, **Supabase** (Postgres + Auth), and
**Tailwind CSS**. Fully responsive — works on phone and desktop.

---

## 1. Set up Supabase (your database + auth)

1. Go to [supabase.com](https://supabase.com) and create a free account, then
   create a new project. Pick any name and a strong database password (save
   it somewhere, you won't need it day-to-day but it's good to keep).
2. Once the project is ready, open **SQL Editor** in the left sidebar.
3. Open the file `supabase/schema.sql` from this project, copy its entire
   contents, paste into a new query in the SQL Editor, and click **Run**.
   This creates all the tables, security rules, and default categories.
4. Go to **Authentication -> Providers** and make sure **Email** is enabled
   (it is by default).
5. Optional but recommended for a friends-and-family app: go to
   **Authentication -> Settings** and turn **off** "Confirm email" so people
   can sign up and start using the app immediately without clicking an email
   link. You can turn this back on later if you want stricter signup.
6. Go to **Settings -> API**. You'll need two values from this page in the
   next step:
   - **Project URL**
   - **anon public** key (NOT the `service_role` key, never expose that one)

## 2. Configure your local environment

1. In the project root, copy `.env.local.example` to a new file called
   `.env.local`:
   ```
   cp .env.local.example .env.local
   ```
2. Open `.env.local` and paste in your Supabase Project URL and anon key:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
   ```

## 3. Run it locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. You'll be redirected to the sign-up page. Create
your account, then share the signup link with your friends so they can
create theirs too. Everyone who signs up shows up in the split-expense
picker automatically.

## 4. Put it on GitHub

```bash
git init
git add .
git commit -m "Initial commit: Ledger expense tracker"
gh repo create ledger-expense-tracker --private --source=. --push
```

(Or create a new repo on github.com and follow its "push an existing
repository" instructions if you don't have the `gh` CLI installed.)

## 5. Deploy live with Vercel

1. Go to [vercel.com](https://vercel.com) and sign in with your GitHub
   account.
2. Click **Add New -> Project**, and import the GitHub repo you just pushed.
3. Before deploying, expand **Environment Variables** and add the same two
   values from your `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Click **Deploy**. After a minute or two you'll get a live URL like
   `ledger-expense-tracker.vercel.app`. That's the link you send to friends.

From now on, every time you push to GitHub, Vercel redeploys automatically.

For the full production checklist, including Supabase Auth URL settings and
when Render is actually needed, see [`DEPLOYMENT.md`](DEPLOYMENT.md).

---

## What's included

- **Auth** — email/password signup, open registration (anyone with your link
  can join), session handled via cookies so it works across page reloads.
- **Transactions** — log income (with a source field, e.g. "Upwork",
  "Client X"), expenses (by category), and investments. Delete anytime.
- **Splitting** — when adding an expense, toggle "Split this expense," pick
  who was involved, and choose an equal split or type custom amounts per
  person. Balances update automatically.
- **Balances** — a running tally of who owes you and who you owe, with a
  one-tap "Settle" action once someone pays you back (or vice versa).
- **Dashboard** — monthly income, expenses, investments, and net cashflow at
  a glance, plus a category breakdown chart.
- **Suggestions** — a local, rule-based insights engine (no API key, no
  external calls) that flags things like a category spending spike vs. last
  month, an income dip, or being close to your monthly budget. Set your
  budget under Settings.
- **Responsive design** — sidebar nav on desktop, bottom nav on mobile.

## Project structure

```
src/
  app/
    login/, signup/         - auth pages
    dashboard/               - main app (overview, transactions, splits, settings)
    actions/                 - server actions (create/delete transactions, settle splits)
  components/
    auth/, dashboard/, layout/, ui/
  lib/
    supabase/                - browser, server, and middleware Supabase clients
    data/                    - server-side data fetching + balance calculations
    insights.ts              - the rule-based suggestion engine
    types/                   - shared TypeScript types
supabase/
  schema.sql                 - run this once in your Supabase SQL Editor
```

## Customizing

- **Categories**: edit the default list in `supabase/schema.sql` under
  `seed_default_categories()` before running it, or just add/edit categories
  directly in Supabase's Table Editor (`categories` table). There's no
  in-app category management UI yet, that's a natural next feature to add.
- **Currency**: defaults to INR (Rs). Change the symbol logic in
  `src/lib/utils/format.ts`.
- **Colors / fonts**: all design tokens live in `src/app/globals.css` at the
  top (`:root` block). Change the hex values there to retheme the whole app.
