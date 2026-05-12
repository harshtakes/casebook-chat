'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Post, PostCategory, formatTimeAgo, postCategories } from '@/components/home/types';

const roomIntel: Record<PostCategory, { brief: string; ask: string; signal: string }> = {
  Recruitment: {
    brief: 'Applications, callbacks, PPO whispers, interview loops, and the prestige math behind first jobs.',
    ask: 'What should I optimize for before recruitment season starts?',
    signal: 'Placement desk',
  },
  Internships: {
    brief: 'Real talk on chambers, firm teams, cold emails, work quality, and how juniors are treated.',
    ask: 'Which internships actually teach useful lawyering?',
    signal: 'Opportunity desk',
  },
  'Law School': {
    brief: 'Campus culture, moots, journals, committees, grades, burnout, and the hidden curriculum.',
    ask: 'How do I make law school less confusing and more strategic?',
    signal: 'Campus desk',
  },
  Firms: {
    brief: 'Team reputations, partner styles, practice groups, exit options, and what brand names hide.',
    ask: 'Which firm choice compounds best after two years?',
    signal: 'Firm desk',
  },
  Chambers: {
    brief: 'Litigation apprenticeships, court exposure, drafting responsibility, stipends, and senior culture.',
    ask: 'How do I pick a chamber without reliable public information?',
    signal: 'Court desk',
  },
  Salaries: {
    brief: 'Pay bands, stipends, negotiation, delayed offers, city costs, and money talk without awkwardness.',
    ask: 'What is fair compensation at my stage?',
    signal: 'Comp desk',
  },
  'Work-Life': {
    brief: 'Hours, health, weekends, toxic teams, recovery, and deciding what ambition should cost.',
    ask: 'How do I stay ambitious without burning out?',
    signal: 'Life desk',
  },
  'Career Advice': {
    brief: 'First-generation questions, pivots, mentors, CV choices, LLM decisions, and long-game planning.',
    ask: 'What would a senior tell me if they were being completely candid?',
    signal: 'Mentor desk',
  },
};

function isSchemaBehind(message = '') {
  const normalizedMessage = message.toLowerCase();
  return normalizedMessage.includes('schema cache') || normalizedMessage.includes('column');
}

export default function TopicsPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const loadTopics = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');

    let response = await supabase
      .from('posts')
      .select('*')
      .or('hidden.is.null,hidden.eq.false')
      .order('created_at', { ascending: false })
      .limit(120);

    if (response.error && isSchemaBehind(response.error.message)) {
      response = await supabase.from('posts').select('*').order('created_at', { ascending: false }).limit(120);
    }

    if (response.error) {
      setErrorMessage('Live Supabase data is unavailable, so this atlas is showing room desks without live brief counts.');
      setPosts([]);
    } else {
      setPosts((response.data ?? []) as Post[]);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadTopics();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [loadTopics]);

  const topicCards = useMemo(() => {
    const visiblePosts = posts.filter((post) => !post.hidden);

    return postCategories.map((category) => {
      const categoryPosts = visiblePosts.filter((post) => (post.category || 'Career Advice') === category);
      const latestPost = categoryPosts[0] ?? null;
      const unansweredCount = categoryPosts.filter((post) => post.reply_count === 0).length;
      const topPosts = [...categoryPosts].sort((firstPost, secondPost) => secondPost.upvotes - firstPost.upvotes).slice(0, 3);
      const recentPosts = categoryPosts.slice(0, 3);
      const openPosts = categoryPosts.filter((post) => post.reply_count === 0).slice(0, 2);

      return {
        category,
        count: categoryPosts.length,
        latestPost,
        recentPosts,
        openPosts,
        topPosts,
        unansweredCount,
      };
    });
  }, [posts]);

  const indexedCount = posts.length;

  return (
    <main style={{ maxWidth: 1220, margin: '0 auto', padding: '1.4rem 1.2rem 5rem' }}>
      <section className="live-tape" style={{ marginBottom: '1rem' }}>
        <div className="live-tape-track">
          {[...postCategories, ...postCategories].map((category, index) => (
            <div key={`${category}-${index}`} className="live-tape-item">
              <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{category}</span>
              <span>room atlas for law school, chambers, firms, salaries, and career confusion</span>
            </div>
          ))}
        </div>
      </section>

      <section className="hero-panel panel" style={{ borderRadius: 28, padding: '1.2rem', marginBottom: '1rem' }}>
        <div className="hero-grid">
          <div className="brief-stage">
            <div className="stage-panel" style={{ padding: '1.35rem' }}>
              <p className="luxury-kicker" style={{ marginBottom: 10 }}>Room atlas</p>
              <div className="editorial-meta" style={{ marginBottom: 12 }}>
                <span>All categories</span>
                <span>{indexedCount} briefs indexed</span>
                <span>Editorial browse</span>
              </div>
              <h1 style={{ fontSize: '3.1rem', lineHeight: 0.9, color: 'var(--ink)', marginBottom: 12, maxWidth: 760 }}>
                Browse the community by room, like you&apos;re moving through a live legal newspaper.
              </h1>
              <p style={{ maxWidth: 760, color: 'var(--muted)', fontSize: 14, marginBottom: 18 }}>
                Every room holds a different kind of anxiety: placements, internships, chambers, pay, prestige, and work-life tradeoffs. This page should feel like an atlas, not a boring index.
              </p>
              <div className="stage-summary">
                <div className="summary-puck">
                  <strong>{postCategories.length}</strong>
                  <span>rooms on the floor</span>
                </div>
                <div className="summary-puck">
                  <strong>{topicCards.reduce((count, topic) => count + topic.unansweredCount, 0)}</strong>
                  <span>open briefs across rooms</span>
                </div>
                <div className="summary-puck">
                  <strong>{indexedCount}</strong>
                  <span>recent discussions indexed</span>
                </div>
              </div>
            </div>
          </div>

          <div className="hero-aside">
            <div className="hero-signal vellum">
              <div className="aside-card-title" style={{ marginBottom: 8 }}>How to use it</div>
              <div className="signal-strip">
                {[
                  'Jump into a room to filter the homepage instantly.',
                  'Use the latest card to scan what just moved.',
                  'Use the top list to find the threads drawing attention.',
                ].map((text) => (
                  <div key={text} className="signal-card">
                    <strong>Navigator</strong>
                    <small>{text}</small>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 14 }}>
                <Link href="/" className="button-primary" style={{ display: 'inline-flex', textDecoration: 'none', borderRadius: 999, padding: '10px 16px', fontWeight: 700 }}>
                  Back to feed
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {errorMessage ? (
        <div className="mini-live-card" style={{ marginBottom: '1rem', borderRadius: 18, padding: '0.9rem 1rem' }}>
          <div className="mini-live-label">Live data paused</div>
          <div className="mini-live-copy">{errorMessage}</div>
        </div>
      ) : null}

      {loading ? (
        <div style={{ color: 'var(--muted)', padding: '2rem 0' }}>Loading topic rooms...</div>
      ) : (
        <section className="topics-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '1.15rem' }}>
          {topicCards.map((topic, index) => (
            <article
              key={topic.category}
              className="post-card vellum room-card"
              style={{
                borderRadius: 24,
                padding: '1.2rem',
                minHeight: 280,
                animation: 'fadeUp .42s ease both',
                animationDelay: `${index * 0.04}s`,
                position: 'relative',
                overflow: 'hidden',
                clipPath: 'none',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <div className="editorial-kicker">{roomIntel[topic.category].signal}</div>
                  <h2 style={{ fontFamily: 'var(--font-display), serif', color: 'var(--ink)', fontSize: '1.5rem', marginBottom: 4, lineHeight: 1.02 }}>
                    {topic.category}
                  </h2>
                  <p style={{ color: 'var(--muted)', fontSize: 13 }}>
                    {roomIntel[topic.category].brief}
                  </p>
                </div>
                <div className="masthead-counter" style={{ minWidth: 70 }}>
                  <strong style={{ fontSize: '2rem' }}>{topic.count}</strong>
                  <span>live</span>
                </div>
              </div>

              <div className="stage-summary" style={{ marginBottom: 14 }}>
                <div className="summary-puck">
                  <strong>{topic.count}</strong>
                  <span>briefs</span>
                </div>
                <div className="summary-puck">
                  <strong>{topic.unansweredCount}</strong>
                  <span>open</span>
                </div>
                <div className="summary-puck">
                  <strong>{topic.topPosts[0]?.upvotes ?? 0}</strong>
                  <span>top signal</span>
                </div>
              </div>

              <Link href={`/?category=${encodeURIComponent(topic.category)}`} style={{ display: 'inline-flex', color: 'var(--accent)', textDecoration: 'none', fontWeight: 800, marginBottom: 12 }}>
                Enter room
              </Link>

              {topic.latestPost ? (
                <Link
                  href={`/?thread=${topic.latestPost.id}`}
                  className="mini-live-card"
                  style={{ display: 'block', textDecoration: 'none', marginBottom: 12 }}
                >
                  <div className="mini-live-label">Latest filing · {formatTimeAgo(topic.latestPost.created_at)}</div>
                  <div className="mini-live-copy" style={{ fontWeight: 700 }}>
                    {topic.latestPost.title}
                  </div>
                </Link>
              ) : (
                <div className="mini-live-card" style={{ marginBottom: 12 }}>
                  <div className="mini-live-label">Starter question</div>
                  <div className="mini-live-copy">{roomIntel[topic.category].ask}</div>
                </div>
              )}

              <div style={{ display: 'grid', gap: 12 }}>
                <RoomList title="Top briefs" empty="No top briefs yet." posts={topic.topPosts} metric="upvotes" />
                <RoomList title="Open questions" empty="No open questions yet." posts={topic.openPosts} metric="replies" />
                <RoomList title="Recently filed" empty="No recent filings yet." posts={topic.recentPosts} metric="time" />
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}

function RoomList({
  title,
  empty,
  posts,
  metric,
}: {
  title: string;
  empty: string;
  posts: Post[];
  metric: 'upvotes' | 'replies' | 'time';
}) {
  return (
    <div>
      <div className="mini-live-label" style={{ marginBottom: 6 }}>{title}</div>
      <div style={{ display: 'grid', gap: 7 }}>
        {posts.length ? (
          posts.map((post) => (
            <Link key={`${title}-${post.id}`} href={`/?thread=${post.id}`} style={{ color: 'var(--muted)', textDecoration: 'none', fontSize: 13, display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{post.title}</span>
              <span style={{ fontFamily: 'var(--font-mono), monospace', color: 'var(--ink)', flexShrink: 0 }}>
                {metric === 'upvotes' ? post.upvotes : metric === 'replies' ? post.reply_count : formatTimeAgo(post.created_at)}
              </span>
            </Link>
          ))
        ) : (
          <span style={{ color: 'var(--muted)', fontSize: 13 }}>{empty}</span>
        )}
      </div>
    </div>
  );
}
