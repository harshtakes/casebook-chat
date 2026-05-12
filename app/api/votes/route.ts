import { createHash, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

type VoteValue = -1 | 1;

type VoteResult = {
  post_id: string;
  score: number;
  vote_value: VoteValue;
  changed: boolean;
};

type VoterVoteResult = {
  post_id: string;
  vote_value: VoteValue;
};

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables.');
  }

  return createClient(supabaseUrl, supabaseAnonKey);
}

function getClientIp(request: Request) {
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return (
    forwardedFor ||
    request.headers.get('x-real-ip') ||
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

function getCookie(request: Request, name: string) {
  const cookieHeader = request.headers.get('cookie') ?? '';
  const cookies = cookieHeader.split(';').map((cookie) => cookie.trim());
  const match = cookies.find((cookie) => cookie.startsWith(`${name}=`));

  return match ? decodeURIComponent(match.slice(name.length + 1)) : '';
}

function getVoterId(request: Request) {
  return getCookie(request, 'casebook_voter') || randomUUID();
}

function getVoterKey(request: Request, voterId: string) {
  const salt = process.env.VOTE_IP_SALT || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'casebook-chat';
  const ip = getClientIp(request);

  return createHash('sha256').update(`${salt}:${voterId}:${ip}`).digest('hex');
}

function jsonWithVoterCookie(body: unknown, voterId: string, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.cookies.set('casebook_voter', voterId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 365,
    path: '/',
  });

  return response;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const postIds = (searchParams.get('postIds') ?? '')
    .split(',')
    .map((postId) => postId.trim())
    .filter(Boolean)
    .slice(0, 50);

  if (postIds.length === 0) {
    return NextResponse.json({ votes: {} });
  }

  const voterId = getVoterId(request);

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.rpc('get_post_votes_for_voter', {
      p_post_ids: postIds,
      p_voter_key: getVoterKey(request, voterId),
    });

    if (error) {
      return jsonWithVoterCookie({ votes: {} }, voterId);
    }

    const votes = ((data ?? []) as VoterVoteResult[]).reduce<Record<string, VoteValue>>((accumulator, row) => {
      accumulator[row.post_id] = row.vote_value;
      return accumulator;
    }, {});

    return jsonWithVoterCookie({ votes }, voterId);
  } catch {
    return jsonWithVoterCookie({ votes: {} }, voterId);
  }
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid vote request.' }, { status: 400 });
  }

  const { postId, vote } = body as { postId?: unknown; vote?: unknown };

  if (typeof postId !== 'string' || !postId) {
    return NextResponse.json({ error: 'Missing post id.' }, { status: 400 });
  }

  if (vote !== -1 && vote !== 1) {
    return NextResponse.json({ error: 'Vote must be an upvote or downvote.' }, { status: 400 });
  }

  const voterId = getVoterId(request);

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .rpc('cast_post_vote', {
        p_post_id: postId,
        p_value: vote,
        p_voter_key: getVoterKey(request, voterId),
      })
      .single<VoteResult>();

    if (error || !data) {
      return jsonWithVoterCookie(
        { error: error?.message ?? 'Vote could not be recorded.' },
        voterId,
        { status: 500 },
      );
    }

    return jsonWithVoterCookie({
      postId: data.post_id,
      upvotes: data.score,
      vote: data.vote_value,
      changed: data.changed,
    }, voterId);
  } catch (error) {
    return jsonWithVoterCookie(
      { error: error instanceof Error ? error.message : 'Vote could not be recorded.' },
      voterId,
      { status: 500 },
    );
  }
}
