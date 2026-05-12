<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes - APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Project State Memory

- Product direction: anonymous forum for Indian law students and early-career lawyers, not a generic chat app.
- Current stack: Next.js 16 App Router, React 19, Supabase.
- Implemented:
  - stable `app/auth/page.tsx` route
  - cleaned feed/thread flow
  - anonymous display handles instead of raw emails in public UI
  - thread permalinks via `?thread=...`
  - reporting flow and `/moderation`
  - moderator allowlist via `NEXT_PUBLIC_MODERATOR_EMAILS`
  - moderation actions for report status, moderator notes, and hide/unhide
  - hidden posts/comments are filtered out of public views
  - post categories in composer/feed
  - `/topics` overview page
  - category-filtered feed links via `/?category=...`
  - moderation links from comment reports back to their parent thread
  - `/setup` readiness page for Supabase/env checks
  - moderator nav visibility based on allowlist
  - moderation queue status filters and hidden-content metadata
  - QA helper scripts: `npm run qa:readiness` and `npm run seed:demo`
  - QA checklist at `docs/QA_CHECKLIST.md`
  - UI/UX polish pass with responsive nav, textured background, reusable panel/button/card styles, richer feed cards, composer counters, and thread category display
  - Visual identity shifted away from orange/beige Claude-like palette toward calm sage, soft paper, brass, and sparse terracotta stamp accents
  - Current UI direction: premium, relaxed, active, easy to navigate; language leans into "briefs" and "rooms" with jewel sage, champagne, soft paper, and polished index-card interactions
  - Signature material system added: vellum/glass surfaces, folded-corner brief cards, dossier rails, sheen hover, room-card lift, aurora background
  - Gamechanger UX layer added: global Casebook Command Center via Ctrl/Cmd+K and nav trigger for quick ask, search, room jumps, setup, and moderation
  - Premium shell pass added: luxury knowledge-terminal feel with Bodoni Moda + Manrope + IBM Plex Mono, smarter nav status surfaces, a split feed hero with live signal board, and stronger shell framing
  - Major UI overhaul added: floating dock navbar, dramatic stage-led homepage, featured brief cards, navigator rail, redesigned room atlas, and cleaner premium members-club/dossier visual language
- Important setup still required in Supabase:
  - run `supabase/reports_setup.sql`
  - this SQL also adds category/hidden/moderation columns and DB-side length checks
  - SQL now backfills legacy invalid title/body lengths before adding checks
- Important env setup:
  - `NEXT_PUBLIC_MODERATOR_EMAILS=Harshvams@gmail.com` is set in `.env.local`
  - restart dev server after env changes
- Verified recently:
  - `npm run lint`
  - `npm run build`
  - `npm run qa:readiness`
