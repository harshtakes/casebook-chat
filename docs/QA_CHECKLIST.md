# Casebook QA Checklist

Use this after database or moderation changes.

## Setup

- Run `npm run qa:readiness`.
- If readiness fails, run `supabase/reports_setup.sql` in the Supabase SQL editor.
- Restart `npm run dev` after changing `.env.local`.
- Confirm `/setup` shows all checks as ready.

## Public Forum Flow

- Open `/`.
- Click `Ask anonymously` while signed out.
- Create a post with a title longer than 12 characters.
- Confirm the post appears without exposing an email address.
- Open the post and confirm the URL changes to `/?thread=<id>`.
- Add a reply and confirm the reply count updates.
- Copy/share a thread link and reopen it in a new tab.

## Topic Flow

- Open `/topics`.
- Confirm all topic cards render.
- Click `View all in feed`.
- Confirm the feed opens with `/?category=<topic>`.
- Clear the topic filter and confirm the full feed returns.

## Reporting Flow

- Sign in as any user.
- Report a post.
- Report a comment.
- Confirm report submission succeeds without exposing raw emails in the public UI.

## Moderation Flow

- Sign in with an email listed in `NEXT_PUBLIC_MODERATOR_EMAILS`.
- Open `/moderation`.
- Filter by `open`, `reviewed`, `dismissed`, and `all`.
- Save a moderator note.
- Hide a reported post and confirm it disappears from `/`.
- Unhide the post and confirm it returns.
- Hide a reported comment and confirm it disappears from the thread.
- Open a comment report and confirm `Open thread` goes to the parent thread.

## Seed Data

- Run `npm run seed:demo` only when you want sample posts in the connected Supabase project.
- After seeding, open `/topics` and verify the demo topic counts.
