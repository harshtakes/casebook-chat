# Casebook

Casebook is an anonymous forum for Indian law students and early-career lawyers. It is built as a premium, low-friction place to post briefs, browse rooms, follow thread permalinks, report content, and moderate hidden posts or comments without exposing public email addresses.

## Stack

- Next.js 16 App Router
- React 19
- Supabase
- TypeScript

## Local Setup

Install dependencies:

```bash
npm install
```

Create `.env.local` with:

```bash
NEXT_PUBLIC_SUPABASE_URL=your-supabase-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
NEXT_PUBLIC_MODERATOR_EMAILS=you@example.com
```

`NEXT_PUBLIC_MODERATOR_EMAILS` accepts a comma-separated allowlist. Restart the dev server after changing it.

## Supabase Setup

Run `supabase/reports_setup.sql` in the Supabase SQL Editor before launch testing. The SQL creates or updates:

- reports table and moderation notes
- post category and hidden-content moderation columns
- comment hidden-content moderation columns
- database-side title/body length checks
- row-level security policies used by the current app

If old local data violates the new length checks, the SQL backfills invalid legacy rows before adding constraints.

## Development

Start the app:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Useful routes:

- `/` forum feed, composer, thread permalinks, and category filtering
- `/topics` room overview
- `/auth` Supabase auth
- `/setup` launch readiness checks
- `/moderation` report queue and hide/unhide controls

## QA

Run automated checks:

```bash
npm run lint
npm run build
npm run qa:readiness
```

`npm run qa:readiness` verifies that the configured Supabase project is reachable, the moderator allowlist exists, and the required reports/posts/comments schema is present. If it reports that the Supabase host does not resolve, confirm `NEXT_PUBLIC_SUPABASE_URL` points to an active Supabase project. If the host is reachable but schema checks fail, run `supabase/reports_setup.sql`.

For manual QA, follow `docs/QA_CHECKLIST.md` after database or moderation changes. The checklist covers:

- public anonymous posting
- thread permalinks with `?thread=...`
- topic filters with `?category=...`
- post and comment reporting
- moderator notes, status changes, and hide/unhide actions
- `/setup` readiness visibility

## Demo Data

Seed sample posts only when you intentionally want demo content in the connected Supabase project:

```bash
npm run seed:demo
```
