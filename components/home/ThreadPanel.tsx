'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Comment, Post, ReportTarget, formatTimeAgo, getAnonymousHandle, moodMeta } from '@/components/home/types';

function isSchemaBehind(message = '') {
  const normalizedMessage = message.toLowerCase();
  return normalizedMessage.includes('schema cache') || normalizedMessage.includes('column') || normalizedMessage.includes('constraint');
}

type ThreadPanelProps = {
  post: Post;
  onBack: () => void;
  onPostUpdated: (post: Post) => void;
  onShare: (postId: string) => Promise<void>;
  onReport: (target: ReportTarget) => void;
  showToast: (message: string) => void;
};

export default function ThreadPanel({
  post,
  onBack,
  onPostUpdated,
  onShare,
  onReport,
  showToast,
}: ThreadPanelProps) {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [reply, setReply] = useState('');
  const [loadingComments, setLoadingComments] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadComments() {
      setLoadingComments(true);

      let response = await supabase
        .from('comments')
        .select('*')
        .or('hidden.is.null,hidden.eq.false')
        .eq('post_id', post.id)
        .order('created_at', { ascending: true });

      if (response.error && isSchemaBehind(response.error.message)) {
        response = await supabase
          .from('comments')
          .select('*')
          .eq('post_id', post.id)
          .order('created_at', { ascending: true });
      }

      if (cancelled) return;

      if (response.error) {
        setComments([]);
        showToast('Could not load replies for this thread.');
      } else {
        setComments((response.data ?? []) as Comment[]);
      }

      setLoadingComments(false);
    }

    void loadComments();

    return () => {
      cancelled = true;
    };
  }, [post.id, showToast]);

  const submitReply = useCallback(async () => {
    const body = reply.trim();

    if (!body) {
      showToast('Reply cannot be empty.');
      return;
    }

    if (body.length > 1200) {
      showToast('Replies should stay under 1200 characters.');
      return;
    }

    setSending(true);

    const fallbackPayload = {
      post_id: post.id,
      body,
      author: user?.email ?? 'anonymous',
    };
    let response = await supabase
      .from('comments')
      .insert({
        ...fallbackPayload,
        hidden: false,
      })
      .select('*')
      .single();

    if (response.error && isSchemaBehind(response.error.message)) {
      response = await supabase.from('comments').insert(fallbackPayload).select('*').single();
    }

    const { data, error } = response;

if (error || !data) {
  setSending(false);
  console.error('Reply insert error:', error); // ← ADD THIS
showToast(`Reply failed: ${error?.message ?? 'no data returned'}`);
  return;
}

    const updatedPost = { ...post, reply_count: post.reply_count + 1 };

    setComments((currentComments) => [...currentComments, data as Comment]);
    setReply('');
    setSending(false);
    onPostUpdated(updatedPost);
    showToast('Reply posted.');

    await supabase.from('posts').update({ reply_count: updatedPost.reply_count }).eq('id', post.id);
  }, [onPostUpdated, post, reply, showToast, user]);

  const replyStats = useMemo(
    () => [
      ['Replies', String(post.reply_count)],
      ['Upvotes', String(post.upvotes)],
      ['Filed', formatTimeAgo(post.created_at)],
    ],
    [post.created_at, post.reply_count, post.upvotes],
  );

  return (
    <section className="thread-shell">
      <div className="vellum" style={{ borderRadius: 22, padding: '0.95rem 1rem', marginBottom: '0.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <button
            className="muted-link"
            onClick={onBack}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              border: '1px solid var(--border)',
              background: 'rgba(255,255,255,.62)',
              color: 'var(--muted)',
              borderRadius: 999,
              padding: '8px 12px',
            }}
          >
            Back to briefs
          </button>
          <div className="editorial-meta">
            <span>Thread edition</span>
            <span>{post.category || 'Career Advice'}</span>
            <span>{moodMeta[post.mood].label}</span>
          </div>
        </div>
      </div>

      <article
        className="vellum dossier-rail featured-brief"
        style={{
          borderRadius: 26,
          padding: '1.45rem',
          marginBottom: '1rem',
        }}
      >
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
          <span className="lead-pill">Open brief</span>
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
          {post.category ? (
            <span className="brief-chip" style={{ fontSize: 11, borderRadius: 999, padding: '4px 9px', fontWeight: 700, color: 'var(--muted)' }}>
              {post.category}
            </span>
          ) : null}
          <span style={{ color: 'var(--muted)', fontSize: 12 }}>
            by <strong style={{ color: 'var(--text)' }}>{getAnonymousHandle(post.author)}</strong>
          </span>
          <span style={{ color: '#B8B0A6', fontSize: 11, marginLeft: 'auto' }}>{formatTimeAgo(post.created_at)}</span>
        </div>

        <h2
          style={{
            fontFamily: 'var(--font-display), serif',
            fontSize: '2.25rem',
            lineHeight: 0.97,
            color: 'var(--ink)',
            marginBottom: 14,
            fontWeight: 600,
            maxWidth: 900,
          }}
        >
          {post.title}
        </h2>

        {post.body ? (
          <div className="live-spotlight" style={{ marginBottom: 16, maxWidth: 860 }}>
            <span className="live-spotlight-label">Case file</span>
            <div className="live-spotlight-body" style={{ color: 'var(--text)', lineHeight: 1.7 }}>
              {post.body}
            </div>
          </div>
        ) : null}

        <div className="stage-summary" style={{ marginBottom: 18 }}>
          {replyStats.map(([label, value]) => (
            <div key={label} className="summary-puck" style={{ minWidth: 120 }}>
              <strong>{value}</strong>
              <span>{label}</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', color: 'var(--muted)' }}>
          <button className="muted-link" onClick={() => void onShare(post.id)} style={{ background: 'none', border: 'none', color: 'inherit', padding: 0 }}>
            Share brief
          </button>
          <button
            className="muted-link"
            onClick={() =>
              onReport({
                id: post.id,
                type: 'post',
                title: post.title,
                body: post.body,
                author: post.author,
              })
            }
            style={{ background: 'none', border: 'none', color: 'inherit', padding: 0 }}
          >
            Report
          </button>
        </div>
      </article>

      <section
        className="vellum"
        style={{
          borderRadius: 22,
          padding: '1.2rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'end' }}>
          <div>
            <div className="editorial-kicker">Reply ledger</div>
            <h3 style={{ fontFamily: 'var(--font-display), serif', color: 'var(--ink)', fontSize: '1.5rem' }}>Replies</h3>
            <p style={{ color: 'var(--muted)', fontSize: 13 }}>Concrete, useful, anonymous-safe. Let the answer feel like it came from a senior who actually cared.</p>
          </div>
          <div className="status-pill">
            <span className="status-dot" />
            <strong>{comments.length} loaded</strong>
          </div>
        </div>

        {loadingComments ? (
          <p style={{ color: 'var(--muted)' }}>Loading replies...</p>
        ) : comments.length === 0 ? (
          <div className="mini-live-card" style={{ marginBottom: 16 }}>
            <div className="mini-live-label">No replies yet</div>
            <div className="mini-live-copy">The first grounded answer usually defines whether a thread becomes genuinely useful or just another noisy take pile.</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
            {comments.map((comment, index) => (
              <article key={comment.id} className="reply-card" style={{ animation: 'fadeUp .35s ease both', animationDelay: `${index * 0.03}s` }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                  <strong style={{ color: 'var(--text)', fontSize: 13 }}>{getAnonymousHandle(comment.author)}</strong>
                  <span style={{ color: 'var(--muted)', fontSize: 12 }}>{formatTimeAgo(comment.created_at)}</span>
                  <button
                    className="muted-link"
                    onClick={() =>
                      onReport({
                        id: comment.id,
                        type: 'comment',
                        title: `Reply in ${post.title}`,
                        body: comment.body,
                        author: comment.author,
                      })
                    }
                    style={{ background: 'none', border: 'none', color: 'var(--muted)', padding: 0, marginLeft: 'auto', fontSize: 12 }}
                  >
                    Report
                  </button>
                </div>
                <p style={{ color: 'var(--text)', fontSize: 13, lineHeight: 1.72 }}>{comment.body}</p>
              </article>
            ))}
          </div>
        )}

        <div
          className="stage-panel"
          style={{
            padding: '1rem',
            borderRadius: 22,
          }}
        >
          <div className="editorial-kicker" style={{ marginBottom: 10 }}>Add reply</div>
          <textarea
            value={reply}
            onChange={(event) => setReply(event.target.value)}
            placeholder="Add a grounded, anonymous reply."
            style={{
              width: '100%',
              minHeight: 120,
              border: '1px solid rgba(222,209,187,.92)',
              outline: 'none',
              background: 'rgba(255,255,255,.62)',
              borderRadius: 18,
              resize: 'vertical',
              marginBottom: 12,
              padding: '12px 14px',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--muted)', fontSize: 12 }}>
              Replies post under {getAnonymousHandle(user?.email ?? 'anonymous')}.
            </span>
            <button
              className="button-primary"
              onClick={() => void submitReply()}
              disabled={sending}
              style={{
                borderRadius: 999,
                padding: '10px 16px',
                fontWeight: 700,
                opacity: sending ? 0.7 : 1,
              }}
            >
              {sending ? 'Posting...' : 'Reply'}
            </button>
          </div>
        </div>
      </section>
    </section>
  );
}
