import { createClient } from '@supabase/supabase-js';
import { loadLocalEnv } from './env.mjs';

loadLocalEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const moderatorEmails = (process.env.NEXT_PUBLIC_MODERATOR_EMAILS ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.');
  process.exitCode = 1;
  throw new Error('Missing Supabase environment variables.');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

function getSupabaseHost() {
  try {
    return new URL(supabaseUrl).host;
  } catch {
    return supabaseUrl;
  }
}

function formatSupabaseError(error) {
  if (!error) {
    return null;
  }

  const cause = error.cause;
  const causeCode = cause?.code;
  const causeMessage = cause?.message;
  const combinedMessage = `${error.message ?? ''}\n${error.details ?? ''}`;

  if (causeCode === 'ENOTFOUND' || combinedMessage.includes('ENOTFOUND')) {
    return `Supabase host ${getSupabaseHost()} does not resolve. Confirm NEXT_PUBLIC_SUPABASE_URL points to an active project.`;
  }

  if (
    causeCode === 'ECONNREFUSED' ||
    causeCode === 'ETIMEDOUT' ||
    causeCode === 'ECONNRESET' ||
    combinedMessage.includes('ECONNREFUSED') ||
    combinedMessage.includes('ETIMEDOUT') ||
    combinedMessage.includes('ECONNRESET')
  ) {
    return `Could not reach Supabase host ${getSupabaseHost()} (${causeCode}). Check network access and project status.`;
  }

  if (error.message === 'fetch failed' && causeMessage) {
    return `${error.message}: ${causeMessage}`;
  }

  return error.message ?? String(error);
}

const checks = [
  {
    name: 'Moderator allowlist',
    run: async () => ({
      ok: moderatorEmails.length > 0,
      detail: moderatorEmails.length
        ? `Configured for ${moderatorEmails.join(', ')}.`
        : 'Set NEXT_PUBLIC_MODERATOR_EMAILS in .env.local.',
    }),
  },
  {
    name: 'Reports table',
    run: async () => {
      const { error } = await supabase.from('reports').select('id,moderation_notes').limit(1);
      return {
        ok: !error,
        detail: formatSupabaseError(error) ?? 'public.reports is reachable.',
      };
    },
  },
  {
    name: 'Post columns',
    run: async () => {
      const { error } = await supabase
        .from('posts')
        .select('id,category,hidden,hidden_at,hidden_by,hidden_reason')
        .limit(1);

      return {
        ok: !error,
        detail: formatSupabaseError(error) ?? 'posts has category and moderation columns.',
      };
    },
  },
  {
    name: 'Comment columns',
    run: async () => {
      const { error } = await supabase
        .from('comments')
        .select('id,hidden,hidden_at,hidden_by,hidden_reason')
        .limit(1);

      return {
        ok: !error,
        detail: formatSupabaseError(error) ?? 'comments has moderation columns.',
      };
    },
  },
];

let failed = 0;

for (const check of checks) {
  const result = await check.run();
  const icon = result.ok ? 'PASS' : 'FAIL';
  console.log(`${icon} ${check.name}: ${result.detail}`);

  if (!result.ok) {
    failed += 1;
  }
}

if (failed) {
  console.log('\nNext: fix the failed item above. If the host is reachable but schema checks fail, run supabase/reports_setup.sql in Supabase SQL Editor, then rerun npm run qa:readiness.');
  process.exitCode = 1;
} else {
  console.log('\nAll readiness checks passed.');
}
