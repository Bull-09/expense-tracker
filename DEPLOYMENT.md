# Deployment Guide

This app should go live with:

- Supabase for Postgres and Auth
- Vercel for the Next.js app
- Render only if you later add a separate backend service

## 1. Create Supabase

1. Create a project at https://supabase.com.
2. Open `supabase/schema.sql`, copy the whole file, and run it in Supabase SQL Editor.
3. Go to Authentication -> Providers and keep Email enabled.
4. For a small shared app, optionally disable email confirmation under Authentication -> Settings.
5. Go to Settings -> API and copy:
   - Project URL
   - anon public key

Never use the `service_role` key in this app or in Vercel public env vars.

## 2. Configure Local Env

Copy the sample file and paste your Supabase values:

```bash
cp .env.local.example .env.local
```

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
```

Check locally:

```bash
npm install
npm run lint
npm run build
npm run dev
```

## 3. Push To GitHub

This folder is not a Git repo yet. From the project root:

```bash
git init
git add .
git commit -m "Initial commit: Ledger expense tracker"
```

Then create a GitHub repo and push it. With GitHub CLI:

```bash
gh repo create ledger-expense-tracker --private --source=. --push
```

## 4. Deploy To Vercel

1. Go to https://vercel.com/new.
2. Import the GitHub repo.
3. Keep the framework as Next.js.
4. Add these Environment Variables for Production, Preview, and Development:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. Deploy.

Vercel build settings can stay at their defaults:

- Install Command: `npm install`
- Build Command: `npm run build`
- Output Directory: Next.js default

## 5. Configure Supabase Auth URLs

After Vercel gives you a production URL, go back to Supabase:

1. Authentication -> URL Configuration
2. Set Site URL to your Vercel production URL, for example:
   `https://ledger-expense-tracker.vercel.app`
3. Add Redirect URLs:
   - `http://localhost:3000/**`
   - `https://your-vercel-project.vercel.app/**`
   - Any custom domain you add later, such as `https://expenses.example.com/**`
4. If you want friends to sign up without waiting for email confirmation, go to
   Authentication -> Providers -> Email, turn off "Confirm email", and save.

If email confirmation stays on, test a fresh signup after changing these URLs.
Old confirmation emails may still point at `localhost:3000` and can be ignored.

## 6. Share With Friends

After Vercel finishes deploying:

1. Open the production Vercel URL.
2. Create or sign into your account.
3. Go to Settings -> Share with friends.
4. Copy or share the app link.

Anyone who signs up with that link appears in the split picker, so shared
expenses can be assigned to them.

## 7. When Render Is Needed

Do not deploy this current app to Render unless you specifically want to run
Next.js as a Node server there. Vercel is the cleanest host for this project.

Render becomes useful later if you add something like:

- A separate Express/Fastify API
- Background jobs
- Webhook workers
- A long-running service that is not part of Next.js

For the current codebase, Supabase + Vercel is enough.
