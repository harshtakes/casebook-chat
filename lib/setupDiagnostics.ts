import { supabase } from '@/lib/supabase';

export type SetupStatus = 'ready' | 'warning' | 'blocked';

export type SetupCheck = {
  id: string;
  label: string;
  status: SetupStatus;
  detail: string;
};

function isMissingSchema(errorMessage = '') {
  const normalizedMessage = errorMessage.toLowerCase();
  return normalizedMessage.includes('public.reports') || normalizedMessage.includes('schema cache') || normalizedMessage.includes('column');
}

function isConnectionError(error?: { message?: string; details?: string } | null) {
  const normalizedMessage = `${error?.message ?? ''}\n${error?.details ?? ''}`.toLowerCase();
  return normalizedMessage.includes('fetch failed') || normalizedMessage.includes('failed to fetch') || normalizedMessage.includes('enotfound');
}

function getSupabaseHost() {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').host;
  } catch {
    return 'the configured Supabase host';
  }
}

function formatSetupError(error?: { message?: string; details?: string } | null) {
  if (isConnectionError(error)) {
    return `Supabase host ${getSupabaseHost()} cannot be reached. Confirm NEXT_PUBLIC_SUPABASE_URL points to an active project, then rerun readiness.`;
  }

  return error?.message ?? '';
}

export async function getSetupChecks(): Promise<SetupCheck[]> {
  const moderatorEmails = (process.env.NEXT_PUBLIC_MODERATOR_EMAILS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  const [reportsResponse, postsResponse, commentsResponse] = await Promise.all([
    supabase.from('reports').select('id,moderation_notes').limit(1),
    supabase.from('posts').select('id,category,hidden,hidden_at,hidden_by,hidden_reason').limit(1),
    supabase.from('comments').select('id,hidden,hidden_at,hidden_by,hidden_reason').limit(1),
  ]);

  return [
    {
      id: 'moderator-env',
      label: 'Moderator allowlist',
      status: moderatorEmails.length ? 'ready' : 'blocked',
      detail: moderatorEmails.length
        ? `${moderatorEmails.join(', ')} can access moderation after signing in.`
        : 'Set NEXT_PUBLIC_MODERATOR_EMAILS in .env.local and restart the dev server.',
    },
    {
      id: 'reports-table',
      label: 'Reports table',
      status: reportsResponse.error ? 'blocked' : 'ready',
      detail: reportsResponse.error && isMissingSchema(reportsResponse.error.message)
        ? 'Run supabase/reports_setup.sql in Supabase to create public.reports.'
        : formatSetupError(reportsResponse.error) || 'Report submission and moderation queue are reachable.',
    },
    {
      id: 'posts-columns',
      label: 'Post moderation/category columns',
      status: postsResponse.error ? (isConnectionError(postsResponse.error) ? 'blocked' : 'warning') : 'ready',
      detail: postsResponse.error && isMissingSchema(postsResponse.error.message)
        ? 'Run supabase/reports_setup.sql so categories and hidden-post filtering persist.'
        : formatSetupError(postsResponse.error) || 'Posts support category and hidden moderation metadata.',
    },
    {
      id: 'comments-columns',
      label: 'Comment moderation columns',
      status: commentsResponse.error ? (isConnectionError(commentsResponse.error) ? 'blocked' : 'warning') : 'ready',
      detail: commentsResponse.error && isMissingSchema(commentsResponse.error.message)
        ? 'Run supabase/reports_setup.sql so hidden comments can be filtered publicly.'
        : formatSetupError(commentsResponse.error) || 'Comments support hidden moderation metadata.',
    },
  ];
}
