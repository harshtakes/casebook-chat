'use client';

import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import ThreadPanel from '@/components/home/ThreadPanel';
import ReportModal from '@/components/moderation/ReportModal';
import {
  Mood,
  Post,
  PostCategory,
  ReportReason,
  ReportTarget,
  SortKey,
  formatTimeAgo,
  getAnonymousHandle,
  moodMeta,
  postCategories,
  shareLinkForPost,
} from '@/components/home/types';

function subscribeToThreadParam(onStoreChange: () => void) {
  const handleChange = () => onStoreChange();

  window.addEventListener('popstate', handleChange);
  window.addEventListener('casebook:url-change', handleChange);

  return () => {
    window.removeEventListener('popstate', handleChange);
    window.removeEventListener('casebook:url-change', handleChange);
  };
}

function getThreadParamSnapshot() {
  return new URLSearchParams(window.location.search).get('thread');
}

function getCategoryParamSnapshot() {
  return new URLSearchParams(window.location.search).get('category');
}

function isSchemaBehind(message = '') {
  const normalizedMessage = message.toLowerCase();
  return normalizedMessage.includes('schema cache') || normalizedMessage.includes('column') || normalizedMessage.includes('constraint');
}

export default function HomePage() {
  const { user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [renderedAt] = useState(() => Date.now());
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<SortKey>('hot');
  const [query, setQuery] = useState('');
  const [showComposer, setShowComposer] = useState(false);
  const [composer, setComposer] = useState({
    title: '',
    body: '',
    mood: 'neutral' as Mood,
    category: 'Career Advice' as PostCategory,
  });
  const [submitting, setSubmitting] = useState(false);
  const [submittingReport, setSubmittingReport] = useState(false);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [schemaWarning, setSchemaWarning] = useState(false);
  const [toast, setToast] = useState('');
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPostTimeRef = useRef(0);
  const selectedPostId = useSyncExternalStore(
    subscribeToThreadParam,
    getThreadParamSnapshot,
    () => null,
  );
  const selectedCategory = useSyncExternalStore(
    subscribeToThreadParam,
    getCategoryParamSnapshot,
    () => null,
  );

  const showToast = useCallback((message: string) => {
    setToast(message);

    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }

    toastTimerRef.current = setTimeout(() => {
      setToast('');
      toastTimerRef.current = null;
    }, 2200);
  }, []);

  const loadPosts = useCallback(async () => {
    setLoading(true);

    const buildRequest = (withHiddenFilter: boolean) => {
      let request = supabase.from('posts').select('*');

      if (withHiddenFilter) {
        request = request.or('hidden.is.null,hidden.eq.false');
      }

      if (sort === 'hot') {
        request = request.eq('mood', 'hot').order('upvotes', { ascending: false });
      } else if (sort === 'top') {
        request = request.order('upvotes', { ascending: false });
      } else if (sort === 'unanswered') {
        request = request.eq('reply_count', 0).order('created_at', { ascending: false });
      } else {
        request = request.order('created_at', { ascending: false });
      }

      return request.limit(24);
    };

    let { data, error } = await buildRequest(true);

    if (error && isSchemaBehind(error.message)) {
      const fallbackResponse = await buildRequest(false);
      data = fallbackResponse.data;
      error = fallbackResponse.error;
      setSchemaWarning(true);
    } else if (!error) {
      setSchemaWarning(false);
    }

    if (error) {
      showToast('Could not load discussions right now.');
      setPosts([]);
    } else {
      setPosts((data ?? []) as Post[]);
    }

    setLoading(false);
  }, [showToast, sort]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadPosts();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [loadPosts]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const openComposer = useCallback(() => {
    setShowComposer(true);
  }, []);

  const closeComposer = useCallback(() => {
    setShowComposer(false);
  }, []);

  const openReport = useCallback(
    (target: ReportTarget) => {
      if (!user) {
        router.push('/auth');
        return;
      }

      setReportTarget(target);
    },
    [router, user],
  );

  const navigateToThread = useCallback(
    (postId: string | null) => {
      const currentParams =
        typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search);

      if (postId) {
        currentParams.set('thread', postId);
      } else {
        currentParams.delete('thread');
      }

      const nextQuery = currentParams.toString();
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
      window.dispatchEvent(new CustomEvent('casebook:url-change'));
    },
    [pathname, router],
  );

  const clearCategoryFilter = useCallback(() => {
    const currentParams =
      typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search);

    currentParams.delete('category');
    const nextQuery = currentParams.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
    window.dispatchEvent(new CustomEvent('casebook:url-change'));
  }, [pathname, router]);

  const onAskShortcut = useEffectEvent(() => {
    openComposer();
  });

  const onSearchChange = useEffectEvent((event: Event) => {
    const customEvent = event as CustomEvent<string>;
    setQuery(customEvent.detail ?? '');
  });

  const onKeyboardShortcut = useEffectEvent((event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    const isEditable = target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);

    if (event.key === '/' && !isEditable) {
      event.preventDefault();
      const searchInput = document.querySelector<HTMLInputElement>('nav input[type="text"]');
      searchInput?.focus();
    }

    if (event.key.toLowerCase() === 'n' && !isEditable) {
      event.preventDefault();
      onAskShortcut();
    }

    if (event.key === 'Escape') {
      closeComposer();
      navigateToThread(null);
    }
  });

  useEffect(() => {
    const askListener = () => onAskShortcut();
    const searchListener = (event: Event) => onSearchChange(event);
    const keyboardListener = (event: KeyboardEvent) => onKeyboardShortcut(event);

    window.addEventListener('casebook:open-ask-modal', askListener);
    window.addEventListener('casebook:search-change', searchListener as EventListener);
    window.addEventListener('keydown', keyboardListener);

    return () => {
      window.removeEventListener('casebook:open-ask-modal', askListener);
      window.removeEventListener('casebook:search-change', searchListener as EventListener);
      window.removeEventListener('keydown', keyboardListener);
    };
  }, []);

  const filteredPosts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const categoryFilteredPosts = selectedCategory
      ? posts.filter((post) => (post.category || 'Career Advice') === selectedCategory)
      : posts;

    if (!normalizedQuery) {
      return categoryFilteredPosts;
    }

    return categoryFilteredPosts.filter((post) => {
      const haystack = [post.title, post.body, post.author, post.mood, post.category ?? ''].join(' ').toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [posts, query, selectedCategory]);

  const [selectedPost, setSelectedPost] = useState<Post | null>(null);

  useEffect(() => {
    if (!selectedPostId) {
      setSelectedPost(null);
      return;
    }
    // Use cached post from feed if available
    const cached = posts.find((p) => p.id === selectedPostId);
    if (cached) {
      setSelectedPost(cached);
      return;
    }
    // Post not in current feed (e.g. direct link) — fetch it directly
    void supabase
      .from('posts')
      .select('*')
      .eq('id', selectedPostId)
      .single()
      .then(({ data, error }) => {
        if (error) {
          showToast('Could not load that thread.');
          return;
        }
        if (data) setSelectedPost(data as Post);
      });
  }, [selectedPostId, posts, showToast]);

  const spotlightPost = useMemo(() => {
    return [...filteredPosts].sort((left, right) => {
      if (right.upvotes !== left.upvotes) {
        return right.upvotes - left.upvotes;
      }

      return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
    })[0] ?? null;
  }, [filteredPosts]);

  const submitPost = useCallback(async () => {
    const title = composer.title.trim();
    const body = composer.body.trim();

    if (!title) {
      showToast('Add a question title first.');
      return;
    }

    if (title.length < 12) {
      showToast('Question titles should be at least 12 characters.');
      return;
    }

    if (title.length > 180) {
      showToast('Question titles should stay under 180 characters.');
      return;
    }

    if (body.length > 2500) {
      showToast('Question details should stay under 2500 characters.');
      return;
    }

    if (Date.now() - lastPostTimeRef.current < 15000) {
      showToast('Please wait a few seconds before posting again.');
      return;
    }

    setSubmitting(true);

    const fallbackPayload = {
      title,
      body,
      author: user?.email ?? 'anonymous',
      mood: composer.mood,
      upvotes: 0,
      reply_count: 0,
    };
    let response = await supabase
      .from('posts')
      .insert({
        ...fallbackPayload,
        category: composer.category,
        hidden: false,
      })
      .select('*')
      .single();

    if (response.error && isSchemaBehind(response.error.message)) {
      response = await supabase.from('posts').insert(fallbackPayload).select('*').single();
    }

    const { data, error } = response;

    setSubmitting(false);

    if (error || !data) {
      console.error('Post insert error:', error);
      showToast(`Could not post brief: ${error?.message ?? 'no data returned'}`);
      return;
    }

    setPosts((currentPosts) => [data as Post, ...currentPosts]);
    lastPostTimeRef.current = Date.now();
    setComposer({ title: '', body: '', mood: 'neutral', category: 'Career Advice' });
    setShowComposer(false);
    showToast('Question posted.');
  }, [composer, showToast, user]);

  const submitReport = useCallback(
    async ({ reason, details }: { reason: ReportReason; details: string }) => {
      if (!reportTarget) {
        return;
      }

      setSubmittingReport(true);

      const { error } = await supabase.from('reports').insert({
        target_id: reportTarget.id,
        target_type: reportTarget.type,
        reason,
        details: details.trim() || null,
        reporter_email: user?.email ?? null,
        status: 'open',
      });

      setSubmittingReport(false);

      if (error) {
        if (error.message.includes('public.reports')) {
          showToast('Reports table is not set up yet. See supabase/reports_setup.sql.');
        } else {
          showToast('Report could not be submitted.');
        }
        return;
      }

      setReportTarget(null);
      showToast('Report submitted for review.');
    },
    [reportTarget, showToast, user],
  );

  const handleUpvote = useCallback(
    async (post: Post) => {
      const nextUpvotes = post.upvotes + 1;

      setPosts((currentPosts) =>
        currentPosts.map((currentPost) =>
          currentPost.id === post.id ? { ...currentPost, upvotes: nextUpvotes } : currentPost,
        ),
      );

      const { error } = await supabase.from('posts').update({ upvotes: nextUpvotes }).eq('id', post.id);

      if (error) {
        setPosts((currentPosts) =>
          currentPosts.map((currentPost) =>
            currentPost.id === post.id ? { ...currentPost, upvotes: post.upvotes } : currentPost,
          ),
        );
        showToast('Could not record that upvote.');
      }
    },
    [showToast],
  );

  const handleShare = useCallback(
    async (postId: string) => {
      const link = shareLinkForPost(postId);

      if (!link) {
        showToast('Share link is not available right now.');
        return;
      }

      try {
        await navigator.clipboard.writeText(link);
        showToast('Link copied.');
      } catch {
        showToast(link);
      }
    },
    [showToast],
  );

  const topicCounts = useMemo(() => {
    const counts = new Map<string, number>();

    for (const post of posts) {
      const key = post.category || moodMeta[post.mood].label;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [posts]);

  return (
    <>
      <Toast message={toast} />

      <div
        className="feed-shell shell-frame"
        style={{
          maxWidth: 1220,
          margin: '1rem auto 0',
          padding: '1.1rem 1.2rem 5rem',
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) 310px',
          gap: '1.25rem',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <main style={{ minWidth: 0 }}>
          <LiveTape posts={posts} />

          <Hero
            posts={posts}
            spotlightPost={spotlightPost}
            renderedAt={renderedAt}
            onAsk={openComposer}
          />

          {schemaWarning ? <SetupNudge /> : null}

          {selectedPost ? (
            <ThreadPanel
              post={selectedPost}
              onBack={() => navigateToThread(null)}
              onPostUpdated={(updatedPost) => {
                setSelectedPost(updatedPost);
                setPosts((currentPosts) =>
                  currentPosts.map((post) => (post.id === updatedPost.id ? updatedPost : post)),
                );
              }}
              onReport={openReport}
              onShare={handleShare}
              showToast={showToast}
            />
          ) : (
            <Feed
              filteredPosts={filteredPosts}
              loading={loading}
              query={query}
              selectedCategory={selectedCategory}
              spotlightPost={spotlightPost}
              sort={sort}
              onAsk={openComposer}
              onClearCategory={clearCategoryFilter}
              onOpenPost={navigateToThread}
              onReport={openReport}
              onSetSort={setSort}
              onShare={handleShare}
              onUpvote={handleUpvote}
            />
          )}
        </main>

        <Sidebar posts={posts} renderedAt={renderedAt} topicCounts={topicCounts} onAsk={openComposer} />
      </div>

      <button id="floatAsk" className="float-ask show" onClick={openComposer}>
        New anonymous brief
      </button>

      {showComposer ? (
        <ComposerModal
          composer={composer}
          submitting={submitting}
          onCancel={closeComposer}
          onChange={setComposer}
          onSubmit={submitPost}
        />
      ) : null}

      {reportTarget ? (
        <ReportModal
          submitting={submittingReport}
          target={reportTarget}
          onCancel={() => setReportTarget(null)}
          onSubmit={submitReport}
        />
      ) : null}
    </>
  );
}

function LiveTape({ posts }: { posts: Post[] }) {
  const items = useMemo(() => {
    const source = posts.length
      ? [...posts]
          .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
          .slice(0, 6)
          .map((post) => ({
            label: post.category || moodMeta[post.mood].label,
            text: post.title,
          }))
      : [
          { label: 'Recruitment', text: 'Ask candid placement questions without broadcasting your identity.' },
          { label: 'Law School', text: 'Trade notes on moots, journals, campuses, and day-to-day reality.' },
          { label: 'Salaries', text: 'Surface money, prestige, and work-life tradeoffs anonymously.' },
        ];

    return [...source, ...source];
  }, [posts]);

  return (
    <section className="live-tape" style={{ marginBottom: '1rem' }}>
      <div className="live-tape-track">
        {items.map((item, index) => (
          <div key={`${item.label}-${index}`} className="live-tape-item">
            <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{item.label}</span>
            <span>{item.text}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function SetupNudge() {
  return (
    <div style={{ background: 'var(--accent-soft)', border: '1px solid rgba(85,119,102,.22)', borderRadius: 14, padding: '0.85rem 1rem', color: 'var(--ink)', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
      <span>
        Supabase schema is partly behind. Public fallback is active, but moderation/category persistence needs setup.
      </span>
      <Link href="/setup" style={{ color: 'var(--accent)', fontWeight: 800, textDecoration: 'none' }}>
        Check setup
      </Link>
    </div>
  );
}

function Toast({ message }: { message: string }) {
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 90,
        right: 24,
        background: 'var(--ink)',
        color: '#F5F0EC',
        padding: '10px 16px',
        borderRadius: 10,
        fontSize: 13,
        boxShadow: '0 8px 30px rgba(0,0,0,.25)',
        zIndex: 700,
        transform: message ? 'translateY(0)' : 'translateY(20px)',
        opacity: message ? 1 : 0,
        transition: 'transform .3s cubic-bezier(.34,1.56,.64,1), opacity .3s',
        pointerEvents: 'none',
      }}
    >
      {message}
    </div>
  );
}

function Hero({
  posts,
  spotlightPost,
  renderedAt,
  onAsk,
}: {
  posts: Post[];
  spotlightPost: Post | null;
  renderedAt: number;
  onAsk: () => void;
}) {
  const briefsToday = posts.filter((post) => {
    const createdAt = new Date(post.created_at).getTime();
    return renderedAt - createdAt < 1000 * 60 * 60 * 24;
  }).length;

  const topCategory = (() => {
    const counts = new Map<string, number>();

    for (const post of posts) {
      const key = post.category || 'Career Advice';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Career Advice';
  })();

  const answeredBriefs = posts.filter((post) => post.reply_count > 0).length;
  const openBriefs = posts.filter((post) => post.reply_count === 0).length;
  const tickerDate = new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(renderedAt));

  return (
    <section
      className="hero-panel panel"
      style={{
        borderRadius: 28,
        padding: '1.25rem',
        marginBottom: '1.25rem',
      }}
    >
      <div className="hero-grid">
        <div className="brief-stage">
          <div className="stage-panel" style={{ padding: '1.35rem' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 16,
                alignItems: 'flex-start',
                marginBottom: 18,
                flexWrap: 'wrap',
              }}
            >
              <div>
                <p className="luxury-kicker" style={{ marginBottom: 10 }}>
                  The brief room
                </p>
                <div className="editorial-meta">
                  <span>Anonymous</span>
                  <span>Indian law students + early-career lawyers</span>
                  <span>{tickerDate}</span>
                </div>
              </div>

              <div className="masthead-counter">
                <strong>{posts.length}</strong>
                <span>briefs live</span>
              </div>
            </div>

            <h1 style={{ fontSize: '3.4rem', lineHeight: 0.9, color: 'var(--ink)', maxWidth: 760, marginBottom: 14, fontWeight: 600 }}>
              Candid law-school and career conversations, staged like a living legal paper.
            </h1>

            <p style={{ maxWidth: 760, color: 'var(--muted)', fontSize: 14, marginBottom: 20 }}>
              Built for students and junior lawyers who need signal, not performance. Ask sensitive questions anonymously, move through rooms fast, and see what the community is actually wrestling with right now.
            </p>

            <div className="live-spotlight" style={{ marginBottom: 18 }}>
              <span className="live-spotlight-label">Lead brief</span>
              <div className="live-spotlight-body">
                {spotlightPost ? (
                  <>
                    <strong style={{ color: 'var(--ink)', display: 'block', marginBottom: 4 }}>{spotlightPost.title}</strong>
                    <span>
                      {spotlightPost.category || 'Career Advice'} room, {spotlightPost.upvotes} upvotes, {spotlightPost.reply_count}{' '}
                      {spotlightPost.reply_count === 1 ? 'reply' : 'replies'}.
                    </span>
                  </>
                ) : (
                  'The room is warming up. Once briefs load, this space spotlights the strongest live conversation.'
                )}
              </div>
            </div>

            <div className="stage-summary" style={{ marginBottom: 18 }}>
              <div className="summary-puck">
                <strong>{briefsToday}</strong>
                <span>filed in the last 24 hours</span>
              </div>
              <div className="summary-puck">
                <strong>{openBriefs}</strong>
                <span>still waiting on grounded answers</span>
              </div>
              <div className="summary-puck">
                <strong>{answeredBriefs}</strong>
                <span>already carrying replies</span>
              </div>
              <div className="summary-puck">
                <strong>{topCategory}</strong>
                <span>leading room on the floor</span>
              </div>
            </div>

            <div className="hero-meta-row" style={{ marginBottom: 18 }}>
              {[
                'No public emails in the feed',
                'Room-led browsing instead of noisy dashboards',
                'Quick ask, search, and thread jumps built in',
              ].map((note) => (
                <span key={note} className="hero-note">
                  {note}
                </span>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="button-primary" onClick={onAsk} style={{ padding: '11px 17px', borderRadius: 999, fontWeight: 700 }}>
                Start anonymous brief
              </button>
              <Link href="/topics" style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid rgba(195,160,90,.34)', background: 'rgba(255,250,239,.64)', color: 'var(--ink)', padding: '11px 14px', borderRadius: 999, fontWeight: 700, textDecoration: 'none' }}>
                Browse rooms
              </Link>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 12px', borderRadius: 999, border: '1px solid var(--border)', background: 'rgba(255,255,255,.58)', color: 'var(--muted)' }}>
                Press <kbd style={{ fontFamily: 'var(--font-mono), monospace', fontSize: 11 }}>/</kbd> to search and <kbd style={{ fontFamily: 'var(--font-mono), monospace', fontSize: 11 }}>N</kbd> to ask.
              </div>
            </div>
          </div>
        </div>

        <div className="hero-aside">
          <div className="hero-signal vellum pulse-panel">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 12 }}>
              <div>
                <div className="aside-card-title">
                  Casebook pulse
                </div>
                <div style={{ color: 'var(--ink)', fontFamily: 'var(--font-display), serif', fontSize: '1.18rem' }}>
                  What this edition feels like
                </div>
              </div>
              <div className="status-pill">
                <span className="status-dot" />
                <strong>Live</strong>
              </div>
            </div>

            <div className="pulse-readout">
              <div className="pulse-readout-label">Floor note</div>
              <div className="pulse-readout-text">
                {spotlightPost
                  ? `${spotlightPost.category || 'Career Advice'} is setting the tone. The room is leaning toward ${moodMeta[spotlightPost.mood].label.toLowerCase()} discussion with high engagement around concrete tradeoffs.`
                  : 'The floor note updates once the first set of discussions loads.'}
              </div>
            </div>

            <div className="data-grid">
              <div className="data-tile">
                <strong>{briefsToday}</strong>
                <span>briefs today</span>
              </div>
              <div className="data-tile">
                <strong>{answeredBriefs}</strong>
                <span>answered briefs</span>
              </div>
              <div className="data-tile">
                <strong>{topCategory}</strong>
                <span>leading room</span>
              </div>
            </div>

            <div className="signal-strip" style={{ marginTop: 14 }}>
              {[
                {
                  label: 'Quiet ask',
                  text: 'Anonymous posting protects identity before it becomes a feature request.',
                },
                {
                  label: 'Room flow',
                  text: 'Threads, topics, reporting, and moderation stay one click away from the stage.',
                },
                {
                  label: 'Command center',
                  text: 'Search, jump, ask, setup, and moderation still run through the global command layer.',
                },
              ].map((item) => (
                <div key={item.label} className="signal-card">
                  <strong>{item.label}</strong>
                  <small>{item.text}</small>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 14, borderTop: '1px solid rgba(222,209,187,.72)', paddingTop: 14 }}>
              <div className="aside-card-title" style={{ marginBottom: 8 }}>
                Room promise
              </div>
              <p style={{ color: 'var(--text)', fontSize: 13, lineHeight: 1.65 }}>
                No public emails, no noisy profile layer, no crowded dashboard. Just clean rooms and better questions.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

type FeedProps = {
  filteredPosts: Post[];
  loading: boolean;
  query: string;
  selectedCategory: string | null;
  spotlightPost: Post | null;
  sort: SortKey;
  onAsk: () => void;
  onClearCategory: () => void;
  onOpenPost: (postId: string) => void;
  onReport: (target: ReportTarget) => void;
  onSetSort: (sort: SortKey) => void;
  onShare: (postId: string) => Promise<void>;
  onUpvote: (post: Post) => Promise<void>;
};

function Feed({
  filteredPosts,
  loading,
  query,
  selectedCategory,
  spotlightPost,
  sort,
  onAsk,
  onClearCategory,
  onOpenPost,
  onReport,
  onSetSort,
  onShare,
  onUpvote,
}: FeedProps) {
  const leadId = spotlightPost?.id ?? null;
  const orderedPosts = useMemo(() => {
    if (!leadId) {
      return filteredPosts;
    }

    const featured = filteredPosts.find((post) => post.id === leadId);
    if (!featured) {
      return filteredPosts;
    }

    return [featured, ...filteredPosts.filter((post) => post.id !== leadId)];
  }, [filteredPosts, leadId]);

  return (
    <>
      <div className="vellum" style={{ borderRadius: 24, padding: '1rem', marginBottom: '1rem' }}>
        <button
          onClick={onAsk}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            textAlign: 'left',
            background: 'rgba(255,255,255,.56)',
            border: '1px solid rgba(222,209,187,.86)',
            borderRadius: 18,
            padding: '0.95rem 1rem',
            marginBottom: 14,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 999,
              background: 'linear-gradient(135deg, var(--accent), #0F514A)',
              color: '#fff',
              display: 'grid',
              placeItems: 'center',
              fontFamily: 'var(--font-mono), monospace',
              fontSize: 11,
              flexShrink: 0,
            }}
          >
            ASK
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: 'var(--ink)', fontWeight: 700, marginBottom: 2 }}>What do you need honest help with?</div>
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>Open a discreet brief for internships, chambers, firms, salaries, or campus confusion.</div>
          </div>
          <div className="mono-type" style={{ color: 'var(--muted)', fontSize: 11 }}>
            N
          </div>
        </button>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div className="editorial-kicker">Edition feed</div>
            <h2 style={{ fontSize: '2rem', color: 'var(--ink)', marginBottom: 4 }}>Today&apos;s briefs</h2>
            <p style={{ color: 'var(--muted)', fontSize: 13 }}>
              {query
                ? `Showing ${filteredPosts.length} results for "${query}".`
                : selectedCategory
                  ? `Showing ${filteredPosts.length} discussions inside ${selectedCategory}.`
                  : 'The newest, hottest, and most useful anonymous discussion cards.'}
            </p>
          </div>

          <div className="editorial-sort-row">
            {([
              ['hot', 'Hot'],
              ['new', 'New'],
              ['top', 'Top'],
              ['unanswered', 'Open'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                onClick={() => onSetSort(value)}
                className={`editorial-sort-tab${sort === value ? ' active' : ''}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {selectedCategory ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: 'var(--accent-soft)', border: '1px solid rgba(85,119,102,.22)', borderRadius: 14, padding: '0.8rem 0.95rem', marginBottom: '1rem' }}>
          <span style={{ color: 'var(--ink)' }}>
            Topic filter active: <strong>{selectedCategory}</strong>
          </span>
          <button onClick={onClearCategory} style={{ border: '1px solid rgba(85,119,102,.24)', background: 'var(--surface)', color: 'var(--muted)', borderRadius: 999, padding: '6px 12px' }}>
            Clear
          </button>
        </div>
      ) : null}

      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted)' }}>Loading discussions...</div>
      ) : filteredPosts.length === 0 ? (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, padding: '2rem', textAlign: 'center' }}>
          <p style={{ fontFamily: 'var(--font-display), serif', fontSize: '1.2rem', color: 'var(--ink)', marginBottom: 8 }}>No discussions match that search yet.</p>
          <p style={{ color: 'var(--muted)', marginBottom: 16 }}>Try a broader term, or start the conversation yourself.</p>
          <button onClick={onAsk} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 999, padding: '10px 16px', fontWeight: 600 }}>
            Ask the first question
          </button>
        </div>
      ) : (
        orderedPosts.map((post, index) => (
          <article
            key={post.id}
            className={`post-card vellum dossier-rail mood-${post.mood}${post.id === leadId ? ' featured-brief' : ''}`}
            onClick={() => onOpenPost(post.id)}
            style={{
              borderLeft: '4px solid transparent',
              borderRadius: post.id === leadId ? 28 : 20,
              padding: post.id === leadId ? '1.35rem 1.4rem' : '1.05rem 1.15rem',
              marginBottom: 12,
              display: 'flex',
              gap: '1rem',
              animation: 'fadeUp .4s ease both',
              animationDelay: `${index * 0.04}s`,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  void onUpvote(post);
                }}
                style={{ width: 38, height: 38, borderRadius: 12, border: '1px solid rgba(195,160,90,.34)', background: 'linear-gradient(180deg, #fff, var(--surface-strong))', color: 'var(--accent)', fontWeight: 800 }}
                aria-label={`Upvote ${post.title}`}
              >
                ^
              </button>
              <span style={{ fontFamily: 'var(--font-mono), monospace', color: 'var(--muted)', fontSize: 12 }}>{post.upvotes}</span>
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 7 }}>
                {post.id === leadId ? (
                  <span className="lead-pill">Lead brief</span>
                ) : null}
                {post.category ? (
                  <span
                    className="brief-chip"
                    style={{
                      fontSize: 11,
                      borderRadius: 999,
                      padding: '4px 9px',
                      fontWeight: 600,
                      color: 'var(--muted)',
                    }}
                  >
                    {post.category}
                  </span>
                ) : null}
                <span
                  className={moodMeta[post.mood].className}
                  style={{
                    fontSize: 11,
                    borderRadius: 999,
                    padding: '4px 9px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '.04em',
                    background: post.mood === 'neutral' ? 'var(--tag-bg)' : undefined,
                    color: post.mood === 'neutral' ? 'var(--muted)' : undefined,
                  }}
                >
                  {moodMeta[post.mood].label}
                </span>
                <span style={{ color: 'var(--muted)', fontSize: 12 }}>
                  by <strong style={{ color: 'var(--text)', fontWeight: 600 }}>{getAnonymousHandle(post.author)}</strong>
                </span>
                <span style={{ color: '#B8B0A6', fontSize: 11, marginLeft: 'auto' }}>{formatTimeAgo(post.created_at)}</span>
              </div>

              <h3 style={{ fontFamily: 'var(--font-display), serif', fontSize: post.id === leadId ? '1.45rem' : '1.18rem', color: 'var(--ink)', lineHeight: post.id === leadId ? 1.08 : 1.18, marginBottom: 8, fontWeight: 600, maxWidth: post.id === leadId ? 780 : undefined }}>
                {post.title}
              </h3>

              {post.body ? (
                <p style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1.62, marginBottom: 10, display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: post.id === leadId ? 3 : 2, overflow: 'hidden' }}>
                  {post.body}
                </p>
              ) : null}

              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <span style={{ color: 'var(--muted)', fontSize: 12 }}>
                  {post.reply_count} {post.reply_count === 1 ? 'reply' : 'replies'}
                </span>
                <button
                  className="muted-link"
                  onClick={(event) => {
                    event.stopPropagation();
                    void onShare(post.id);
                  }}
                  style={{ background: 'none', border: 'none', color: 'var(--muted)', padding: 0, fontSize: 12 }}
                >
                  Share
                </button>
                <button
                  className="muted-link"
                  onClick={(event) => {
                    event.stopPropagation();
                    onReport({
                      id: post.id,
                      type: 'post',
                      title: post.title,
                      body: post.body,
                      author: post.author,
                    });
                  }}
                  style={{ background: 'none', border: 'none', color: 'var(--muted)', padding: 0, fontSize: 12 }}
                >
                  Report
                </button>
                <span className="brief-open-label" style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 12 }}>
                  Open brief
                </span>
              </div>
            </div>
          </article>
        ))
      )}
    </>
  );
}

function Sidebar({
  posts,
  renderedAt,
  topicCounts,
  onAsk,
}: {
  posts: Post[];
  renderedAt: number;
  topicCounts: Array<[string, number]>;
  onAsk: () => void;
}) {
  const activityBars = useMemo(() => {
    return Array.from({ length: 7 }, (_, index) => {
      const start = renderedAt - (6 - index) * 24 * 60 * 60 * 1000;
      const end = start + 24 * 60 * 60 * 1000;
      return posts.filter((post) => {
        const createdAt = new Date(post.created_at).getTime();
        return createdAt >= start && createdAt < end;
      }).length;
    });
  }, [posts, renderedAt]);

  const maxActivity = Math.max(...activityBars, 1);
  const moodCounts = useMemo(() => {
    return (['hot', 'answered', 'debated', 'neutral'] as const).map((mood) => ({
      mood,
      label: moodMeta[mood].label,
      count: posts.filter((post) => post.mood === mood).length,
      className: moodMeta[mood].className,
    }));
  }, [posts]);

  return (
    <aside className="feed-sidebar" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="navigator-card sticky">
        <div className="rail-heading" style={{ marginBottom: 12 }}>
          Activity barograph
        </div>

        <div style={{ display: 'flex', alignItems: 'end', gap: 4, height: 72, marginBottom: 8 }}>
          {activityBars.map((count, index) => (
            <div
              key={`${count}-${index}`}
              style={{
                flex: 1,
                height: `${Math.max(14, (count / maxActivity) * 100)}%`,
                borderRadius: '10px 10px 3px 3px',
                background: index === activityBars.length - 1
                  ? 'linear-gradient(180deg, var(--accent), #0F514A)'
                  : 'linear-gradient(180deg, rgba(23,107,96,.46), rgba(195,160,90,.3))',
              }}
            />
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)', fontSize: 10, fontFamily: 'var(--font-mono), monospace', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 16 }}>
          <span>6d ago</span>
          <span>Today</span>
        </div>

        <div className="rail-heading" style={{ marginBottom: 12 }}>
          Mood mix
        </div>
        <div style={{ display: 'grid', gap: 10, marginBottom: 18 }}>
          {moodCounts.map((entry) => (
            <div key={entry.mood} style={{ display: 'grid', gap: 5 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ color: 'var(--text)', fontSize: 12 }}>{entry.label}</span>
                <span style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono), monospace', fontSize: 11 }}>{entry.count}</span>
              </div>
              <div style={{ height: 7, borderRadius: 999, background: 'rgba(222,209,187,.72)', overflow: 'hidden' }}>
                <div
                  className={entry.className}
                  style={{
                    height: '100%',
                    width: `${posts.length ? (entry.count / posts.length) * 100 : 0}%`,
                    borderRadius: 999,
                    background:
                      entry.mood === 'hot'
                        ? 'linear-gradient(90deg, var(--stamp), #d88a67)'
                        : entry.mood === 'answered'
                          ? 'linear-gradient(90deg, var(--accent), #2E8C7E)'
                          : entry.mood === 'debated'
                            ? 'linear-gradient(90deg, var(--red), #C06B4C)'
                            : 'linear-gradient(90deg, var(--gold), #d6be83)',
                  }}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="mini-live-card" style={{ marginBottom: 16 }}>
          <div className="mini-live-label">Floor note</div>
          <div className="mini-live-copy">
            The rail should feel like an instrument panel, not a generic sidebar. It gives a fast read on motion, mood, and where to jump next.
          </div>
        </div>

        <div className="rail-heading" style={{ marginBottom: 12 }}>
          Top rooms
        </div>
        <div style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
          {topicCounts.length === 0 ? (
            <span style={{ color: 'var(--muted)' }}>Counts will appear once discussions load.</span>
          ) : (
            topicCounts.slice(0, 6).map(([label, count]) => {
              const width = topicCounts[0] ? (count / topicCounts[0][1]) * 100 : 0;

              return (
                <Link
                  key={label}
                  href={`/?category=${encodeURIComponent(label)}`}
                  className="quick-action"
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <strong>{label}</strong>
                    <span>{count} briefs filed</span>
                    <div style={{ height: 4, borderRadius: 999, background: 'rgba(222,209,187,.74)', marginTop: 8, overflow: 'hidden' }}>
                      <div style={{ width: `${width}%`, height: '100%', borderRadius: 999, background: 'linear-gradient(90deg, var(--accent), var(--gold))' }} />
                    </div>
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono), monospace', color: 'var(--muted)', fontSize: 11 }}>{count}</span>
                </Link>
              );
            })
          )}
        </div>

        <button className="button-primary" onClick={onAsk} style={{ width: '100%', borderRadius: 999, padding: '10px 12px', fontWeight: 700 }}>
          Start a brief
        </button>
      </div>
    </aside>
  );
}

type ComposerState = {
  title: string;
  body: string;
  mood: Mood;
  category: PostCategory;
};

type ComposerModalProps = {
  composer: ComposerState;
  submitting: boolean;
  onCancel: () => void;
  onChange: Dispatch<SetStateAction<ComposerState>>;
  onSubmit: () => Promise<void>;
};

function ComposerModal({ composer, submitting, onCancel, onChange, onSubmit }: ComposerModalProps) {
  return (
    <div
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onCancel();
        }
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(26,23,20,.45)',
        backdropFilter: 'blur(6px)',
        zIndex: 600,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div className="composer-sheet vellum" style={{ width: '100%', maxWidth: 590, borderRadius: 24, padding: '1.25rem', boxShadow: '0 28px 90px rgba(0,0,0,.22)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-display), serif', color: 'var(--ink)', fontSize: '1.34rem', lineHeight: 1.1 }}>Draft an anonymous brief</h2>
            <p style={{ color: 'var(--muted)', fontSize: 13 }}>Clear, candid, useful. No identifying details.</p>
          </div>
          <button onClick={onCancel} style={{ width: 32, height: 32, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)' }}>x</button>
        </div>

        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Title</label>
        <input
          value={composer.title}
          onChange={(event) => onChange((current) => ({ ...current, title: event.target.value }))}
          placeholder="What do you want honest help with?"
          style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', background: 'var(--bg)', marginBottom: 12 }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)', fontSize: 11, marginTop: -8, marginBottom: 10 }}>
          <span>Make it searchable and specific.</span>
          <span>{composer.title.trim().length}/180</span>
        </div>

        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Details</label>
        <textarea
          value={composer.body}
          onChange={(event) => onChange((current) => ({ ...current, body: event.target.value }))}
          placeholder="Context, college year, type of role, what you have already tried..."
          style={{ width: '100%', minHeight: 120, border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', background: 'var(--bg)', resize: 'vertical', marginBottom: 12 }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)', fontSize: 11, marginTop: -8, marginBottom: 10 }}>
          <span>Avoid names, roll numbers, phone numbers, and doxxing details.</span>
          <span>{composer.body.trim().length}/2500</span>
        </div>

        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Thread type</label>
        <select
          value={composer.mood}
          onChange={(event) => onChange((current) => ({ ...current, mood: event.target.value as Mood }))}
          style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', background: 'var(--bg)', marginBottom: 16 }}
        >
          <option value="neutral">Open question</option>
          <option value="hot">Hot topic</option>
          <option value="answered">Answered</option>
          <option value="debated">Debated</option>
        </select>

        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Category</label>
        <select
          value={composer.category}
          onChange={(event) => onChange((current) => ({ ...current, category: event.target.value as PostCategory }))}
          style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', background: 'var(--bg)', marginBottom: 16 }}
        >
          {postCategories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onCancel} style={{ border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', padding: '10px 14px', borderRadius: 10 }}>
            Cancel
          </button>
          <button className="button-primary" onClick={() => void onSubmit()} disabled={submitting} style={{ padding: '10px 14px', borderRadius: 10, fontWeight: 600, opacity: submitting ? 0.7 : 1 }}>
            {submitting ? 'Posting...' : 'Post brief'}
          </button>
        </div>
      </div>
    </div>
  );
}
