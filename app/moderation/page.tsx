'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Post, Comment, ReportRecord, formatTimeAgo, getAnonymousHandle } from '@/components/home/types';

type ModerationTarget = {
  headline: string;
  body: string;
  author: string;
  postId?: string;
};

type ReportStatusFilter = 'all' | 'open' | 'reviewed' | 'dismissed';

export default function ModerationPage() {
  const { user, loading: authLoading } = useAuth();
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingReportId, setUpdatingReportId] = useState<string | null>(null);
  const [updatingTargetKey, setUpdatingTargetKey] = useState<string | null>(null);
  const [missingReportsTable, setMissingReportsTable] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [moderationNotes, setModerationNotes] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState<ReportStatusFilter>('open');
  const moderatorEmails = useMemo(
    () =>
      (process.env.NEXT_PUBLIC_MODERATOR_EMAILS ?? '')
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
    [],
  );
  const isModerator = !!user?.email && moderatorEmails.includes(user.email.toLowerCase());

  async function refreshReports() {
    const reportsResponse = await supabase.from('reports').select('*').order('created_at', { ascending: false }).limit(100);

    if (reportsResponse.error) {
      if (reportsResponse.error.message.includes('public.reports')) {
        setMissingReportsTable(true);
        setErrorMessage('');
      } else {
        setErrorMessage(reportsResponse.error.message);
      }
      setReports([]);
      return;
    }

    setMissingReportsTable(false);
    const nextReports = (reportsResponse.data ?? []) as ReportRecord[];
    setReports(nextReports);
    setModerationNotes((currentNotes) => {
      const nextNotes: Record<string, string> = {};

      nextReports.forEach((report) => {
        nextNotes[report.id] = currentNotes[report.id] ?? report.moderation_notes ?? '';
      });

      return nextNotes;
    });
  }

  async function refreshTargets() {
    const [postsResponse, commentsResponse] = await Promise.all([
      supabase.from('posts').select('*').limit(100),
      supabase.from('comments').select('*').limit(200),
    ]);

    setPosts((postsResponse.data ?? []) as Post[]);
    setComments((commentsResponse.data ?? []) as Comment[]);
  }

  useEffect(() => {
    let cancelled = false;

    async function loadModerationData() {
      setLoading(true);

      const [reportsResponse, postsResponse, commentsResponse] = await Promise.all([
        supabase.from('reports').select('*').order('created_at', { ascending: false }).limit(100),
        supabase.from('posts').select('*').limit(100),
        supabase.from('comments').select('*').limit(200),
      ]);

      if (cancelled) return;

      if (reportsResponse.error) {
        if (reportsResponse.error.message.includes('public.reports')) {
          setMissingReportsTable(true);
          setErrorMessage('');
        } else {
          setErrorMessage(reportsResponse.error.message);
        }
        setReports([]);
      } else {
        setMissingReportsTable(false);
        const nextReports = (reportsResponse.data ?? []) as ReportRecord[];
        setReports(nextReports);
        setModerationNotes(Object.fromEntries(nextReports.map((report) => [report.id, report.moderation_notes ?? ''])));
      }

      setPosts((postsResponse.data ?? []) as Post[]);
      setComments((commentsResponse.data ?? []) as Comment[]);
      setLoading(false);
    }

    void loadModerationData();

    return () => {
      cancelled = true;
    };
  }, []);

  const targets = useMemo(() => {
    const lookup = new Map<string, ModerationTarget>();

    posts.forEach((post) => {
      lookup.set(`post:${post.id}`, {
        headline: post.title,
        body: post.body,
        author: post.author,
      });
    });

    comments.forEach((comment) => {
      lookup.set(`comment:${comment.id}`, {
        headline: `Reply in thread ${comment.post_id}`,
        body: comment.body,
        author: comment.author,
        postId: comment.post_id,
      });
    });

    return lookup;
  }, [comments, posts]);

  const reportCounts = useMemo(() => {
    return {
      all: reports.length,
      open: reports.filter((report) => report.status === 'open').length,
      reviewed: reports.filter((report) => report.status === 'reviewed').length,
      dismissed: reports.filter((report) => report.status === 'dismissed').length,
    };
  }, [reports]);

  const filteredReports = useMemo(() => {
    if (statusFilter === 'all') {
      return reports;
    }

    return reports.filter((report) => report.status === statusFilter);
  }, [reports, statusFilter]);

  async function updateReportStatus(reportId: string, status: 'reviewed' | 'dismissed') {
    setUpdatingReportId(reportId);

    const { error } = await supabase.from('reports').update({ status }).eq('id', reportId);

    if (error) {
      setErrorMessage(error.message);
      setUpdatingReportId(null);
      return;
    }

    await refreshReports();
    setUpdatingReportId(null);
  }

  async function saveModerationNotes(reportId: string) {
    setUpdatingReportId(reportId);

    const { error } = await supabase.from('reports').update({ moderation_notes: moderationNotes[reportId] ?? '' }).eq('id', reportId);

    if (error) {
      setErrorMessage(error.message);
      setUpdatingReportId(null);
      return;
    }

    await refreshReports();
    setUpdatingReportId(null);
  }

  async function updateTargetVisibility(report: ReportRecord, hidden: boolean) {
    const targetKey = `${report.target_type}:${report.target_id}`;
    setUpdatingTargetKey(targetKey);

    const targetTable = report.target_type === 'post' ? 'posts' : 'comments';
    const targetPayload = hidden
      ? {
          hidden: true,
          hidden_at: new Date().toISOString(),
          hidden_by: user?.email ?? 'moderator',
          hidden_reason: report.reason,
        }
      : {
          hidden: false,
          hidden_at: null,
          hidden_by: null,
          hidden_reason: null,
        };

    const { error } = await supabase.from(targetTable).update(targetPayload).eq('id', report.target_id);

    if (error) {
      setErrorMessage(error.message);
      setUpdatingTargetKey(null);
      return;
    }

    if (hidden) {
      const reportResponse = await supabase.from('reports').update({ status: 'reviewed' }).eq('id', report.id);

      if (reportResponse.error) {
        setErrorMessage(reportResponse.error.message);
        setUpdatingTargetKey(null);
        return;
      }
    }

    await Promise.all([refreshReports(), refreshTargets()]);
    setUpdatingTargetKey(null);
  }

  return (
    <main style={{ maxWidth: 1220, margin: '0 auto', padding: '1.4rem 1.2rem 5rem' }}>
      <section className="hero-panel panel" style={{ borderRadius: 28, padding: '1.2rem', marginBottom: '1rem' }}>
        <div className="hero-grid">
          <div className="brief-stage">
            <div className="stage-panel" style={{ padding: '1.35rem' }}>
              <p className="luxury-kicker" style={{ marginBottom: 10 }}>Moderation desk</p>
              <div className="editorial-meta" style={{ marginBottom: 12 }}>
                <span>Reports</span>
                <span>Hide / unhide</span>
                <span>Internal notes</span>
              </div>
              <h1 style={{ fontSize: '3rem', lineHeight: 0.9, color: 'var(--ink)', marginBottom: 12, maxWidth: 780 }}>
                Review flagged content from a desk that feels deliberate, not like an admin leftover.
              </h1>
              <p style={{ color: 'var(--muted)', maxWidth: 760, fontSize: 14, marginBottom: 18 }}>
                This is the first-pass queue for user reports. It surfaces enough thread context to decide quickly, then lets moderators leave notes and adjust visibility without losing the editorial feel of the product.
              </p>
              <div className="stage-summary">
                <div className="summary-puck">
                  <strong>{reportCounts.open}</strong>
                  <span>open reports</span>
                </div>
                <div className="summary-puck">
                  <strong>{reportCounts.reviewed}</strong>
                  <span>reviewed</span>
                </div>
                <div className="summary-puck">
                  <strong>{reportCounts.dismissed}</strong>
                  <span>dismissed</span>
                </div>
              </div>
            </div>
          </div>

          <div className="hero-aside">
            <div className="hero-signal vellum">
              <div className="aside-card-title" style={{ marginBottom: 8 }}>Desk filters</div>
              <div className="editorial-sort-row" style={{ flexWrap: 'wrap', borderRadius: 18 }}>
                {(['open', 'all', 'reviewed', 'dismissed'] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setStatusFilter(filter)}
                    className={`editorial-sort-tab${statusFilter === filter ? ' active' : ''}`}
                  >
                    {filter} {reportCounts[filter]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {authLoading ? (
        <div style={{ color: 'var(--muted)' }}>Checking moderator access...</div>
      ) : !moderatorEmails.length ? (
        <div className="mini-live-card">
          <div className="mini-live-label">Allowlist missing</div>
          <div className="mini-live-copy">
            Add `NEXT_PUBLIC_MODERATOR_EMAILS=you@example.com` to [.env.local](C:/Users/harsh/casebook-chat/.env.local) and restart the dev server.
          </div>
        </div>
      ) : !isModerator ? (
        <div className="mini-live-card">
          <div className="mini-live-label">Moderator access required</div>
          <div className="mini-live-copy">Sign in with an allowlisted moderator account to review reports.</div>
        </div>
      ) : loading ? (
        <div style={{ color: 'var(--muted)' }}>Loading moderation queue...</div>
      ) : missingReportsTable ? (
        <div className="mini-live-card">
          <div className="mini-live-label">Reports backend missing</div>
          <div className="mini-live-copy">
            Run [reports_setup.sql](C:/Users/harsh/casebook-chat/supabase/reports_setup.sql) in Supabase, then reload this page.
          </div>
        </div>
      ) : errorMessage ? (
        <div style={{ background: '#FAEAEA', border: '1px solid #E8C4C4', borderRadius: 12, padding: '1rem', color: 'var(--red)' }}>
          {errorMessage}
        </div>
      ) : filteredReports.length === 0 ? (
        <div className="mini-live-card">
          <div className="mini-live-label">Quiet desk</div>
          <div className="mini-live-copy">No {statusFilter} reports right now.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {filteredReports.map((report) => {
            const target = targets.get(`${report.target_type}:${report.target_id}`);
            const targetKey = `${report.target_type}:${report.target_id}`;
            const sourceRecord =
              report.target_type === 'post'
                ? posts.find((post) => post.id === report.target_id)
                : comments.find((comment) => comment.id === report.target_id);
            const targetHidden = !!sourceRecord?.hidden;

            return (
              <article key={report.id} className="post-card vellum" style={{ borderRadius: 24, padding: '1.1rem', clipPath: 'none' }}>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: 11, borderRadius: 999, padding: '4px 9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', background: '#FAEAEA', color: 'var(--red)' }}>
                    {report.reason}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {report.target_type} reported {formatTimeAgo(report.created_at)}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 'auto' }}>
                    status: {report.status}
                  </span>
                  {targetHidden ? (
                    <span style={{ fontSize: 11, borderRadius: 999, padding: '4px 9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', background: 'var(--ink)', color: '#F5F0EC' }}>
                      hidden
                    </span>
                  ) : null}
                </div>

                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontFamily: 'var(--font-display), serif', fontSize: '1.4rem', color: 'var(--ink)', marginBottom: 4 }}>
                    {target?.headline ?? 'Original content unavailable'}
                  </div>
                  <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 8 }}>
                    by {getAnonymousHandle(target?.author ?? 'anonymous')}
                  </div>
                  <div className="mini-live-card">
                    <div className="mini-live-copy">{target?.body || 'This content may have been deleted or is outside the loaded window.'}</div>
                  </div>
                  {targetHidden ? (
                    <div style={{ marginTop: 8, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '0.7rem', color: 'var(--muted)', fontSize: 12 }}>
                      Hidden {sourceRecord?.hidden_at ? formatTimeAgo(sourceRecord.hidden_at) : 'recently'}
                      {sourceRecord?.hidden_by ? ` by ${getAnonymousHandle(sourceRecord.hidden_by)}` : ''}
                      {sourceRecord?.hidden_reason ? ` for ${sourceRecord.hidden_reason}` : ''}.
                    </div>
                  ) : null}
                </div>

                {report.details ? (
                  <div className="mini-live-card" style={{ marginBottom: 10 }}>
                    <div className="mini-live-label">Reporter note</div>
                    <div className="mini-live-copy">{report.details}</div>
                  </div>
                ) : null}

                <div style={{ marginBottom: 10 }}>
                  <div className="mini-live-label" style={{ marginBottom: 6 }}>Moderator note</div>
                  <textarea
                    value={moderationNotes[report.id] ?? ''}
                    onChange={(event) =>
                      setModerationNotes((currentNotes) => ({
                        ...currentNotes,
                        [report.id]: event.target.value,
                      }))
                    }
                    placeholder="Internal note for follow-up or context."
                    style={{
                      width: '100%',
                      minHeight: 88,
                      border: '1px solid var(--border)',
                      borderRadius: 16,
                      padding: '10px 12px',
                      background: 'rgba(255,253,247,.82)',
                      resize: 'vertical',
                    }}
                  />
                </div>

                {report.target_type === 'post' || target?.postId ? (
                  <Link href={`/?thread=${report.target_type === 'post' ? report.target_id : target?.postId}`} style={{ color: 'var(--accent)', textDecoration: 'none', fontSize: 13 }}>
                    Open thread
                  </Link>
                ) : null}

                <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => void saveModerationNotes(report.id)}
                    disabled={updatingReportId === report.id}
                    style={{
                      border: '1px solid var(--border)',
                      background: 'var(--surface)',
                      color: 'var(--text)',
                      padding: '8px 12px',
                      borderRadius: 999,
                      opacity: updatingReportId === report.id ? 0.7 : 1,
                    }}
                  >
                    Save note
                  </button>
                  <button
                    onClick={() => void updateReportStatus(report.id, 'reviewed')}
                    disabled={updatingReportId === report.id}
                    style={{
                      border: '1px solid var(--border)',
                      background: 'var(--bg)',
                      color: 'var(--text)',
                      padding: '8px 12px',
                      borderRadius: 999,
                      opacity: updatingReportId === report.id ? 0.7 : 1,
                    }}
                  >
                    Mark reviewed
                  </button>
                  <button
                    onClick={() => void updateReportStatus(report.id, 'dismissed')}
                    disabled={updatingReportId === report.id}
                    style={{
                      border: '1px solid var(--border)',
                      background: 'transparent',
                      color: 'var(--muted)',
                      padding: '8px 12px',
                      borderRadius: 999,
                      opacity: updatingReportId === report.id ? 0.7 : 1,
                    }}
                  >
                    Dismiss
                  </button>
                  <button
                    onClick={() => void updateTargetVisibility(report, !targetHidden)}
                    disabled={updatingTargetKey === targetKey}
                    className={targetHidden ? '' : 'button-primary'}
                    style={{
                      border: targetHidden ? '1px solid var(--border)' : 'none',
                      background: targetHidden ? 'var(--surface)' : undefined,
                      color: targetHidden ? 'var(--text)' : undefined,
                      padding: '8px 12px',
                      borderRadius: 999,
                      opacity: updatingTargetKey === targetKey ? 0.7 : 1,
                    }}
                  >
                    {targetHidden ? 'Unhide content' : 'Hide content'}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
