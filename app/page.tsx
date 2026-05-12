'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

/* ── TYPES ── */
type Post = {
  id: string;
  title: string;
  body: string;
  author: string;
  created_at: string;
  mood: string;
  reply_count: number;
  upvotes: number;
};

type Comment = {
  id: string;
  post_id: string;
  body: string;
  author: string;
  created_at: string;
};

type Sort = 'hot' | 'new' | 'top' | 'unanswered';
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

const TICKER_ITEMS = [
  { tag: 'Recruitment', text: 'Application windows opening next month' },
  { tag: 'Salaries',    text: 'NQ pay reviewed upward at several Tier-1 firms' },
  { tag: 'Internships', text: 'Spring vacation scheme places still available' },
  { tag: 'LLM Abroad',  text: 'Columbia scholarship data published' },
  { tag: 'Moot Court',  text: 'Vis East registrations now open' },
  { tag: 'Litigation',  text: 'District court practice guides updated' },
];

const ROOMS = [
  { name: 'Recruitment', count: 24 },
  { name: 'Salaries',    count: 18 },
  { name: 'LLM Abroad',  count: 15 },
  { name: 'Internships', count: 12 },
  { name: 'Litigation',  count: 9  },
  { name: 'Moot Court',  count: 7  },
];

const BARO_HEIGHTS = [22, 35, 18, 44, 28, 56, 64];
const HEAT_LEVELS  = [0,1,0,2,1,3,0,2,4,1,0,2,3,1,2,4,3,2,1,0,2,3,4,2,1,3,2,4,3,2,1,3,2,4,3];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VOTE_STORAGE_KEY = 'casebook:votes';

/* anonymous handle generator — deterministic from email */
function samplePosts(): Post[] {
  const now = Date.now();

  return [
    {
      id: 'sample-1',
      title: 'Tier-1 corporate team or disputes boutique after graduation?',
      body: 'The brand name is tempting, but the boutique seems to give juniors real drafting and court exposure earlier. What tradeoff actually matters two years in?',
      author: 'sample1@casebook.chat',
      created_at: new Date(now - 1000 * 60 * 42).toISOString(),
      mood: 'hot',
      reply_count: 14,
      upvotes: 89,
    },
    {
      id: 'sample-2',
      title: 'How do you ask for real feedback after an internship without sounding desperate?',
      body: 'I did the work, got polite comments, but no concrete improvement notes. Is there a way to ask seniors for useful feedback without making it awkward?',
      author: 'sample2@casebook.chat',
      created_at: new Date(now - 1000 * 60 * 60 * 3).toISOString(),
      mood: 'answered',
      reply_count: 22,
      upvotes: 71,
    },
    {
      id: 'sample-3',
      title: 'Is an expensive foreign LLM worth it without scholarship money?',
      body: 'Everyone talks about the network, but the debt number is terrifying. I want honest numbers from people who came back to India after doing it.',
      author: 'sample3@casebook.chat',
      created_at: new Date(now - 1000 * 60 * 60 * 9).toISOString(),
      mood: 'debated',
      reply_count: 7,
      upvotes: 46,
    },
    {
      id: 'sample-4',
      title: 'First-generation law student here. How do I learn the hidden rules?',
      body: 'I understand classes and internships. I do not understand how people know which seniors to email, which firms to avoid, and what matters on a CV.',
      author: 'sample4@casebook.chat',
      created_at: new Date(now - 1000 * 60 * 60 * 20).toISOString(),
      mood: 'hot',
      reply_count: 18,
      upvotes: 104,
    },
    {
      id: 'sample-5',
      title: 'Moot court burnout is real. When is it okay to step back?',
      body: 'I love the work, but the team dynamic has become intense and my semester is slipping. Will quitting one moot hurt future applications?',
      author: 'sample5@casebook.chat',
      created_at: new Date(now - 1000 * 60 * 60 * 31).toISOString(),
      mood: 'neutral',
      reply_count: 0,
      upvotes: 19,
    },
  ];
}

const ADJ  = ['Amber','Quiet','Candid','Steady','Lucid','Sharp','Grounded','Steady'];
const NOUN = ['Brief','Quill','Atlas','Verdict','Harbor','Ledger','Signal','Clover'];
function getHandle(author: string): string {
  if (author?.startsWith('alias:')) {
    return author.slice('alias:'.length);
  }

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
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(VOTE_STORAGE_KEY) ?? '{}') as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter(([, value]) => value === 1 || value === -1),
    ) as Partial<Record<string, VoteValue>>;
  } catch {
    return {};
  }
}

function writeStoredVote(postId: string, vote: VoteValue) {
  if (typeof window === 'undefined') {
    return;
  }

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

  const [posts,        setPosts]        = useState<Post[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [sort,         setSort]         = useState<Sort>('hot');
  const [query,        setQuery]        = useState('');
  const [showModal,    setShowModal]    = useState(false);
  const [showCmd,      setShowCmd]      = useState(false);
  const [toast,        setToast]        = useState('');
  const [form,         setForm]         = useState({ title: '', body: '', mood: 'neutral' });
  const [submitting,   setSubmitting]   = useState(false);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [localVotes,   setLocalVotes]   = useState<Partial<Record<string, VoteValue>>>({});
  const [pendingVotes, setPendingVotes] = useState<Partial<Record<string, boolean>>>({});

  const toastTimer    = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const moodCanvasRef = useRef<HTMLCanvasElement>(null);

  /* ── fetch ── */
  const fetchPosts = useCallback(async () => {
    setLoading(true);
    let q = supabase.from('posts').select('*');
    if (sort === 'hot')             q = q.eq('mood', 'hot').order('upvotes', { ascending: false });
    else if (sort === 'top')        q = q.order('upvotes', { ascending: false });
    else if (sort === 'unanswered') q = q.eq('reply_count', 0).order('created_at', { ascending: false });
    else                            q = q.order('created_at', { ascending: false });
    const { data, error } = await q.limit(20);
    setPosts(!error && data ? data : samplePosts());
    setLoading(false);
  }, [sort]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void fetchPosts();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [fetchPosts]);

  useEffect(() => {
    const persistedPostIds = posts.map((post) => post.id).filter((postId) => UUID_PATTERN.test(postId));

    if (persistedPostIds.length === 0) {
      return;
    }

    const controller = new AbortController();
    const storedVotes = readStoredVotes();
    const visibleStoredVotes = Object.fromEntries(
      persistedPostIds
        .filter((postId) => storedVotes[postId])
        .map((postId) => [postId, storedVotes[postId] as VoteValue]),
    );

    const storedVoteTimer = window.setTimeout(() => {
      if (Object.keys(visibleStoredVotes).length && !controller.signal.aborted) {
        setLocalVotes((currentVotes) => ({ ...currentVotes, ...visibleStoredVotes }));
      }
    }, 0);

    async function loadVoteState() {
      const params = new URLSearchParams({ postIds: persistedPostIds.join(',') });
      const response = await fetch(`/api/votes?${params.toString()}`, { signal: controller.signal });
      const payload = await response.json().catch(() => null) as { votes?: Record<string, VoteValue> } | null;

      if (!controller.signal.aborted && payload?.votes) {
        setLocalVotes((currentVotes) => ({ ...currentVotes, ...payload.votes }));
      }
    }

    void loadVoteState();

    return () => {
      window.clearTimeout(storedVoteTimer);
      controller.abort();
    };
  }, [posts]);

  /* ── mood donut ── */
  useEffect(() => {
    const canvas = moodCanvasRef.current;
    if (!canvas || loading) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const moods = ['hot', 'answered', 'debated', 'neutral'];
    const counts = moods.reduce((acc, m) => {
      acc[m] = posts.filter(p => p.mood === m).length || 1;
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
  }, [posts, loading]);

  /* ── submit post ── */
  async function submitPost() {
    if (!form.title.trim()) return;
    setSubmitting(true);
    const newPost = {
      title: form.title, body: form.body,
      author: randomAnonymousAuthor(),
      mood: form.mood, upvotes: 0, reply_count: 0,
    };

    const { data, error } = await supabase
      .from('posts')
      .insert(newPost)
      .select('*')
      .single();

    if (error || !data) {
      setSubmitting(false);
      showToast(error?.message ?? 'Brief could not be recorded.');
      return;
    }

    const visiblePost = data as Post;
    setPosts((currentPosts) => [visiblePost, ...currentPosts]);
    setForm({ title: '', body: '', mood: 'neutral' });
    setShowModal(false); setSubmitting(false);
    showToast('Brief posted anonymously');
    void fetchPosts();
  }

  /* ── vote ── */
  async function voteOnPost(e: React.MouseEvent, post: Post, vote: VoteValue) {
    e.stopPropagation();

    if (!UUID_PATTERN.test(post.id)) {
      showToast('Voting works on recorded briefs.');
      return;
    }

    if (pendingVotes[post.id]) {
      return;
    }

    const previousVote: VoteState = localVotes[post.id] ?? 0;

    if (previousVote === vote) {
      showToast(vote === 1 ? 'You already upvoted this brief.' : 'You already downvoted this brief.');
      return;
    }

    const optimisticScore = post.upvotes + vote - previousVote;

    setPosts((currentPosts) =>
      currentPosts.map((currentPost) =>
        currentPost.id === post.id ? { ...currentPost, upvotes: optimisticScore } : currentPost,
      ),
    );
    setLocalVotes((currentVotes) => ({ ...currentVotes, [post.id]: vote }));
    setPendingVotes((currentPendingVotes) => ({ ...currentPendingVotes, [post.id]: true }));

    const response = await fetch('/api/votes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postId: post.id, vote }),
    });

    const payload = await response.json().catch(() => null) as
      | { upvotes?: number; vote?: VoteValue; changed?: boolean; error?: string }
      | null;

    if (!response.ok || typeof payload?.upvotes !== 'number' || payload.vote !== vote) {
      const { error: fallbackError } = await supabase
        .from('posts')
        .update({ upvotes: optimisticScore })
        .eq('id', post.id);

      if (!fallbackError) {
        writeStoredVote(post.id, vote);
        setPendingVotes((currentPendingVotes) => {
          const nextPendingVotes = { ...currentPendingVotes };
          delete nextPendingVotes[post.id];
          return nextPendingVotes;
        });
        showToast('Vote recorded.');
        return;
      }

      setPosts((currentPosts) =>
        currentPosts.map((currentPost) =>
          currentPost.id === post.id ? { ...currentPost, upvotes: post.upvotes } : currentPost,
        ),
      );
      setLocalVotes((currentVotes) => {
        const nextVotes = { ...currentVotes };
        if (previousVote === 0) {
          delete nextVotes[post.id];
        } else {
          nextVotes[post.id] = previousVote;
        }
        return nextVotes;
      });
      setPendingVotes((currentPendingVotes) => {
        const nextPendingVotes = { ...currentPendingVotes };
        delete nextPendingVotes[post.id];
        return nextPendingVotes;
      });
      showToast(payload?.error ?? fallbackError.message ?? 'Could not record that vote.');
      return;
    }

    setPosts((currentPosts) =>
      currentPosts.map((currentPost) =>
        currentPost.id === post.id ? { ...currentPost, upvotes: payload.upvotes as number } : currentPost,
      ),
    );
    setLocalVotes((currentVotes) => ({ ...currentVotes, [post.id]: vote }));
    writeStoredVote(post.id, vote);
    setPendingVotes((currentPendingVotes) => {
      const nextPendingVotes = { ...currentPendingVotes };
      delete nextPendingVotes[post.id];
      return nextPendingVotes;
    });
    showToast(payload.changed ? 'Vote recorded.' : 'You already voted on this brief.');
  }

  /* ── toast ── */
  function showToast(msg: string) {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2200);
  }

  /* ── openAsk ── */
  const openAsk = useCallback(() => {
    setShowModal(true);
  }, []);

  /* ── keyboard + event bridge ── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault(); setShowCmd(true);
      }
      if (e.key === 'Escape') { setShowCmd(false); setShowModal(false); }
    };
    const onAskModal = () => openAsk();
    window.addEventListener('keydown', onKey);
    window.addEventListener('openAskModal', onAskModal);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('openAskModal', onAskModal);
    };
  }, [openAsk]);

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

  /* filtered posts */
  const filtered = posts.filter(p =>
    !query ||
    p.title.toLowerCase().includes(query.toLowerCase()) ||
    (p.body ?? '').toLowerCase().includes(query.toLowerCase())
  );

  /* ── thread view ── */
  if (selectedPost) return (
    <ThreadView
      post={selectedPost}
      onBack={() => setSelectedPost(null)}
      onPostUpdated={(updatedPost) => {
        setSelectedPost(updatedPost);
        setPosts((currentPosts) =>
          currentPosts.map((currentPost) => currentPost.id === updatedPost.id ? updatedPost : currentPost),
        );
      }}
      showToast={showToast}
    />
  );

  /* ── main render ── */
  return (
    <>
      {/* toast */}
      <div className={`live-toast${toast ? ' show' : ''}`}>{toast}</div>

      {/* ticker tape */}
      <div className="ticker-wrap">
        <div className="ticker-inner">
          {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
            <span key={i} className="ticker-item">
              <span className="ticker-tag">{item.tag}</span>
              {item.text}
            </span>
          ))}
        </div>
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

          {/* masthead */}
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

          {/* composer teaser */}
          <div className="composer-teaser" onClick={openAsk}>
            <div className="composer-avatar">
              {user ? (user.email ?? 'AN').slice(0, 2).toUpperCase() : 'AQ'}
            </div>
            <div className="composer-placeholder">What do you need honest help with?</div>
            <div className="composer-kbd">A</div>
          </div>

          {/* search */}
          <div className="search-wrap">
            <span className="search-icon">⌕</span>
            <input
              className="search-input"
              placeholder="Search briefs…"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>

          {/* sort tabs */}
          <div className="sort-row">
            {([
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

          {/* post list */}
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18, paddingLeft: 24 }}>
              {[80, 55, 70].map((w, i) => (
                <div key={i} className="shimmer-line" style={{ width: w + '%' }} />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div style={{
              color: 'var(--muted)', fontSize: 13, padding: '20px 0 20px 24px',
              fontFamily: 'var(--font-mono), monospace', letterSpacing: '0.06em',
            }}>
              No briefs found.
            </div>
          ) : filtered.map((post, i) => {
            const voteCount = post.upvotes;
            return (
              <article
                key={post.id}
                className="post-card"
                onClick={() => setSelectedPost(post)}
                style={{ animationDelay: `${i * 0.05}s` }}
              >
                <div>
                  {/* tags + author */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                    <span
                      className="tag"
                      style={{ background: MOOD_BG[post.mood], color: MOOD_COLORS[post.mood] }}
                    >
                      {MOOD_LABEL[post.mood]}
                    </span>
                    <span style={{ color: 'var(--muted)', fontSize: 11, fontFamily: 'var(--font-mono), monospace' }}>
                      by <strong style={{ color: 'var(--text)' }}>{getHandle(post.author)}</strong>
                    </span>
                  </div>

                  {/* title */}
                  <div className="post-title">{post.title}</div>

                  {/* excerpt */}
                  {post.body && <div className="post-excerpt">{post.body}</div>}

                  {/* footer */}
                  <div className="post-footer-meta">
                    <span className="post-stat">
                      <span className="post-stat-dot" style={{ background: MOOD_COLORS[post.mood] }} />
                      {voteCount} upvotes
                    </span>
                    <span>{post.reply_count} {post.reply_count === 1 ? 'reply' : 'replies'}</span>
                    <span>{timeAgo(post.created_at)} ago</span>
                    <span style={{ color: 'var(--accent)', fontWeight: 600, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                      Open brief ↗
                    </span>
                  </div>
                </div>

                {/* vote */}
                <div>
                  <button
                    className={`upvote-btn${localVotes[post.id] === 1 ? ' voted' : ''}`}
                    onClick={e => voteOnPost(e, post, 1)}
                    disabled={Boolean(pendingVotes[post.id])}
                  >
                    <span style={{ fontSize: 16, lineHeight: 1 }}>^</span>
                    <span>{voteCount}</span>
                  </button>
                  <button
                    className={`upvote-btn${localVotes[post.id] === -1 ? ' voted' : ''}`}
                    onClick={e => voteOnPost(e, post, -1)}
                    disabled={Boolean(pendingVotes[post.id])}
                    style={{ marginTop: 8 }}
                  >
                    <span style={{ fontSize: 16, lineHeight: 1 }}>v</span>
                  </button>
                </div>
              </article>
            );
          })}
        </div>

        {/* ── RAIL ── */}
        <aside className="rail">

          {/* barograph */}
          <div>
            <div className="rail-label">Activity</div>
            <div className="barograph">
              {BARO_HEIGHTS.map((h, i) => (
                <div
                  key={i}
                  className={`bar-col${i === 6 ? ' active' : ''}`}
                  style={{ height: h }}
                  title={`${Math.floor(h * 1.5)} posts`}
                />
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono), monospace', fontSize: 9, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              <span>7d ago</span><span>Now</span>
            </div>
          </div>

          {/* mood donut */}
          <div>
            <div className="rail-label">Mood</div>
            <div className="mood-ring-wrap">
              <canvas ref={moodCanvasRef} width={80} height={80} />
              <div className="mood-legend">
                {(['hot', 'answered', 'debated', 'neutral'] as const).map(m => (
                  <div key={m} className="mood-row">
                    <div className="mood-dot" style={{ background: MOOD_COLORS[m] }} />
                    <span>{MOOD_LABEL[m]}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* heatmap */}
          <div>
            <div className="rail-label">Discussion heat</div>
            <div className="heatmap-grid">
              {HEAT_LEVELS.map((lvl, i) => (
                <div
                  key={i}
                  className={`heat-cell${lvl > 0 ? ` h${lvl}` : ''}${i === 34 ? ' today' : ''}`}
                  title={`${lvl * 3} posts`}
                />
              ))}
            </div>
          </div>

          {/* rooms */}
          <div>
            <div className="rail-label">Rooms</div>
            <div>
              {ROOMS.map(r => (
                <div key={r.name} className="room-row">
                  <span className="room-name">{r.name}</span>
                  <div className="room-bar-wrap">
                    <div className="room-bar" style={{ width: `${(r.count / 24) * 100}%` }} />
                  </div>
                  <span className="room-count">{r.count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* CTA */}
          <button
            className="nav-cta"
            style={{ width: '100%', padding: 12, borderRadius: 12, fontSize: 13 }}
            onClick={openAsk}
          >
            Start a brief →
          </button>

        </aside>
      </div>

      {/* float ask */}
      <button id="floatAsk" className="float-ask" onClick={openAsk}>
        + Ask
      </button>

      {/* ── ASK MODAL ── */}
      {showModal && (
        <div
          className="modal-overlay"
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div className="modal">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div className="modal-title">Start a brief</div>
              <button
                onClick={() => setShowModal(false)}
                style={{ border: 'none', background: 'var(--tag-bg)', color: 'var(--muted)', width: 28, height: 28, borderRadius: 7, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >✕</button>
            </div>

            <label className="f-label">Your question</label>
            <input
              className="f-input"
              type="text"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && submitPost()}
              placeholder="e.g. How negotiable are associate salaries at Tier-1 firms?"
            />

            <label className="f-label">More detail (optional)</label>
            <textarea
              className="f-input"
              value={form.body}
              onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
              placeholder="Add background, what you've tried, or what kind of answer helps most…"
            />

            <label className="f-label">Tag</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4, marginBottom: 4 }}>
              {([
                ['neutral',  'Open'],
                ['hot',      'Hot topic'],
                ['answered', 'Answered'],
                ['debated',  'Debated'],
              ] as const).map(([val, lbl]) => (
                <button
                  key={val}
                  className={`tag-chip${form.mood === val ? ' sel' : ''}`}
                  onClick={() => setForm(f => ({ ...f, mood: val }))}
                >
                  {lbl}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: '1.25rem' }}>
              <button
                onClick={() => setShowModal(false)}
                style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', padding: '8px 16px', borderRadius: 8, fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-mono), monospace', letterSpacing: '0.06em', textTransform: 'uppercase' }}
              >
                Cancel
              </button>
              <button
                className="nav-cta"
                style={{ borderRadius: 10, padding: '8px 22px', opacity: submitting ? .6 : 1 }}
                onClick={submitPost}
                disabled={submitting}
              >
                {submitting ? 'Posting…' : 'Post brief →'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── COMMAND PALETTE ── */}
      {showCmd && (
        <div
          className="cmd-overlay"
          onClick={e => { if (e.target === e.currentTarget) setShowCmd(false); }}
        >
          <div className="cmd-box">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ color: 'var(--muted)', flexShrink: 0 }}>
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
              <input
                autoFocus
                placeholder="Search or jump to…"
                style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 15, fontFamily: 'var(--font-sans), sans-serif', color: 'var(--text)', outline: 'none' }}
                onKeyDown={e => e.key === 'Escape' && setShowCmd(false)}
              />
              <kbd style={{ fontSize: 10, background: 'var(--tag-bg)', color: 'var(--muted)', padding: '2px 6px', borderRadius: 4, fontFamily: 'var(--font-mono), monospace', border: '1px solid var(--border)' }}>ESC</kbd>
            </div>

            <div style={{ maxHeight: 320, overflowY: 'auto' }}>
              <div className="cmd-section">Quick actions</div>
              {[
                { icon: '✦', label: 'Start a brief',    sub: 'Post anonymously',   action: () => { setShowCmd(false); openAsk(); } },
                { icon: '🔥', label: 'Hot briefs',       sub: 'Sort by trending',   action: () => { setShowCmd(false); setSort('hot'); } },
                { icon: '✓',  label: 'Answered briefs',  sub: 'Resolved questions', action: () => { setShowCmd(false); setSort('top'); } },
                { icon: '◯',  label: 'Open questions',   sub: 'Unanswered threads', action: () => { setShowCmd(false); setSort('unanswered'); } },
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
              {ROOMS.map(r => (
                <div key={r.name} className="cmd-item" onClick={() => setShowCmd(false)}>
                  <div className="cmd-icon" style={{ fontSize: 11, fontFamily: 'var(--font-mono), monospace' }}>
                    {r.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, color: 'var(--text)' }}>{r.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{r.count} discussions</div>
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
    </>
  );
}

/* ─────────────────────────────────────────────
   THREAD VIEW
───────────────────────────────────────────── */
function ThreadView({
  post,
  onBack,
  onPostUpdated,
  showToast,
}: {
  post: Post;
  onBack: () => void;
  onPostUpdated: (post: Post) => void;
  showToast: (m: string) => void;
}) {
  const [replies,   setReplies]   = useState<Comment[]>([]);
  const [replyText, setReplyText] = useState('');
  const [sending,   setSending]   = useState(false);
  const [typing,    setTyping]    = useState(false);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void supabase
        .from('comments').select('*')
        .eq('post_id', post.id).order('created_at')
        .then(({ data, error }) => {
          if (error) {
            showToast(error.message);
            setReplies([]);
            return;
          }

          const nextReplies = (data || []) as Comment[];
          setReplies(nextReplies);

          if (post.reply_count !== nextReplies.length) {
            onPostUpdated({ ...post, reply_count: nextReplies.length });
          }
        });
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [onPostUpdated, post, showToast]);

  async function sendReply() {
    const text = replyText.trim();
    if (!text) return;
    if (text.length < 8) {
      showToast('Replies should be at least 8 characters.');
      return;
    }

    setSending(true); setTyping(true);
    setReplyText('');
    await new Promise(r => setTimeout(r, 1200));
    setTyping(false);

    let response = await supabase
      .from('comments')
      .insert({ post_id: post.id, body: text, author: randomAnonymousAuthor(), hidden: false })
      .select().single();

    if (response.error && response.error.message.toLowerCase().includes('column')) {
      response = await supabase
        .from('comments')
        .insert({ post_id: post.id, body: text, author: randomAnonymousAuthor() })
        .select().single();
    }

    const { data, error } = response;

    if (error || !data) {
      setReplyText(text);
      setSending(false);
      showToast(error?.message ?? 'Reply could not be recorded.');
      return;
    }

    const nextReplies = [...replies, data as Comment];
    const updatedPost = { ...post, reply_count: nextReplies.length };

    setReplies(nextReplies);
    onPostUpdated(updatedPost);
    await supabase.from('posts').update({ reply_count: nextReplies.length }).eq('id', post.id);
    setSending(false);
    showToast('Reply posted anonymously');
  }

  return (
    <div className="thread-layout" style={{
      maxWidth: 1180, margin: '0 auto', padding: '36px 28px 56px',
      display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px',
    }}>
      <main className="thread-view casebook-feed" style={{ paddingRight: 28 }}>
        <button className="back-btn" onClick={onBack}>← Back to briefs</button>

        {/* header */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <span className="tag" style={{ background: MOOD_BG[post.mood], color: MOOD_COLORS[post.mood] }}>
              {MOOD_LABEL[post.mood]}
            </span>
            <span style={{ color: 'var(--muted)', fontSize: 12, fontFamily: 'var(--font-mono), monospace' }}>
              by <strong style={{ color: 'var(--text)' }}>{getHandle(post.author)}</strong>
            </span>
            <span style={{ color: 'var(--muted)', fontSize: 11, fontFamily: 'var(--font-mono), monospace', marginLeft: 'auto' }}>
              {timeAgo(post.created_at)} ago
            </span>
          </div>
          <div className="thread-title">{post.title}</div>
          {post.body && (
            <p style={{ color: 'var(--text)', lineHeight: 1.75, fontSize: 14, marginBottom: 16 }}>
              {post.body}
            </p>
          )}
          <div className="post-footer-meta">
            <span>{post.reply_count} {post.reply_count === 1 ? 'reply' : 'replies'}</span>
            <span>{post.upvotes} upvotes</span>
          </div>
        </div>

        {/* replies */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 20 }}>
          <h3 style={{ fontFamily: 'var(--font-display), serif', fontSize: 20, color: 'var(--ink)', marginBottom: 4 }}>
            Replies
          </h3>
          <p style={{ color: 'var(--muted)', fontSize: 11, fontFamily: 'var(--font-mono), monospace', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 18 }}>
            Concrete · useful · anonymous-safe
          </p>

          {replies.length === 0 && !typing && (
            <div style={{ color: 'var(--muted)', fontSize: 13, padding: 14, background: 'rgba(255,253,247,0.6)', border: '1px solid var(--border)', borderRadius: 10, fontFamily: 'var(--font-mono), monospace', letterSpacing: '0.06em', textAlign: 'center' }}>
              No replies yet — be the first.
            </div>
          )}

          {replies.map(r => (
            <div
              key={r.id}
              style={{ display: 'flex', gap: 10, padding: '12px 8px', borderTop: '1px solid var(--border)', borderRadius: 6, margin: '0 -8px', transition: 'background .15s' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(238,229,211,0.4)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent), #0D4F46)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontFamily: 'var(--font-mono), monospace', flexShrink: 0 }}>
                {getHandle(r.author).split(' ').slice(0, 2).map((w: string) => w[0]).join('')}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontFamily: 'var(--font-mono), monospace', color: 'var(--muted)', marginBottom: 4, letterSpacing: '0.04em' }}>
                  {getHandle(r.author)} <span style={{ opacity: .6 }}>· {timeAgo(r.created_at)}</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.65 }}>{r.body}</div>
              </div>
            </div>
          ))}

          {/* typing indicator */}
          {typing && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 8px', borderTop: '1px solid var(--border)' }}>
              <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'var(--muted)', flexShrink: 0 }}>?</div>
              <div style={{ display: 'flex', gap: 3 }}>
                {[0, 0.2, 0.4].map(d => (
                  <span key={d} className="typing-dot" style={{ animationDelay: `${d}s` }} />
                ))}
              </div>
              <span style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-mono), monospace', letterSpacing: '0.06em' }}>
                someone is typing…
              </span>
            </div>
          )}

          {/* reply input */}
          <div className="reply-row" style={{ marginTop: 16 }}>
            <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'var(--muted)', flexShrink: 0 }}>?</div>
            <input
              className="reply-input"
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendReply()}
              placeholder="Add a grounded, anonymous reply…"
            />
            <button
              className="reply-send"
              onClick={sendReply}
              disabled={sending}
              style={{ opacity: sending ? .6 : 1 }}
            >➤</button>
          </div>
        </div>
      </main>

      {/* thread sidebar */}
      <aside className="rail">
        <div style={{ background: 'rgba(255,253,247,0.7)', border: '1px solid var(--border)', borderRadius: 14, padding: '1rem 1.1rem' }}>
          <div style={{ fontSize: 9, fontFamily: 'var(--font-mono), monospace', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
            About this brief
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-mono), monospace', letterSpacing: '0.04em' }}>
            <span>📅 {new Date(post.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            <span>✍️ {getHandle(post.author)}</span>
            <span>💬 {post.reply_count} replies</span>
            <span>↑ {post.upvotes} upvotes</span>
          </div>
        </div>

        <div style={{ background: 'rgba(23,107,96,0.06)', border: '1px solid rgba(23,107,96,0.15)', borderRadius: 14, padding: '1rem 1.1rem', textAlign: 'center' }}>
          <p style={{ fontFamily: 'var(--font-display), serif', fontSize: '0.95rem', fontWeight: 600, color: 'var(--ink)', marginBottom: 4, lineHeight: 1.4 }}>
            Know something helpful?
          </p>
          <small style={{ display: 'block', fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-mono), monospace', letterSpacing: '0.05em' }}>
            All replies are anonymous by default.
          </small>
        </div>
      </aside>
    </div>
  );
}
