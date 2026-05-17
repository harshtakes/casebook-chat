'use client';

/*
 * SUPABASE MIGRATION REQUIRED — run this once in your Supabase SQL editor:
 *
 *   create table if not exists reports (
 *     id          uuid primary key default gen_random_uuid(),
 *     target_id   text not null,
 *     target_type text not null check (target_type in ('post','comment')),
 *     title       text,
 *     body        text,
 *     author      text,
 *     reason      text not null,
 *     status      text not null default 'pending' check (status in ('pending','dismissed','removed')),
 *     created_at  timestamptz default now()
 *   );
 *   alter table reports enable row level security;
 *   -- Allow anyone to insert (report), only authenticated to read
 *   create policy "insert_reports" on reports for insert with check (true);
 *   create policy "read_reports"   on reports for select using (auth.role() = 'authenticated');
 *   create policy "update_reports" on reports for update using (auth.role() = 'authenticated');
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import ThreadPanel from '@/components/home/ThreadPanel';

/* ── TYPES ── */
type Post = {
  id: string;
  title: string;
  body: string;
  author: string;
  created_at: string;
  mood: string;
  category?: string;           // FIX #4: was missing, ThreadPanel needs it
  reply_count: number;
  upvotes: number;
};

// FIX #4: ReportTarget was only in @/components/home/types — define locally so we can pass onReport
type ReportTarget = {
  id: string;
  type: 'post' | 'comment';
  title: string;
  body: string;
  author: string;
};

type TickerItem = { id: string; tag: string; text: string; created_at: string };
type Sort = 'hot' | 'new' | 'top' | 'unanswered' | 'all';
type VoteValue = -1 | 1;
type VoteState = 0 | VoteValue;

/* ── CONSTANTS ── */
const MOOD_COLORS: Record<string, string> = {
  hot:      '#C06B4C',
  answered: '#176B60',
  debated:  '#A84335',
  neutral:  '#817567',
};
const MOOD_BG: Record<string, string> = {
  hot:      '#F6E7DF',
  answered: '#E8F5EF',
  debated:  '#F7E8E2',
  neutral:  '#EEE5D3',
};
const MOOD_LABEL: Record<string, string> = {
  hot:      'Hot topic',
  answered: 'Answered',
  debated:  'Debated',
  neutral:  'Open',
};

// Fallback shown while DB loads or if ticker table is empty
const TICKER_FALLBACK = [
  { id: 'f1', tag: 'Recruitment', text: 'Application windows opening next month',         created_at: '' },
  { id: 'f2', tag: 'Salaries',    text: 'NQ pay reviewed upward at several Tier-1 firms', created_at: '' },
  { id: 'f3', tag: 'Internships', text: 'Spring vacation scheme places still available',  created_at: '' },
  { id: 'f4', tag: 'LLM Abroad',  text: 'Columbia scholarship data published',            created_at: '' },
  { id: 'f5', tag: 'Moot Court',  text: 'Vis East registrations now open',               created_at: '' },
  { id: 'f6', tag: 'Litigation',  text: 'District court practice guides updated',         created_at: '' },
] satisfies TickerItem[];

// FIX #10: ROOM_NAMES drives sidebar order; live counts fetched from DB
const ROOM_NAMES = ['Recruitment', 'Salaries', 'LLM Abroad', 'Internships', 'Litigation', 'Moot Court'];

// BARO_HEIGHTS and HEAT_LEVELS are now computed from live DB data
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VOTE_STORAGE_KEY = 'casebook:votes';

const postCache: Partial<Record<Sort, { posts: Post[]; ts: number }>> = {};
const CACHE_TTL = 60_000;

/* ── HELPERS ── */
function samplePosts(): Post[] {
  const now = Date.now();
  return [
    {
      id: 'sample-1',
      title: 'Tier-1 corporate team or disputes boutique after graduation?',
      body: 'The brand name is tempting, but the boutique seems to give juniors real drafting and court exposure earlier. What tradeoff actually matters two years in?',
      author: 'sample1@casebook.chat',
      created_at: new Date(now - 1000 * 60 * 42).toISOString(),
      mood: 'hot', reply_count: 14, upvotes: 89,
    },
    {
      id: 'sample-2',
      title: 'How do you ask for real feedback after an internship without sounding desperate?',
      body: 'I did the work, got polite comments, but no concrete improvement notes. Is there a way to ask seniors for useful feedback without making it awkward?',
      author: 'sample2@casebook.chat',
      created_at: new Date(now - 1000 * 60 * 60 * 3).toISOString(),
      mood: 'answered', reply_count: 22, upvotes: 71,
    },
    {
      id: 'sample-3',
      title: 'Is an expensive foreign LLM worth it without scholarship money?',
      body: 'Everyone talks about the network, but the debt number is terrifying. I want honest numbers from people who came back to India after doing it.',
      author: 'sample3@casebook.chat',
      created_at: new Date(now - 1000 * 60 * 60 * 9).toISOString(),
      mood: 'debated', reply_count: 7, upvotes: 46,
    },
    {
      id: 'sample-4',
      title: 'First-generation law student here. How do I learn the hidden rules?',
      body: 'I understand classes and internships. I do not understand how people know which seniors to email, which firms to avoid, and what matters on a CV.',
      author: 'sample4@casebook.chat',
      created_at: new Date(now - 1000 * 60 * 60 * 20).toISOString(),
      mood: 'hot', reply_count: 18, upvotes: 104,
    },
    {
      id: 'sample-5',
      title: 'Moot court burnout is real. When is it okay to step back?',
      body: 'I love the work, but the team dynamic has become intense and my semester is slipping. Will quitting one moot hurt future applications?',
      author: 'sample5@casebook.chat',
      created_at: new Date(now - 1000 * 60 * 60 * 31).toISOString(),
      mood: 'neutral', reply_count: 0, upvotes: 19,
    },
  ];
}

const ADJ  = ['Amber','Quiet','Candid','Steady','Lucid','Sharp','Grounded','Steady'];
const NOUN = ['Brief','Quill','Atlas','Verdict','Harbor','Ledger','Signal','Clover'];

function getHandle(author: string): string {
  if (author?.startsWith('alias:')) return author.slice('alias:'.length);
  let h = 0;
  const s = (author || 'anonymous').trim();
  for (let i = 0; i < s.length; i++) h = ((h * 31) + s.charCodeAt(i)) >>> 0;
  return `${ADJ[h % 8]} ${NOUN[Math.floor(h / 8) % 8]} ${String(h % 1000).padStart(3, '0')}`;
}

function randomAnonymousAuthor(): string {
  const adjective = ADJ[Math.floor(Math.random() * ADJ.length)];
  const noun = NOUN[Math.floor(Math.random() * NOUN.length)];
  const suffix = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  return `alias:${adjective} ${noun} ${suffix}`;
}

function readStoredVotes(): Partial<Record<string, VoteValue>> {
  if (typeof window === 'undefined') return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(VOTE_STORAGE_KEY) ?? '{}') as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter(([, v]) => v === 1 || v === -1),
    ) as Partial<Record<string, VoteValue>>;
  } catch {
    return {};
  }
}

function writeStoredVote(postId: string, vote: VoteValue) {
  if (typeof window === 'undefined') return;
  const votes = readStoredVotes();
  votes[postId] = vote;
  window.localStorage.setItem(VOTE_STORAGE_KEY, JSON.stringify(votes));
}

function timeAgo(ts: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 1000));
  if (s < 60)    return `${s}s`;
  if (s < 3600)  return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

/* ─────────────────────────────────────────────
   MAIN PAGE
───────────────────────────────────────────── */
export default function HomePage() {
  const { user } = useAuth();

  const [posts,         setPosts]         = useState<Post[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [sort,          setSort]          = useState<Sort>('hot');
  const [query,         setQuery]         = useState('');
  const [searchResults, setSearchResults] = useState<Post[] | null>(null); // FIX #7: server-side search
  const [showModal,     setShowModal]     = useState(false);
  const [showCmd,       setShowCmd]       = useState(false);
  const [toast,         setToast]         = useState('');
  const [form,          setForm]          = useState({ title: '', body: '', mood: 'neutral', category: '' });
  const [submitting,    setSubmitting]    = useState(false);
  const [selectedPost,  setSelectedPost]  = useState<Post | null>(null);
  const [localVotes,    setLocalVotes]    = useState<Partial<Record<string, VoteValue>>>({});
  const [pendingVotes,  setPendingVotes]  = useState<Partial<Record<string, boolean>>>({});
  // FIX #10: live room counts from DB instead of hardcoded values
  const [roomCounts,    setRoomCounts]    = useState<Record<string, number>>({});
  // LIVE SIDEBAR DATA
  const [baroHeights,   setBaroHeights]   = useState<number[]>([22, 35, 18, 44, 28, 56, 64]); // seeded; replaced on load
  const [heatLevels,    setHeatLevels]    = useState<number[]>(Array(35).fill(0));
  const [allMoodCounts, setAllMoodCounts] = useState<Record<string, number>>({});
  const [activeRoom,    setActiveRoom]    = useState<string | null>(null);
  // Ticker
  const [tickerItems,   setTickerItems]   = useState<TickerItem[]>(TICKER_FALLBACK);
  const [showTickerMgr, setShowTickerMgr] = useState(false);
  const [tickerForm,    setTickerForm]    = useState({ tag: '', text: '' });
  const [tickerSaving,  setTickerSaving]  = useState(false);

  // Report modal
  const [reportTarget,     setReportTarget]     = useState<ReportTarget | null>(null);
  const [reportReason,     setReportReason]     = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);

  // Admin moderation panel
  // FIX: ReportRow must be standalone — ReportTarget.id conflicts with report's own id,
  //      and DB returns target_id / target_type (not id / type).
  type ReportRow = {
    id:          string;                              // report UUID
    target_id:   string;                             // post or comment UUID
    target_type: 'post' | 'comment';
    title:       string;
    body:        string;
    author:      string;
    reason:      string;
    created_at:  string;
    status:      'pending' | 'dismissed' | 'removed';
  };
  const [reports,              setReports]              = useState<ReportRow[]>([]);
  const [reportFilter,         setReportFilter]         = useState<'pending'|'dismissed'|'removed'|'all'>('pending');
  const [showModerationPanel,  setShowModerationPanel]  = useState(false);
  const [moderating,           setModerating]           = useState<string | null>(null);
  // keep pendingReports as a derived view for the badge count
  const pendingReports = reports.filter(r => r.status === 'pending');

  const inFlight       = useRef<Set<string>>(new Set());
  const localVotesRef  = useRef<Partial<Record<string, VoteValue>>>({});
  const liveScoresRef  = useRef<Record<string, number>>({});
  const toastTimer     = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined); // FIX #7
  const moodCanvasRef  = useRef<HTMLCanvasElement>(null);
  const lastPostAtRef  = useRef<number>(0); // rate-limit: ms timestamp of last submission

  /* ── fetch ── */
  const fetchPosts = useCallback(async (opts?: { backgroundRefresh?: boolean }) => {
    const cached = postCache[sort];
    const now = Date.now();

    if (cached && now - cached.ts < CACHE_TTL) {
      setPosts(cached.posts);
      setLoading(false);
      return;
    }

    if (cached && !opts?.backgroundRefresh) {
      setPosts(cached.posts);
      setLoading(false);
      void fetchPosts({ backgroundRefresh: true });
      return;
    }

    if (!opts?.backgroundRefresh) setLoading(true);

    let q = supabase.from('posts').select('*');
    if (sort === 'hot')             q = q.eq('mood', 'hot').order('upvotes', { ascending: false });
    else if (sort === 'top')        q = q.order('upvotes', { ascending: false });
    else if (sort === 'unanswered') q = q.eq('reply_count', 0).order('created_at', { ascending: false });
    else                            q = q.order('created_at', { ascending: false });

    const { data, error } = await q.limit(20);
    const result = !error && data ? data as Post[] : samplePosts();

    postCache[sort] = { posts: result, ts: Date.now() };
    result.forEach(p => { liveScoresRef.current[p.id] = p.upvotes; });
    setPosts(result);
    setLoading(false);
  }, [sort]);

  useEffect(() => {
    const id = window.setTimeout(() => { void fetchPosts(); }, 0);
    return () => window.clearTimeout(id);
  }, [fetchPosts]);

  /* ── load stored + server votes ── */
  useEffect(() => {
    const persistedIds = posts.map(p => p.id).filter(id => UUID_PATTERN.test(id));
    if (persistedIds.length === 0) return;

    const controller = new AbortController();
    const storedVotes = readStoredVotes();
    const visibleStored = Object.fromEntries(
      persistedIds.filter(id => storedVotes[id]).map(id => [id, storedVotes[id] as VoteValue]),
    );

    const storedTimer = window.setTimeout(() => {
      if (Object.keys(visibleStored).length && !controller.signal.aborted) {
        setLocalVotes(cur => ({ ...cur, ...visibleStored }));
      }
    }, 0);

    async function loadVoteState() {
      const params = new URLSearchParams({ postIds: persistedIds.join(',') });
      const res = await fetch(`/api/votes?${params}`, { signal: controller.signal });
      const payload = await res.json().catch(() => null) as { votes?: Record<string, VoteValue> } | null;
      if (!controller.signal.aborted && payload?.votes) {
        setLocalVotes(cur => ({ ...cur, ...payload.votes }));
      }
    }
    void loadVoteState();

    return () => { window.clearTimeout(storedTimer); controller.abort(); };
  }, [posts]);

  /* ── server-side search (FIX #7) ── */
  useEffect(() => {
    if (!query.trim()) {
      setSearchResults(null);
      return;
    }
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(async () => {
      const { data } = await supabase
        .from('posts')
        .select('*')
        .or(`title.ilike.%${query}%,body.ilike.%${query}%`)
        .limit(30);
      if (data) setSearchResults(data as Post[]);
    }, 350);
    return () => clearTimeout(searchTimerRef.current);
  }, [query]);

  /* ── live sidebar data: activity, heat, mood, rooms ── */
  useEffect(() => {
    async function fetchSidebarData() {
      // Single query: grab created_at, mood, category for all posts
      const { data } = await supabase
        .from('posts')
        .select('created_at, mood, category');
      if (!data) return;

      const now = Date.now();
      const DAY = 86_400_000;

      // ── Activity barograph: posts per day for last 7 days ──
      const barBuckets = Array(7).fill(0);
      // ── Heat map: posts per day for last 35 days ──
      const heatBuckets = Array(35).fill(0);
      // ── Mood counts (all posts, not just the loaded 20) ──
      const moodCounts: Record<string, number> = {};
      // ── Room counts ──
      const roomC: Record<string, number> = {};

      for (const row of data as { created_at: string; mood: string; category?: string }[]) {
        const age = now - new Date(row.created_at).getTime();
        const dayIdx = Math.floor(age / DAY);

        if (dayIdx < 7)  barBuckets[6 - dayIdx]++;
        if (dayIdx < 35) heatBuckets[34 - dayIdx]++;

        moodCounts[row.mood] = (moodCounts[row.mood] ?? 0) + 1;
        if (row.category) roomC[row.category] = (roomC[row.category] ?? 0) + 1;
      }

      // Normalise bar heights to px (max 64px)
      const barMax = Math.max(...barBuckets, 1);
      setBaroHeights(barBuckets.map(n => Math.round((n / barMax) * 64) || 4));

      // Normalise heat to 0-4
      const heatMax = Math.max(...heatBuckets, 1);
      setHeatLevels(heatBuckets.map(n => Math.min(4, Math.round((n / heatMax) * 4))));

      setAllMoodCounts(moodCounts);
      setRoomCounts(roomC);
    }
    void fetchSidebarData();
  }, []);

  /* ── mood donut — redraws on allMoodCounts (all posts, not just page) ── */
  useEffect(() => {
    const canvas = moodCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const moods = ['hot', 'answered', 'debated', 'neutral'];
    // Fall back to 1 per slice so the donut always shows something before data loads
    const counts = moods.reduce((acc, m) => {
      acc[m] = allMoodCounts[m] || 1;
      return acc;
    }, {} as Record<string, number>);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    let start = -Math.PI / 2;
    const cx = 40, cy = 40, r = 34;
    ctx.clearRect(0, 0, 80, 80);
    moods.forEach(m => {
      const sweep = (counts[m] / total) * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, start, start + sweep);
      ctx.closePath(); ctx.fillStyle = MOOD_COLORS[m]; ctx.fill();
      start += sweep;
    });
    ctx.beginPath(); ctx.arc(cx, cy, 20, 0, Math.PI * 2);
    ctx.fillStyle = '#F2ECDF'; ctx.fill();
  }, [allMoodCounts]);

  /* ── toast ── */
  // FIX: made useCallback so handleShare / handleReport can safely depend on it
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2200);
  }, []);

  /* ── submit post (FIX #8, #9) ── */
  async function submitPost() {
    if (!form.title.trim()) return;
    if (form.title.trim().length < 10) {
      showToast('Title must be at least 10 characters.');
      return; // FIX #9: removed stray setSubmitting(false) that ran before setSubmitting(true)
    }
    // Rate limit: one post per 60 seconds per session
    const now = Date.now();
    const RATE_MS = 60_000;
    if (now - lastPostAtRef.current < RATE_MS) {
      const secsLeft = Math.ceil((RATE_MS - (now - lastPostAtRef.current)) / 1000);
      showToast(`Please wait ${secsLeft}s before posting again.`);
      return;
    }
    setSubmitting(true);
    try { // FIX #8: try/finally so button never gets stuck
      const newPost = {
        title: form.title, body: form.body,
        author: randomAnonymousAuthor(),
        mood: form.mood, upvotes: 0, reply_count: 0,
        ...(form.category ? { category: form.category } : {}),
      };
      const { data, error } = await supabase
        .from('posts').insert(newPost).select('*').single();

      if (error || !data) {
        showToast(error?.message ?? 'Brief could not be recorded.');
        return;
      }

      const visiblePost = data as Post;
      setPosts(cur => [visiblePost, ...cur]);
      delete postCache[sort];
      delete postCache['all'];
      delete postCache['new'];
      setForm({ title: '', body: '', mood: 'neutral', category: '' });
      lastPostAtRef.current = Date.now();
      setShowModal(false);
      showToast('Brief posted anonymously');
      void fetchPosts();
    } finally {
      setSubmitting(false);
    }
  }

  /* ── vote (FIX #5) ── */
  async function voteOnPost(e: React.MouseEvent, post: Post, vote: VoteValue) {
    e.stopPropagation();

    if (!UUID_PATTERN.test(post.id)) {
      showToast('Voting works on recorded briefs.');
      return;
    }

    if (inFlight.current.has(post.id)) return;

    const previousVote: VoteState = localVotesRef.current[post.id] ?? 0;
    if (previousVote === vote) {
      showToast(vote === 1 ? 'Already upvoted.' : 'Already downvoted.');
      return;
    }

    inFlight.current.add(post.id);
    localVotesRef.current[post.id] = vote;

    const currentScore = liveScoresRef.current[post.id] ?? post.upvotes;
    const optimisticScore = currentScore + vote - previousVote;
    liveScoresRef.current[post.id] = optimisticScore;

    setLocalVotes(cur => ({ ...cur, [post.id]: vote }));
    setPendingVotes(cur => ({ ...cur, [post.id]: true }));
    setPosts(cur => cur.map(p => p.id === post.id ? { ...p, upvotes: optimisticScore } : p));

    const res = await fetch('/api/votes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postId: post.id, vote }),
    });
    const payload = await res.json().catch(() => null) as
      | { upvotes?: number; vote?: VoteValue; changed?: boolean; error?: string }
      | null;

    inFlight.current.delete(post.id);
    setPendingVotes(prev => { const n = { ...prev }; delete n[post.id]; return n; });

    if (res.ok && typeof payload?.upvotes === 'number') {
      liveScoresRef.current[post.id] = payload.upvotes;
      setPosts(cur => cur.map(p => p.id === post.id ? { ...p, upvotes: payload.upvotes as number } : p));
      writeStoredVote(post.id, vote);
      showToast(payload.changed === false ? 'Already recorded.' : 'Vote recorded.');
    } else {
      const { error: fallbackErr } = await supabase
        .from('posts').update({ upvotes: optimisticScore }).eq('id', post.id);

      if (!fallbackErr) {
        writeStoredVote(post.id, vote);
        showToast('Vote recorded.');
      } else {
        // Revert — FIX #5: was `previousVote || undefined as unknown as VoteValue`
        liveScoresRef.current[post.id] = currentScore;
        if (previousVote) {
          localVotesRef.current[post.id] = previousVote;
        } else {
          delete localVotesRef.current[post.id];
        }
        setPosts(cur => cur.map(p => p.id === post.id ? { ...p, upvotes: currentScore } : p));
        setLocalVotes(cur => {
          const n = { ...cur };
          if (!previousVote) delete n[post.id]; else n[post.id] = previousVote;
          return n;
        });
        showToast(payload?.error ?? 'Could not record that vote.');
      }
    }
  }

  /* ── share handler (FIX #1 — ThreadPanel now wired) ── */
  const handleShare = useCallback(async (postId: string) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/?post=${postId}`);
      showToast('Link copied to clipboard.');
    } catch {
      showToast('Could not copy link.');
    }
  }, [showToast]);

  /* ── report handler — opens reason-selection modal ── */
  const handleReport = useCallback((target: ReportTarget) => {
    setReportTarget(target);
    setReportReason('');
  }, []);

  /* ── submitReport — inserts with reason, deduplicates ── */
  const submitReport = useCallback(async () => {
    if (!reportTarget || !reportReason) return;
    setReportSubmitting(true);
    try {
      // Check for duplicate report from this browser session
      const storageKey = `casebook:reported:${reportTarget.id}`;
      if (typeof window !== 'undefined' && window.localStorage.getItem(storageKey)) {
        showToast("You've already reported this content.");
        setReportTarget(null);
        return;
      }

      const { error } = await supabase.from('reports').insert({
        target_id:   reportTarget.id,
        target_type: reportTarget.type,
        title:       reportTarget.title,
        body:        reportTarget.body,
        author:      reportTarget.author,
        reason:      reportReason,
        status:      'pending',
      });

      if (error) {
        // Graceful fallback if table doesn't exist yet
        console.error('Report insert failed:', error.message);
        showToast('Could not submit report. Please try again.');
        return;
      }

      // Mark as reported in localStorage to prevent spam
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(storageKey, '1');
      }
      setReportTarget(null);
      showToast("Report submitted — we'll review it shortly.");
    } finally {
      setReportSubmitting(false);
    }
  }, [reportTarget, reportReason, showToast]);

  /* ── fetch reports (admin only) — all statuses so history is visible ── */
  const fetchPendingReports = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('reports')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (!error && data) setReports(data as ReportRow[]);
  }, [user]);

  useEffect(() => {
    if (user) void fetchPendingReports();
  }, [user, fetchPendingReports]);

  /* ── moderate: dismiss or remove ── */
  const moderateReport = useCallback(async (reportId: string, targetId: string, action: 'dismissed' | 'removed') => {
    setModerating(reportId);
    try {
      // Update report status
      await supabase.from('reports').update({ status: action }).eq('id', reportId);

      if (action === 'removed') {
        // Soft-delete: update post or comment as removed
        const report = reports.find(r => r.id === reportId);
        if (report?.target_type === 'post') {
          await supabase.from('posts').update({ body: '[removed by moderator]', title: '[removed]' }).eq('id', targetId);
          setPosts(cur => cur.map(p => p.id === targetId ? { ...p, title: '[removed]', body: '[removed by moderator]' } : p));
        } else if (report?.target_type === 'comment') {
          await supabase.from('comments').update({ body: '[removed by moderator]' }).eq('id', targetId);
        }
        showToast('Content removed.');
      } else {
        showToast('Report dismissed.');
      }

      // Update local state — keep the row but change its status so filter tabs work
      setReports(cur => cur.map(r => r.id === reportId ? { ...r, status: action } : r));
    } finally {
      setModerating(null);
    }
  }, [reports, showToast]);

  /* ── ticker: fetch from DB ── */
  useEffect(() => {
    async function fetchTicker() {
      const { data } = await supabase
        .from('ticker_items')
        .select('*')
        .order('created_at', { ascending: true });
      if (data && (data as TickerItem[]).length > 0) {
        setTickerItems(data as TickerItem[]);
      }
    }
    void fetchTicker();
  }, []);

  /* ── ticker: add item ── */
  const addTickerItem = useCallback(async () => {
    const tag  = tickerForm.tag.trim();
    const text = tickerForm.text.trim();
    if (!tag || !text) { showToast('Both tag and text are required.'); return; }
    setTickerSaving(true);
    const { data, error } = await supabase
      .from('ticker_items')
      .insert({ tag, text })
      .select('*')
      .single();
    setTickerSaving(false);
    if (error || !data) {
      showToast(error?.message ?? 'Could not save ticker item.');
      return;
    }
    setTickerItems(cur => [...cur.filter(t => !t.id.startsWith('f')), data as TickerItem]);
    setTickerForm({ tag: '', text: '' });
    showToast('Ticker item added.');
  }, [tickerForm, showToast]);

  /* ── ticker: delete item ── */
  const deleteTickerItem = useCallback(async (id: string) => {
    if (id.startsWith('f')) {
      // fallback item — just remove from local state
      setTickerItems(cur => cur.filter(t => t.id !== id));
      return;
    }
    const { error } = await supabase.from('ticker_items').delete().eq('id', id);
    if (error) { showToast('Could not delete item.'); return; }
    setTickerItems(cur => cur.filter(t => t.id !== id));
    showToast('Item removed from ticker.');
  }, [showToast]);

  /* ── openAsk ── */
  const openAsk = useCallback(() => { setShowModal(true); }, []);

  /* ── keyboard + event bridge ── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !['INPUT','TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault(); setShowCmd(true);
      }
      if (e.key === 'Escape') { setShowCmd(false); setShowModal(false); }
    };
    const onAsk = () => openAsk();
    window.addEventListener('keydown', onKey);
    window.addEventListener('openAskModal', onAsk);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('openAskModal', onAsk); };
  }, [openAsk]);

  /* ── deep-link: open thread from ?post=<id> on load ── */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const postId = params.get('post');
    if (!postId) return;
    // Try to find in already-loaded posts first, else fetch directly
    async function openDeepLinkedPost() {
      // Wait briefly for initial posts to load
      await new Promise(r => setTimeout(r, 800));
      const existing = posts.find(p => p.id === postId);
      if (existing) { setSelectedPost(existing); return; }
      const { data } = await supabase.from('posts').select('*').eq('id', postId).single();
      if (data) setSelectedPost(data as Post);
    }
    void openDeepLinkedPost();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally run once on mount

  /* ── scroll restoration: save position before opening thread ── */
  const scrollYRef = useRef(0);

  /* ── scroll: float btn + read progress ── */
  useEffect(() => {
    const onScroll = () => {
      const fab  = document.getElementById('floatAsk');
      const prog = document.getElementById('readProg');
      if (fab)  fab.classList.toggle('show', window.scrollY > 200);
      if (prog) {
        const d = document.documentElement.scrollHeight - window.innerHeight;
        prog.style.width = (d > 0 ? (window.scrollY / d) * 100 : 0) + '%';
      }
    };
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  /* ── filtered posts (FIX #7: server search + room filter) ── */
  const filtered = (query.trim() && searchResults !== null ? searchResults : posts)
    .filter(p => {
      const matchesQuery = !query ||
        p.title.toLowerCase().includes(query.toLowerCase()) ||
        (p.body ?? '').toLowerCase().includes(query.toLowerCase());
      const matchesRoom = !activeRoom || p.category === activeRoom;
      return matchesQuery && matchesRoom;
    });

  /* ── thread view (FIX #1: replaced inline ThreadView with ThreadPanel) ── */
  if (selectedPost) return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '36px 28px 56px' }}>
      <ThreadPanel
        post={selectedPost}
        onBack={() => {
          setSelectedPost(null);
          requestAnimationFrame(() => window.scrollTo(0, scrollYRef.current));
        }}
        onPostUpdated={updatedPost => {
          setSelectedPost(updatedPost);
          setPosts(cur => cur.map(p => p.id === updatedPost.id ? updatedPost : p));
        }}
        onShare={handleShare}
        onReport={handleReport}
        showToast={showToast}
      />
    </div>
  );

  /* ── main render ── */
  return (
    <>
      <div className={`live-toast${toast ? ' show' : ''}`}>{toast}</div>

      {/* ── TICKER ── */}
      <div className="ticker-wrap" style={{ position: 'relative' }}>
        <div className="ticker-inner">
          {[...tickerItems, ...tickerItems].map((item, i) => (
            <span key={`${item.id}-${i}`} className="ticker-item">
              <span className="ticker-tag">{item.tag}</span>
              {item.text}
            </span>
          ))}
        </div>
        {/* Edit button — only visible to logged-in admin */}
        {user && <button
          onClick={() => setShowTickerMgr(true)}
          title="Manage ticker"
          style={{
            position: 'absolute', right: 0, top: 0, bottom: 0,
            padding: '0 14px',
            background: 'rgba(240,237,227,0.92)',
            border: 'none',
            borderLeft: '1px solid var(--border)',
            color: 'var(--muted)',
            cursor: 'pointer',
            fontSize: 11,
            fontFamily: 'var(--font-mono), monospace',
            letterSpacing: '0.06em',
            display: 'flex', alignItems: 'center', gap: 5,
            zIndex: 2,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
          Edit
        </button>}
      </div>

      {/* two-column layout */}
      <div className="casebook-layout" style={{
        position: 'relative', zIndex: 1,
        display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px',
        maxWidth: 1180, margin: '0 auto', padding: '36px 28px 56px',
        minHeight: 'calc(100vh - var(--nav-h) - 36px)',
      }}>

        {/* ── FEED ── */}
        <div className="casebook-feed" style={{ paddingRight: 28 }}>

          <div className="masthead">
            <div>
              <h1>The <em>Brief</em><br />Room</h1>
              <div className="masthead-meta">
                <span>Anonymous · Candid</span>
                <span style={{ color: 'var(--border)' }}>|</span>
                <span>
                  {new Date().toLocaleDateString('en-IN', {
                    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                  })}
                </span>
              </div>
            </div>
            <div>
              <div className="live-count">{loading ? '—' : posts.length}</div>
              <div className="live-count-label">briefs live</div>
            </div>
          </div>

          <div className="composer-teaser" onClick={openAsk}>
            <div className="composer-avatar">
              {user ? (user.email ?? 'AN').slice(0, 2).toUpperCase() : 'AQ'}
            </div>
            <div className="composer-placeholder">What do you need honest help with?</div>
            <div className="composer-kbd">A</div>
          </div>

          <div className="search-wrap">
            <span className="search-icon">⌕</span>
            <input
              className="search-input"
              placeholder="Search briefs…"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>

          <div className="sort-row">
            {([
              ['all',        '· All'],
              ['hot',        '🔥 Hot'],
              ['new',        '✦ New'],
              ['top',        '↑ Top'],
              ['unanswered', '◯ Open'],
            ] as const).map(([s, label]) => (
              <button
                key={s}
                className={`sort-tab${sort === s ? ' active' : ''}`}
                onClick={() => setSort(s)}
              >
                {label}
              </button>
            ))}
          </div>

          {/* post list — FIX: shimmer is now card-shaped, empty state is designed */}
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[1, 2, 3].map(i => (
                <div key={i} style={{
                  border: '1px solid rgba(194,182,156,0.38)',
                  background: 'rgba(250,247,240,.90)',
                  borderRadius: 24, padding: '28px 26px 24px 30px',
                  display: 'flex', flexDirection: 'column', gap: 10,
                }}>
                  <div className="shimmer-line" style={{ width: '28%', height: 10, borderRadius: 6 }} />
                  <div className="shimmer-line" style={{ width: '88%', height: 20, borderRadius: 6 }} />
                  <div className="shimmer-line" style={{ width: '72%', height: 14, borderRadius: 6 }} />
                  <div className="shimmer-line" style={{ width: '45%', height: 10, borderRadius: 6, marginTop: 4 }} />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div style={{
              border: '1px solid rgba(194,182,156,0.38)',
              background: 'rgba(250,247,240,.90)',
              borderRadius: 24, padding: '48px 30px',
              textAlign: 'center',
            }}>
              <div style={{
                fontFamily: 'var(--font-display), serif',
                fontSize: 24, color: 'var(--ink)', marginBottom: 8, fontWeight: 600,
              }}>
                No briefs found
              </div>
              <div style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1.6 }}>
                {query
                  ? `Nothing matched "${query}" — try different words or browse all tabs.`
                  : 'Be the first to post in this tab.'}
              </div>
              {!query && (
                <button
                  className="nav-cta"
                  style={{ marginTop: 20, borderRadius: 10, padding: '8px 22px' }}
                  onClick={openAsk}
                >
                  Start a brief →
                </button>
              )}
            </div>
          ) : filtered.map((post, i) => (
            <article
              key={post.id}
              className="post-card"
              onClick={() => { scrollYRef.current = window.scrollY; setSelectedPost(post); }}
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                  <span className="tag" style={{ background: MOOD_BG[post.mood], color: MOOD_COLORS[post.mood] }}>
                    {MOOD_LABEL[post.mood]}
                  </span>
                  <span style={{ color: 'var(--muted)', fontSize: 11, fontFamily: 'var(--font-mono), monospace' }}>
                    by <strong style={{ color: 'var(--text)' }}>{getHandle(post.author)}</strong>
                  </span>
                </div>

                <div className="post-title">{post.title}</div>
                {post.body && <div className="post-excerpt">{post.body}</div>}

                <div className="post-footer-meta">
                  <span className="post-stat">
                    <span className="post-stat-dot" style={{ background: MOOD_COLORS[post.mood] }} />
                    {post.upvotes} upvotes
                  </span>
                  <span>{post.reply_count} {post.reply_count === 1 ? 'reply' : 'replies'}</span>
                  <span>{timeAgo(post.created_at)} ago</span>
                  <span style={{ color: 'var(--accent)', fontWeight: 600, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                    Open brief ↗
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, userSelect: 'none' }}>
                <button
                  onClick={e => voteOnPost(e, post, 1)}
                  disabled={Boolean(pendingVotes[post.id])}
                  title="Upvote"
                  style={{
                    width: 32, height: 28,
                    border: `1.5px solid ${localVotes[post.id] === 1 ? 'var(--accent)' : 'rgba(189,175,150,.7)'}`,
                    borderRadius: 8,
                    background: localVotes[post.id] === 1 ? 'rgba(40,79,69,0.12)' : 'rgba(255,252,244,0.74)',
                    color: localVotes[post.id] === 1 ? 'var(--accent)' : 'var(--muted)',
                    cursor: pendingVotes[post.id] ? 'default' : 'pointer',
                    fontSize: 11, fontWeight: 800,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all .15s', opacity: pendingVotes[post.id] ? 0.5 : 1,
                  }}
                >▲</button>
                <span style={{
                  fontFamily: 'var(--font-mono), monospace', fontSize: 12, fontWeight: 700,
                  color: localVotes[post.id] === 1 ? 'var(--accent)' : localVotes[post.id] === -1 ? 'var(--stamp)' : 'var(--ink)',
                  minWidth: 20, textAlign: 'center', transition: 'color .15s',
                }}>
                  {post.upvotes}
                </span>
                <button
                  onClick={e => voteOnPost(e, post, -1)}
                  disabled={Boolean(pendingVotes[post.id])}
                  title="Downvote"
                  style={{
                    width: 32, height: 28,
                    border: `1.5px solid ${localVotes[post.id] === -1 ? 'var(--stamp)' : 'rgba(189,175,150,.7)'}`,
                    borderRadius: 8,
                    background: localVotes[post.id] === -1 ? 'rgba(143,62,52,0.10)' : 'rgba(255,252,244,0.74)',
                    color: localVotes[post.id] === -1 ? 'var(--stamp)' : 'var(--muted)',
                    cursor: pendingVotes[post.id] ? 'default' : 'pointer',
                    fontSize: 11, fontWeight: 800,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all .15s', opacity: pendingVotes[post.id] ? 0.5 : 1,
                  }}
                >▼</button>
              </div>
            </article>
          ))}
        </div>

        {/* ── RAIL ── */}
        <aside className="rail">

          {/* Activity — live post counts per day, last 7 days */}
          <div>
            <div className="rail-label">Activity</div>
            <div className="barograph">
              {baroHeights.map((h, i) => (
                <div
                  key={i}
                  className={`bar-col${i === 6 ? ' active' : ''}`}
                  style={{ height: h }}
                  title={`${Math.round(h / 64 * baroHeights.reduce((a,b)=>Math.max(a,b),1))} posts`}
                />
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono), monospace', fontSize: 9, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              <span>7d ago</span><span>Now</span>
            </div>
          </div>

          {/* Mood donut — all posts in DB, not just current page */}
          <div>
            <div className="rail-label">Mood</div>
            <div className="mood-ring-wrap">
              <canvas ref={moodCanvasRef} width={80} height={80} />
              <div className="mood-legend">
                {(['hot', 'answered', 'debated', 'neutral'] as const).map(m => (
                  <div key={m} className="mood-row">
                    <div className="mood-dot" style={{ background: MOOD_COLORS[m] }} />
                    <span>{MOOD_LABEL[m]}</span>
                    {allMoodCounts[m] ? (
                      <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono), monospace', fontSize: 10, color: 'var(--muted)' }}>
                        {allMoodCounts[m]}
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Discussion heat — live post counts per day, last 35 days */}
          <div>
            <div className="rail-label">Discussion heat</div>
            <div className="heatmap-grid">
              {heatLevels.map((lvl, i) => {
                const daysAgo = 34 - i;
                const dateLabel = new Date(Date.now() - daysAgo * 86_400_000)
                  .toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
                return (
                  <div
                    key={i}
                    className={`heat-cell${lvl > 0 ? ` h${lvl}` : ''}${i === 34 ? ' today' : ''}`}
                    title={`${dateLabel}: ${lvl} activity`}
                  />
                );
              })}
            </div>
          </div>

          {/* Rooms — live counts, click to filter feed */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div className="rail-label" style={{ marginBottom: 0 }}>Rooms</div>
              {activeRoom && (
                <button
                  onClick={() => setActiveRoom(null)}
                  style={{ fontSize: 10, fontFamily: 'var(--font-mono), monospace', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.04em' }}
                >
                  clear ×
                </button>
              )}
            </div>
            <div>
              {(() => {
                const rooms = ROOM_NAMES.map(name => ({ name, count: roomCounts[name] ?? 0 }));
                const maxCount = Math.max(...rooms.map(r => r.count), 1);
                return rooms.map(r => (
                  <div
                    key={r.name}
                    className="room-row"
                    onClick={() => setActiveRoom(prev => prev === r.name ? null : r.name)}
                    style={{
                      cursor: 'pointer',
                      borderRadius: 8,
                      padding: '3px 4px',
                      margin: '1px -4px',
                      background: activeRoom === r.name ? 'var(--accent-soft)' : 'transparent',
                      transition: 'background .15s',
                    }}
                    title={`Filter by ${r.name}`}
                  >
                    <span className="room-name" style={{ fontWeight: activeRoom === r.name ? 700 : undefined, color: activeRoom === r.name ? 'var(--accent)' : undefined }}>
                      {r.name}
                    </span>
                    <div className="room-bar-wrap">
                      <div className="room-bar" style={{ width: `${(r.count / maxCount) * 100}%`, background: activeRoom === r.name ? 'var(--accent)' : undefined }} />
                    </div>
                    <span className="room-count">{r.count}</span>
                  </div>
                ));
              })()}
            </div>
          </div>

          <button className="nav-cta" style={{ width: '100%', padding: 12, borderRadius: 12, fontSize: 13 }} onClick={openAsk}>
            Start a brief →
          </button>

          {/* ── MODERATION (admin only) ── */}
          {user && (
            <div style={{ marginTop: 8 }}>
              <button
                onClick={() => { setShowModerationPanel(true); void fetchPendingReports(); }}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 12, fontSize: 12,
                  border: '1px solid var(--border)', background: pendingReports.length > 0 ? 'rgba(168,67,53,0.08)' : 'var(--tag-bg)',
                  color: pendingReports.length > 0 ? 'var(--stamp)' : 'var(--muted)',
                  cursor: 'pointer', fontFamily: 'var(--font-mono), monospace',
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}
              >
                <span>⚑ Moderation</span>
                {pendingReports.length > 0 && (
                  <span style={{
                    background: 'var(--stamp)', color: '#fff',
                    borderRadius: 999, padding: '1px 7px', fontSize: 10, fontWeight: 700,
                  }}>{pendingReports.length}</span>
                )}
              </button>
            </div>
          )}
        </aside>
      </div>

      <button id="floatAsk" className="float-ask" onClick={openAsk}>+ Ask</button>

      {/* ── ASK MODAL ── */}
      {showModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div className="modal">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div className="modal-title">Start a brief</div>
              <button onClick={() => setShowModal(false)} style={{ border: 'none', background: 'var(--tag-bg)', color: 'var(--muted)', width: 28, height: 28, borderRadius: 7, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>

            <label className="f-label">Your question</label>
            <input
              className="f-input" type="text" value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && void submitPost()}
              placeholder="e.g. How negotiable are associate salaries at Tier-1 firms?"
            />

            <label className="f-label">More detail (optional)</label>
            <textarea
              className="f-input" value={form.body}
              onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
              placeholder="Add background, what you've tried, or what kind of answer helps most…"
            />

            <label className="f-label">Tag</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4, marginBottom: 4 }}>
              {([['neutral','Open'],['hot','Hot topic'],['answered','Answered'],['debated','Debated']] as const).map(([val, lbl]) => (
                <button key={val} className={`tag-chip${form.mood === val ? ' sel' : ''}`} onClick={() => setForm(f => ({ ...f, mood: val }))}>
                  {lbl}
                </button>
              ))}
            </div>

            <label className="f-label">Room <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(optional)</span></label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4, marginBottom: 4 }}>
              {ROOM_NAMES.map(name => (
                <button
                  key={name}
                  className={`tag-chip${form.category === name ? ' sel' : ''}`}
                  onClick={() => setForm(f => ({ ...f, category: f.category === name ? '' : name }))}
                >
                  {name}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: '1.25rem' }}>
              <button onClick={() => setShowModal(false)} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', padding: '8px 16px', borderRadius: 8, fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-mono), monospace', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Cancel
              </button>
              <button className="nav-cta" style={{ borderRadius: 10, padding: '8px 22px', opacity: submitting ? .6 : 1 }} onClick={() => void submitPost()} disabled={submitting}>
                {submitting ? 'Posting…' : 'Post brief →'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── COMMAND PALETTE ── */}
      {showCmd && (
        <div className="cmd-overlay" onClick={e => { if (e.target === e.currentTarget) setShowCmd(false); }}>
          <div className="cmd-box">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ color: 'var(--muted)', flexShrink: 0 }}>
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
              <input autoFocus placeholder="Search or jump to…" style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 15, fontFamily: 'var(--font-sans), sans-serif', color: 'var(--text)', outline: 'none' }} onKeyDown={e => e.key === 'Escape' && setShowCmd(false)} />
              <kbd style={{ fontSize: 10, background: 'var(--tag-bg)', color: 'var(--muted)', padding: '2px 6px', borderRadius: 4, fontFamily: 'var(--font-mono), monospace', border: '1px solid var(--border)' }}>ESC</kbd>
            </div>
            <div style={{ maxHeight: 320, overflowY: 'auto' }}>
              <div className="cmd-section">Quick actions</div>
              {[
                { icon: '✦', label: 'Start a brief',   sub: 'Post anonymously',   action: () => { setShowCmd(false); openAsk(); } },
                { icon: '🔥', label: 'Hot briefs',      sub: 'Sort by trending',   action: () => { setShowCmd(false); setSort('hot'); } },
                { icon: '✓',  label: 'Answered briefs', sub: 'Resolved questions', action: () => { setShowCmd(false); setSort('top'); } },
                { icon: '◯',  label: 'Open questions',  sub: 'Unanswered threads', action: () => { setShowCmd(false); setSort('unanswered'); } },
              ].map(item => (
                <div key={item.label} className="cmd-item" onClick={item.action}>
                  <div className="cmd-icon">{item.icon}</div>
                  <div>
                    <div style={{ fontSize: 13, color: 'var(--text)' }}>{item.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{item.sub}</div>
                  </div>
                </div>
              ))}
              <div className="cmd-section">Rooms</div>
              {ROOM_NAMES.map(name => (
                <div key={name} className="cmd-item" onClick={() => setShowCmd(false)}>
                  <div className="cmd-icon" style={{ fontSize: 11, fontFamily: 'var(--font-mono), monospace' }}>{name.slice(0, 2).toUpperCase()}</div>
                  <div>
                    <div style={{ fontSize: 13, color: 'var(--text)' }}>{name}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{roomCounts[name] ?? 0} discussions</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 14, fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-mono), monospace' }}>
              <span><kbd style={{ background: 'var(--tag-bg)', border: '1px solid var(--border)', borderRadius: 3, padding: '1px 5px', fontSize: 10 }}>↵</kbd> select</span>
              <span><kbd style={{ background: 'var(--tag-bg)', border: '1px solid var(--border)', borderRadius: 3, padding: '1px 5px', fontSize: 10 }}>esc</kbd> close</span>
            </div>
          </div>
        </div>
      )}
      {/* ── TICKER MANAGER MODAL ── */}
      {showTickerMgr && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowTickerMgr(false); }}>
          <div className="modal" style={{ maxWidth: 560, width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <div className="modal-title" style={{ marginBottom: 2 }}>Manage Ticker</div>
                <div style={{ color: 'var(--muted)', fontSize: 12, fontFamily: 'var(--font-mono), monospace' }}>
                  {tickerItems.length} item{tickerItems.length !== 1 ? 's' : ''} · scrolls continuously
                </div>
              </div>
              <button
                onClick={() => setShowTickerMgr(false)}
                style={{ border: 'none', background: 'var(--tag-bg)', color: 'var(--muted)', width: 28, height: 28, borderRadius: 7, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >✕</button>
            </div>

            {/* Existing items */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20, maxHeight: 260, overflowY: 'auto' }}>
              {tickerItems.length === 0 ? (
                <div style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
                  No ticker items yet. Add one below.
                </div>
              ) : tickerItems.map(item => (
                <div
                  key={item.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: 'rgba(250,247,240,.8)',
                    border: '1px solid var(--border)',
                    borderRadius: 10, padding: '10px 12px',
                  }}
                >
                  <span style={{
                    fontFamily: 'var(--font-mono), monospace',
                    fontSize: 10, fontWeight: 700,
                    color: 'var(--accent)',
                    background: 'var(--accent-soft)',
                    padding: '3px 8px', borderRadius: 999,
                    whiteSpace: 'nowrap', flexShrink: 0,
                    textTransform: 'uppercase', letterSpacing: '0.06em',
                  }}>
                    {item.tag}
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--text)', flex: 1, lineHeight: 1.4 }}>
                    {item.text}
                  </span>
                  <button
                    onClick={() => void deleteTickerItem(item.id)}
                    title="Remove"
                    style={{
                      background: 'none', border: 'none',
                      color: 'var(--muted)', cursor: 'pointer',
                      fontSize: 16, lineHeight: 1, padding: '0 4px',
                      flexShrink: 0,
                    }}
                  >×</button>
                </div>
              ))}
            </div>

            {/* Add new item */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <div style={{ fontSize: 11, fontFamily: 'var(--font-mono), monospace', color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>
                Add new item
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input
                  className="f-input"
                  style={{ width: 140, flexShrink: 0 }}
                  placeholder="Tag (e.g. Salaries)"
                  value={tickerForm.tag}
                  onChange={e => setTickerForm(f => ({ ...f, tag: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && void addTickerItem()}
                />
                <input
                  className="f-input"
                  style={{ flex: 1 }}
                  placeholder="Ticker text…"
                  value={tickerForm.text}
                  onChange={e => setTickerForm(f => ({ ...f, text: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && void addTickerItem()}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  className="nav-cta"
                  style={{ borderRadius: 10, padding: '8px 20px', opacity: tickerSaving ? 0.6 : 1 }}
                  onClick={() => void addTickerItem()}
                  disabled={tickerSaving}
                >
                  {tickerSaving ? 'Saving…' : '+ Add to ticker'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── REPORT MODAL ── */}
      {reportTarget && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setReportTarget(null); }}>
          <div className="modal" style={{ maxWidth: 460, width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
              <div>
                <div className="modal-title" style={{ marginBottom: 2 }}>Report content</div>
                <div style={{ color: 'var(--muted)', fontSize: 12, fontFamily: 'var(--font-mono), monospace' }}>
                  {reportTarget.type === 'post' ? 'Post' : 'Comment'} · anonymous
                </div>
              </div>
              <button
                onClick={() => setReportTarget(null)}
                style={{ border: 'none', background: 'var(--tag-bg)', color: 'var(--muted)', width: 28, height: 28, borderRadius: 7, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >✕</button>
            </div>

            {/* Preview of content being reported */}
            <div style={{
              background: 'rgba(240,237,227,0.7)', border: '1px solid var(--border)',
              borderRadius: 10, padding: '10px 14px', marginBottom: 18,
            }}>
              <div style={{ fontSize: 12, color: 'var(--ink)', fontWeight: 600, lineHeight: 1.4, marginBottom: reportTarget.body ? 4 : 0 }}>
                {reportTarget.title}
              </div>
              {reportTarget.body && (
                <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
                  {reportTarget.body.slice(0, 120)}{reportTarget.body.length > 120 ? '…' : ''}
                </div>
              )}
            </div>

            <label className="f-label">Why are you reporting this?</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6, marginBottom: 20 }}>
              {[
                'Spam or self-promotion',
                'Harassment or bullying',
                'Misinformation or misleading',
                'Hate speech or discrimination',
                'Off-topic or irrelevant',
                'Other',
              ].map(reason => (
                <label
                  key={reason}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '9px 12px', borderRadius: 10, cursor: 'pointer',
                    border: `1px solid ${reportReason === reason ? 'var(--accent)' : 'var(--border)'}`,
                    background: reportReason === reason ? 'var(--accent-soft)' : 'rgba(250,247,240,.8)',
                    transition: 'all .12s',
                  }}
                  onClick={() => setReportReason(reason)}
                >
                  <div style={{
                    width: 14, height: 14, borderRadius: '50%',
                    border: `1.5px solid ${reportReason === reason ? 'var(--accent)' : 'rgba(189,175,150,.8)'}`,
                    background: reportReason === reason ? 'var(--accent)' : 'transparent',
                    flexShrink: 0, transition: 'all .12s',
                  }} />
                  <span style={{ fontSize: 13, color: reportReason === reason ? 'var(--accent)' : 'var(--text)' }}>
                    {reason}
                  </span>
                </label>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={() => setReportTarget(null)}
                style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', padding: '8px 16px', borderRadius: 8, fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-mono), monospace', letterSpacing: '0.06em', textTransform: 'uppercase' }}
              >Cancel</button>
              <button
                className="nav-cta"
                style={{
                  borderRadius: 10, padding: '8px 22px',
                  opacity: (!reportReason || reportSubmitting) ? 0.5 : 1,
                  background: 'rgba(168,67,53,0.85)',
                }}
                onClick={() => void submitReport()}
                disabled={!reportReason || reportSubmitting}
              >
                {reportSubmitting ? 'Submitting…' : 'Submit report →'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── FULL MODERATION PANEL MODAL (admin only) ── */}
      {showModerationPanel && user && (() => {
        const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
          pending:   { bg: 'rgba(168,67,53,0.08)',  text: 'var(--stamp)',  border: 'rgba(168,67,53,0.3)'  },
          dismissed: { bg: 'rgba(129,117,103,0.08)', text: 'var(--muted)', border: 'rgba(189,175,150,.5)' },
          removed:   { bg: 'rgba(23,107,96,0.08)',   text: 'var(--accent)', border: 'rgba(23,107,96,0.3)' },
        };
        const filteredReports = reportFilter === 'all' ? reports : reports.filter(r => r.status === reportFilter);
        const counts = {
          all: reports.length,
          pending: reports.filter(r => r.status === 'pending').length,
          dismissed: reports.filter(r => r.status === 'dismissed').length,
          removed: reports.filter(r => r.status === 'removed').length,
        };
        return (
          <div
            className="modal-overlay"
            onClick={e => { if (e.target === e.currentTarget) setShowModerationPanel(false); }}
            style={{ alignItems: 'flex-start', paddingTop: 40 }}
          >
            <div className="modal" style={{ maxWidth: 700, width: '100%', maxHeight: 'calc(100vh - 80px)', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>

              {/* Header */}
              <div style={{ padding: '20px 24px 0', flexShrink: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div className="modal-title" style={{ marginBottom: 0 }}>Moderation Panel</div>
                      {counts.pending > 0 && (
                        <span style={{ background: 'var(--stamp)', color: '#fff', borderRadius: 999, padding: '2px 9px', fontSize: 11, fontWeight: 700 }}>
                          {counts.pending} pending
                        </span>
                      )}
                    </div>
                    <div style={{ color: 'var(--muted)', fontSize: 12, fontFamily: 'var(--font-mono), monospace', marginTop: 3 }}>
                      {counts.all} total report{counts.all !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      onClick={() => void fetchPendingReports()}
                      title="Refresh"
                      style={{ border: '1px solid var(--border)', background: 'var(--tag-bg)', color: 'var(--muted)', width: 30, height: 30, borderRadius: 8, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >↻</button>
                    <button
                      onClick={() => setShowModerationPanel(false)}
                      style={{ border: 'none', background: 'var(--tag-bg)', color: 'var(--muted)', width: 30, height: 30, borderRadius: 8, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >✕</button>
                  </div>
                </div>

                {/* Filter tabs */}
                <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
                  {(['pending','all','dismissed','removed'] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setReportFilter(f)}
                      style={{
                        padding: '7px 14px', fontSize: 11, fontFamily: 'var(--font-mono), monospace',
                        letterSpacing: '0.05em', textTransform: 'uppercase',
                        border: 'none', background: 'none', cursor: 'pointer',
                        color: reportFilter === f ? 'var(--accent)' : 'var(--muted)',
                        borderBottom: `2px solid ${reportFilter === f ? 'var(--accent)' : 'transparent'}`,
                        marginBottom: -1, fontWeight: reportFilter === f ? 700 : 400,
                        transition: 'all .12s',
                      }}
                    >
                      {f} <span style={{ opacity: 0.7 }}>({counts[f]})</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Report list */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '12px 24px 24px' }}>
                {filteredReports.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--muted)', fontFamily: 'var(--font-mono), monospace', fontSize: 13 }}>
                    {reportFilter === 'pending' ? 'No pending reports — all clear ✓' : `No ${reportFilter} reports`}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
                    {filteredReports.map(r => {
                      const sc = STATUS_COLORS[r.status];
                      const isActing = moderating === r.id;
                      const isPending = r.status === 'pending';
                      return (
                        <div
                          key={r.id}
                          style={{
                            border: `1px solid ${sc.border}`,
                            borderRadius: 14,
                            background: sc.bg,
                            padding: '14px 16px',
                            display: 'flex', flexDirection: 'column', gap: 10,
                            opacity: isActing ? 0.6 : 1,
                            transition: 'opacity .15s',
                          }}
                        >
                          {/* Top row: type badge + status + date */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{
                              fontSize: 9, fontFamily: 'var(--font-mono), monospace',
                              fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em',
                              color: r.target_type === 'post' ? 'var(--accent)' : '#8B5C2A',
                              background: r.target_type === 'post' ? 'var(--accent-soft)' : 'rgba(139,92,42,0.12)',
                              padding: '2px 8px', borderRadius: 999, border: '1px solid',
                              borderColor: r.target_type === 'post' ? 'rgba(23,107,96,0.25)' : 'rgba(139,92,42,0.25)',
                            }}>{r.target_type}</span>
                            <span style={{
                              fontSize: 9, fontFamily: 'var(--font-mono), monospace',
                              fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em',
                              color: sc.text, padding: '2px 8px', borderRadius: 999,
                              background: r.status === 'pending' ? 'rgba(168,67,53,0.15)' : r.status === 'removed' ? 'rgba(23,107,96,0.15)' : 'rgba(129,117,103,0.15)',
                            }}>{r.status}</span>
                            <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-mono), monospace' }}>
                              {new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                              {' · '}{new Date(r.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>

                          {/* Content preview */}
                          <div style={{
                            background: 'rgba(250,247,240,0.85)', border: '1px solid var(--border)',
                            borderRadius: 10, padding: '10px 12px',
                          }}>
                            {r.title && (
                              <div style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 600, lineHeight: 1.4, marginBottom: r.body ? 4 : 0 }}>
                                {r.title}
                              </div>
                            )}
                            {r.body && (
                              <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
                                {r.body.slice(0, 200)}{r.body.length > 200 ? '…' : ''}
                              </div>
                            )}
                            <div style={{ marginTop: 6, fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-mono), monospace' }}>
                              by {getHandle(r.author)}
                            </div>
                          </div>

                          {/* Reason */}
                          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                            <span style={{ fontFamily: 'var(--font-mono), monospace', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Reason </span>
                            <strong style={{ color: 'var(--text)' }}>{r.reason}</strong>
                          </div>

                          {/* Actions — only show for pending reports */}
                          {isPending && (
                            <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                              <button
                                disabled={isActing}
                                onClick={() => void moderateReport(r.id, r.target_id, 'dismissed')}
                                style={{
                                  flex: 1, padding: '8px 0', borderRadius: 9, fontSize: 12,
                                  border: '1px solid var(--border)', background: 'rgba(250,247,240,0.9)',
                                  color: 'var(--muted)', cursor: isActing ? 'default' : 'pointer',
                                  fontFamily: 'var(--font-mono), monospace', letterSpacing: '0.04em',
                                  fontWeight: 600, transition: 'all .12s',
                                }}
                              >
                                {isActing ? '…' : '✓ Dismiss'}
                              </button>
                              <button
                                disabled={isActing}
                                onClick={() => void moderateReport(r.id, r.target_id, 'removed')}
                                style={{
                                  flex: 1, padding: '8px 0', borderRadius: 9, fontSize: 12,
                                  border: '1px solid rgba(168,67,53,0.4)',
                                  background: 'rgba(168,67,53,0.10)',
                                  color: 'var(--stamp)', cursor: isActing ? 'default' : 'pointer',
                                  fontFamily: 'var(--font-mono), monospace', letterSpacing: '0.04em',
                                  fontWeight: 600, transition: 'all .12s',
                                }}
                              >
                                {isActing ? '…' : '⊗ Remove content'}
                              </button>
                            </div>
                          )}
                          {!isPending && (
                            <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-mono), monospace', textAlign: 'center' }}>
                              {r.status === 'removed' ? '✓ Content removed by moderator' : '— Report dismissed'}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

    </>
  );
}